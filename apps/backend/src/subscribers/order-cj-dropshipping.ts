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
    const vid = meta.cj_vid ? String(meta.cj_vid) : undefined
    const sku = meta.cj_sku
      ? String(meta.cj_sku)
      : item?.variant?.sku || item?.variant_sku || undefined

    if (!vid && !sku) continue // article non dropshippé CJ -> ignoré

    products.push({
      vid,
      sku: vid ? undefined : sku, // si on a le vid, on n'envoie pas le sku
      quantity: item.quantity,
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
