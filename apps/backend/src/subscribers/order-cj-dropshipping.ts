import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createCjOrder, type CjOrderProduct } from "../lib/cj-dropshipping"

/**
 * Synchronise les commandes vers CJdropshipping.
 *
 * À la création d'une commande (order.placed), on crée la commande fournisseur
 * chez CJ pour chaque article MAPPÉ à un produit CJ (via les metadata de la
 * variante : `cj_vid` et/ou `cj_sku`). Les articles non mappés (maillots,
 * casquettes…) sont ignorés : la commande n'est PAS envoyée à CJ.
 *
 * Idempotent : si `order.metadata.cj_order_id` existe déjà, on ne refait rien.
 *
 * Config (.env) :
 *   CJ_API_KEY              clé API CJ (obligatoire pour activer l'envoi)
 *   CJ_FROM_COUNTRY_CODE    entrepôt d'expédition, défaut "CN"
 *   CJ_LOGISTIC_NAME        mode logistique CJ, défaut "CJPacket Ordinary"
 *   CJ_PAY_TYPE             2 = payer depuis la balance CJ, 3 = créer sans payer (défaut)
 */

// Code pays -> nom complet (CJ exige shippingCountry en toutes lettres).
const COUNTRY_NAMES: Record<string, string> = {
  CH: "Switzerland",
  FR: "France",
  BE: "Belgium",
  DE: "Germany",
  IT: "Italy",
  ES: "Spain",
  AT: "Austria",
  LU: "Luxembourg",
  NL: "Netherlands",
  PT: "Portugal",
}

// Taie en soie (/soie) : nom de coloris affiché -> VID CJ (id de variante).
// CJ createOrderV2 attend un VID. Sert à résoudre la 2e couleur d'un "Lot de 2"
// bicolore (stockée en metadata de ligne par le storefront) pour l'envoyer
// automatiquement à CJ.
const SOIE_COLOR_CJVID: Record<string, string> = {
  "Blanc nacré": "26DABF97-DB06-4913-BFD7-58D4C6B3D838",
  Champagne: "41DCEC1F-98D1-4C52-8F6B-6A1834056599",
  "Or rose": "3C1E75A2-5A8F-4267-88DE-B1EF67E462D5",
  "Rose poudré": "9B4C5177-3756-4819-8A97-BBB82BDD542C",
  Rose: "D769106F-6384-4B6D-AC6E-84E5C0172558",
  "Gris perle": "C323E94B-E2E7-4452-B0DA-C4757113692F",
  "Gris anthracite": "B9DCC132-64AD-4597-B75E-49270703356A",
  "Bleu nuit": "B4B9115C-ABC8-4824-BB02-5D2DF30E0030",
  "Bleu paon": "C84A6096-D785-4545-BFD6-B9E20797A051",
  Émeraude: "E58D7472-94EE-4568-AECF-ECCFB993B2F8",
  Terracotta: "394F73C7-C9A0-45EC-B08E-5D55788CB68F",
  "Rouge rubis": "FACD0B44-B97E-4E78-AC8C-B0091F4F1952",
}

