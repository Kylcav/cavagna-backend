import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import { getCjAccessToken } from "../lib/cj-dropshipping"

/**
 * Enrichit les fiches produit avec les vraies infos CJdropshipping :
 * dimensions, poids, matière + une liste de caractéristiques (metadata.specs)
 * affichée dans l'onglet "Informations produit".
 *
 * Ne touche QUE les produits qui portent metadata.cj_pid. Les champs absents
 * chez CJ ne sont pas inventés (pas de "-").
 *
 * Lancer :  npx medusa exec ./src/scripts/enrich-products.ts
 */

const API_BASE =
  process.env.CJ_API_BASE?.replace(/\/$/, "") ||
  "https://developers.cjdropshipping.com/api2.0/v1"

async function cjQuery(pid: string, token: string): Promise<any> {
  const res = await fetch(`${API_BASE}/product/query?pid=${pid}`, {
    headers: { "CJ-Access-Token": token },
  })
  const json = await res.json()
  return json?.data ?? null
}

const num = (v: any): number | null => {
  const n = parseFloat(String(v ?? "").split("-")[0].trim())
  return Number.isFinite(n) && n > 0 ? n : null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default async function enrichProducts({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const token = await getCjAccessToken()

  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "metadata",
      "variants.id",
      "variants.metadata",
    ],
  })

  let done = 0
  for (const p of products as any[]) {
    const pid = p.metadata?.cj_pid
    if (!pid) continue

    let data: any
    try {
      data = await cjQuery(String(pid), token)
    } catch (e: any) {
      logger.warn(`CJ query échec ${p.title}: ${e?.message || e}`)
      await sleep(1500)
      continue
    }
    if (!data) {
      await sleep(1500)
      continue
    }

    const cjVariants: any[] = data.variants || []
    // Variante CJ correspondant au cj_vid du produit (sinon la 1re).
    const mappedVid = p.variants?.[0]?.metadata?.cj_vid
    const cjv =
      cjVariants.find((v) => String(v.vid) === String(mappedVid)) ||
      cjVariants[0] ||
      {}

    // Dimensions (mm -> cm) depuis la variante.
    const L = num(cjv.variantLength)
    const W = num(cjv.variantWidth)
    const H = num(cjv.variantHeight)
    const toCm = (mm: number | null) =>
      mm ? Math.round((mm / 10) * 10) / 10 : null
    const lCm = toCm(L)
    const wCm = toCm(W)
    const hCm = toCm(H)

    // Poids (g) : variante sinon produit.
    const weightG = num(cjv.variantWeight) || num(data.productWeight)

    // Matière.
    let material: string | null = null
    const matArr = data.materialNameEn
    if (Array.isArray(matArr) && matArr.length) material = matArr.join(", ")
    else if (typeof matArr === "string" && matArr.trim()) material = matArr

    // Liste de caractéristiques affichée sur le site (que du non-vide).
    const specs: { label: string; value: string }[] = []
    if (lCm && wCm && hCm)
      specs.push({ label: "Dimensions", value: `${lCm} × ${wCm} × ${hCm} cm` })
    if (weightG)
      specs.push({
        label: "Poids",
        value: weightG >= 1000 ? `${(weightG / 1000).toFixed(1)} kg` : `${Math.round(weightG)} g`,
      })
    if (material) specs.push({ label: "Matière", value: material })

    // Options disponibles (couleurs / tailles) listées chez CJ.
    const optAxis = (data.productKeyEn || "").toLowerCase()
    const optLabel = optAxis.includes("size")
      ? "Tailles disponibles"
      : optAxis.includes("color")
        ? "Coloris disponibles"
        : "Variantes"
    const opts = Array.from(
      new Set(
        cjVariants
          .map((v) => (v.variantKey || v.variantNameEn || "").toString().trim())
          .filter(Boolean)
      )
    )
    if (opts.length > 1 && opts.length <= 15)
      specs.push({ label: optLabel, value: opts.join(", ") })

    // Mise à jour du produit : champs natifs + metadata.specs.
    const update: any = {
      id: p.id,
      metadata: { ...(p.metadata || {}), specs },
      origin_country: "CN",
    }
    if (weightG) update.weight = Math.round(weightG)
    if (lCm) update.length = Math.round(lCm)
    if (wCm) update.width = Math.round(wCm)
    if (hCm) update.height = Math.round(hCm)
    if (material) update.material = material

    await updateProductsWorkflow(container).run({ input: { products: [update] } })
    done++
    logger.info(
      `✅ ${p.title} enrichi (${specs.map((s) => s.label).join(", ") || "aucune spec CJ"}).`
    )
    await sleep(1200) // respecte le rate-limit CJ
  }

  logger.info(`🎁 Enrichissement terminé : ${done} produits mis à jour.`)
}
