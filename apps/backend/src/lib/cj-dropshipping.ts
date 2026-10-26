import fs from "fs"
import os from "os"
import path from "path"

/**
 * Client minimal pour l'API CJdropshipping 2.0.
 *
 * Auth : POST /authentication/getAccessToken { apiKey }  -> accessToken (180 j)
 *        Le même token est renvoyé pour les appels répétés dans les 24 h.
 *        On met donc le token en cache dans un fichier pour éviter de le
 *        redemander à chaque commande (et pour survivre aux redémarrages PM2).
 *
 * Commande : POST /shopping/order/createOrderV2 (header CJ-Access-Token).
 *
 * Doc : https://developers.cjdropshipping.com/en/api/api2/
 */

const API_BASE =
  process.env.CJ_API_BASE?.replace(/\/$/, "") ||
  "https://developers.cjdropshipping.com/api2.0/v1"

const TOKEN_CACHE_PATH =
  process.env.CJ_TOKEN_CACHE_PATH ||
  path.join(os.tmpdir(), "cj-dropshipping-token.json")

const SAFETY_MARGIN_MS = 5 * 60 * 1000 // on renouvelle 5 min avant l'expiration

type CjTokenCache = {
  accessToken: string
  accessTokenExpiry: number // epoch ms
  refreshToken?: string
  refreshTokenExpiry?: number // epoch ms
}

export class CjError extends Error {
  code?: number
  constructor(message: string, code?: number) {
    super(message)
    this.name = "CjError"
    this.code = code
  }
}

const parseExpiry = (value?: string): number => {
  if (!value) return Date.now() + 23 * 60 * 60 * 1000 // repli : 23 h
  // CJ renvoie du "YYYY-MM-DD HH:mm:ss" (heure de Chine) ou ISO selon l'endpoint.
  const normalized = value.includes("T") ? value : value.replace(" ", "T")
  const ms = Date.parse(normalized)
  return Number.isNaN(ms) ? Date.now() + 23 * 60 * 60 * 1000 : ms
}

const readCache = (): CjTokenCache | null => {
  try {
    const raw = fs.readFileSync(TOKEN_CACHE_PATH, "utf-8")
    return JSON.parse(raw) as CjTokenCache
  } catch {
    return null
  }
}

const writeCache = (cache: CjTokenCache) => {
  try {
    fs.writeFileSync(TOKEN_CACHE_PATH, JSON.stringify(cache), "utf-8")
  } catch (err) {
    console.warn("CJ : impossible d'écrire le cache token:", err)
  }
}

/** Appel brut à l'API CJ. Lève CjError si code != 200 ou result != true. */
const cjFetch = async (
  endpoint: string,
  body: Record<string, unknown>,
  accessToken?: string
): Promise<any> => {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { "CJ-Access-Token": accessToken } : {}),
    },
    body: JSON.stringify(body),
  })

  let json: any
  try {
    json = await res.json()
  } catch {
    throw new CjError(`CJ ${endpoint} : réponse non-JSON (HTTP ${res.status})`)
  }

  // CJ encapsule tout dans { code, result, message, data }
  if (json?.result === false || (json?.code && json.code !== 200)) {
    throw new CjError(
      `CJ ${endpoint} : ${json?.message || "erreur inconnue"}`,
      json?.code
    )
  }

  return json?.data ?? json
}

const fetchFreshToken = async (): Promise<CjTokenCache> => {
  const apiKey = process.env.CJ_API_KEY
  if (!apiKey) {
    throw new CjError("CJ_API_KEY manquant dans l'environnement")
  }

  const data = await cjFetch("/authentication/getAccessToken", { apiKey })

  return {
    accessToken: data.accessToken,
    accessTokenExpiry: parseExpiry(data.accessTokenExpiryDate),
    refreshToken: data.refreshToken,
    refreshTokenExpiry: parseExpiry(data.refreshTokenExpiryDate),
  }
}

const refreshToken = async (refresh: string): Promise<CjTokenCache> => {
  const data = await cjFetch("/authentication/refreshAccessToken", {
    refreshToken: refresh,
  })

  return {
    accessToken: data.accessToken,
    accessTokenExpiry: parseExpiry(data.accessTokenExpiryDate),
    refreshToken: data.refreshToken,
    refreshTokenExpiry: parseExpiry(data.refreshTokenExpiryDate),
  }
}

/** Renvoie un access token valide (cache fichier -> refresh -> login). */
export const getCjAccessToken = async (): Promise<string> => {
  const now = Date.now()
  const cached = readCache()

  if (cached && cached.accessTokenExpiry - SAFETY_MARGIN_MS > now) {
    return cached.accessToken
  }

  // Token d'accès expiré : tenter un refresh si le refreshToken est encore bon.
  if (
    cached?.refreshToken &&
    cached.refreshTokenExpiry &&
    cached.refreshTokenExpiry - SAFETY_MARGIN_MS > now
  ) {
    try {
      const refreshed = await refreshToken(cached.refreshToken)
      writeCache(refreshed)
      return refreshed.accessToken
    } catch (err) {
      console.warn("CJ : refresh token échoué, nouveau login:", err)
    }
  }

  const fresh = await fetchFreshToken()
  writeCache(fresh)
  return fresh.accessToken
}

export type CjOrderProduct = {
  vid?: string
  sku?: string
  quantity: number
  storeLineItemId?: string
}

export type CjCreateOrderInput = {
  orderNumber: string
  shippingCountryCode: string
  shippingCountry: string
  shippingProvince: string
  shippingCity: string
  shippingCustomerName: string
  shippingAddress: string
  shippingAddress2?: string
  shippingZip?: string
  shippingPhone?: string
  houseNumber?: string
  email?: string
  remark?: string
  logisticName: string
  fromCountryCode: string
  /** 2 = payé depuis la balance CJ, 3 = créer la commande seule (pas de paiement auto). */
  payType?: number
  products: CjOrderProduct[]
}

/** Crée une commande chez CJ. Renvoie le `data` brut (orderId, orderNum, etc.). */
export const createCjOrder = async (input: CjCreateOrderInput): Promise<any> => {
  const token = await getCjAccessToken()

  const payload: Record<string, unknown> = {
    orderNumber: input.orderNumber,
    shippingCountryCode: input.shippingCountryCode,
    shippingCountry: input.shippingCountry,
    shippingProvince: input.shippingProvince,
    shippingCity: input.shippingCity,
    shippingCustomerName: input.shippingCustomerName,
    shippingAddress: input.shippingAddress,
    shippingAddress2: input.shippingAddress2,
    shippingZip: input.shippingZip,
    shippingPhone: input.shippingPhone,
    houseNumber: input.houseNumber,
    email: input.email,
    remark: input.remark,
    logisticName: input.logisticName,
    fromCountryCode: input.fromCountryCode,
    payType: input.payType ?? 3,
    products: input.products,
  }

  // Nettoie les champs undefined
  Object.keys(payload).forEach(
    (k) => payload[k] === undefined && delete payload[k]
  )

  return cjFetch("/shopping/order/createOrderV2", payload, token)
}