export default async function orderCjDropshippingHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  if (!process.env.CJ_API_KEY) {
    // Intégration présente mais non activée tant que la clé n'est pas renseignée.
    return
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "metadata",
      "shipping_address.first_name",
      "shipping_address.last_name",
      "shipping_address.address_1",
      "shipping_address.address_2",
      "shipping_address.city",
      "shipping_address.province",
      "shipping_address.postal_code",
      "shipping_address.country_code",
      "shipping_address.phone",
      "items.id",
      "items.quantity",
      "items.metadata",
      "items.variant_sku",
      "items.variant.id",
      "items.variant.sku",
      "items.variant.metadata",
    ],
    filters: { id: event.data.id },
  })

  const order = data[0]
  if (!order) return

  // Anti-doublon : commande déjà envoyée à CJ.
  if (order.metadata?.cj_order_id) {
    logger.info(
      `CJ : commande ${order.display_id} déjà synchronisée (${order.metadata.cj_order_id}), ignorée`
    )
    return
  }

  // Ne garder que les articles mappés à un produit CJ.
  const products: CjOrderProduct[] = []
  for (const item of order.items || []) {
    if (!item) continue
    const meta = (item?.variant?.metadata || {}) as Record<string, any>
    const lineMeta = (item?.metadata || {}) as Record<string, any>
    const vid = meta.cj_vid ? String(meta.cj_vid) : undefined
    const sku = meta.cj_sku
      ? String(meta.cj_sku)
      : item?.variant?.sku || item?.variant_sku || undefined

    if (!vid && !sku) continue // article non dropshippé CJ -> ignoré

    const lineQty = item.quantity || 1
    // cj_qty : nombre d'unités CJ par article vendu (ex. "Lot de 2" -> 2).
    const cjQty = Math.max(1, Number(meta.cj_qty) || 1)

    // Lot de 2 bicolore : la 2e couleur (metadata de ligne du storefront)
    // diffère de la 1re -> on envoie 1 de chaque couleur à CJ, automatiquement.
    const couleur1 = lineMeta.couleur_1 ? String(lineMeta.couleur_1) : undefined
    const couleur2 = lineMeta.couleur_2 ? String(lineMeta.couleur_2) : undefined
    const vid2 =
      couleur2 && couleur2 !== couleur1
        ? SOIE_COLOR_CJVID[couleur2]
        : undefined

    // Lot de 2 bicolore : 1x couleur 1 (vid de la variante) + 1x couleur 2
    // (vid mappé), par article vendu. Entièrement automatique.
    if (cjQty === 2 && vid && vid2) {
      products.push({ vid, quantity: lineQty, storeLineItemId: item.id })
      products.push({
        vid: vid2,
        quantity: lineQty,
        storeLineItemId: `${item.id}-2`,
      })
      continue
    }

    products.push({
      vid,
      sku: vid ? undefined : sku, // si on a le vid, on n'envoie pas le sku
      quantity: lineQty * cjQty, // honore "Lot de 2" (même couleur) -> 2 unités
      storeLineItemId: item.id,
    })
  }

  if (products.length === 0) {
    logger.info(
      `CJ : aucun article CJ dans la commande ${order.display_id}, rien à synchroniser`
    )
    return
  }

  const addr = order.shipping_address
  if (!addr) {
    logger.warn(`CJ : commande ${order.display_id} sans adresse de livraison`)
    return
  }

  const countryCode = (addr.country_code || "").toUpperCase()
  const customerName =
    [addr.first_name, addr.last_name].filter(Boolean).join(" ").trim() ||
    "Client"

  try {
    const result = await createCjOrder({
      orderNumber: String(order.display_id ?? order.id),
      shippingCountryCode: countryCode,
      shippingCountry: COUNTRY_NAMES[countryCode] || countryCode,
      // CJ exige une province : on retombe sur la ville si absente.
      shippingProvince: addr.province || addr.city || "-",
      shippingCity: addr.city || "-",
      shippingCustomerName: customerName,
      shippingAddress: addr.address_1 || "-",
      shippingAddress2: addr.address_2 || undefined,
      shippingZip: addr.postal_code || undefined,
      shippingPhone: addr.phone || undefined,
      email: order.email || undefined,
      remark: `Commande cavagna.shop #${order.display_id ?? order.id}`,
      logisticName: process.env.CJ_LOGISTIC_NAME || "CJPacket Ordinary",
      fromCountryCode: process.env.CJ_FROM_COUNTRY_CODE || "CN",
      payType: Number(process.env.CJ_PAY_TYPE || "3"),
      products,
    })

    const cjOrderId =
      result?.orderId || result?.orderNum || result?.cjOrderId || "créé"

    // Sauvegarde l'id CJ dans la commande Medusa (anti-doublon + suivi).
    const orderModule = container.resolve(Modules.ORDER)
    await orderModule.updateOrders([
      {
        id: order.id,
        metadata: {
          ...(order.metadata || {}),
          cj_order_id: cjOrderId,
          cj_synced_at: new Date().toISOString(),
        },
      },
    ])

    logger.info(
      `CJ : commande ${order.display_id} synchronisée -> CJ ${cjOrderId}`
    )
  } catch (err: any) {
    // On ne bloque jamais la commande client ni l'email de confirmation.
    logger.error(
      `CJ : échec de synchro de la commande ${order.display_id} : ${err?.message || err}`
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
