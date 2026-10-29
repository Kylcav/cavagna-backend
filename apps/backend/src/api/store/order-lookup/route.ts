import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * Recherche de commande pour un invité (sans compte).
 * POST /store/order-lookup  { display_id, email }
 *
 * Sécurité : il faut CONNAITRE le numéro ET l'e-mail exact de la commande.
 * Toute combinaison invalide renvoie 404 (jamais d'indice sur l'existence
 * d'un numéro) pour éviter l'énumération. Aucune donnée de paiement renvoyée.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as { display_id?: unknown; email?: unknown }

  const rawId = `${body.display_id ?? ""}`.replace(/[^0-9]/g, "") // "#1360" -> "1360"
  const email = `${body.email ?? ""}`.trim().toLowerCase()
  const displayId = Number(rawId)

  if (!rawId || !Number.isFinite(displayId) || !email) {
    return res
      .status(400)
      .json({ message: "Numéro de commande et e-mail requis." })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: orders } = await query.graph({
    entity: "order",
    // display_id est un entier en base ; le typage du filtre attend une string,
    // donc on caste (le nombre fonctionne au runtime pour la comparaison SQL).
    filters: { display_id: displayId } as any,
    fields: [
      "id",
      "display_id",
      "email",
      "currency_code",
      "status",
      "created_at",
      "total",
      "subtotal",
      "shipping_total",
      "shipping_address.first_name",
      "shipping_address.last_name",
      "shipping_address.address_1",
      "shipping_address.postal_code",
      "shipping_address.city",
      "shipping_address.country_code",
      "shipping_methods.name",
      "items.title",
      "items.quantity",
      "items.unit_price",
      "items.total",
      "items.thumbnail",
      "items.variant.title",
      "items.variant.options.value",
      "items.product.metadata",
      "fulfillments.shipped_at",
      "fulfillments.delivered_at",
      "fulfillments.labels.tracking_number",
      "fulfillments.labels.tracking_url",
    ],
  })

  const order = orders?.find(
    (o: any) => (o?.email || "").trim().toLowerCase() === email
  )

  if (!order) {
    // Volontairement 404 générique (ni "numéro inconnu" ni "e-mail faux").
    return res
      .status(404)
      .json({ message: "Aucune commande ne correspond à ce numéro et cet e-mail." })
  }

  // Statut lisible pour le client (dropshipping : suivi dispo après expédition).
  const fulfillments = (order as any).fulfillments || []
  const shipped = fulfillments.some((f: any) => f?.shipped_at)
  const delivered = fulfillments.some((f: any) => f?.delivered_at)
  const tracking = fulfillments
    .flatMap((f: any) => f?.labels || [])
    .map((l: any) => ({
      number: l?.tracking_number,
      url: l?.tracking_url,
    }))
    .filter((t: any) => t.number)

  const statusLabel = delivered
    ? "Livrée"
    : shipped
    ? "Expédiée"
    : "En préparation"

  return res.json({
    order: {
      display_id: (order as any).display_id,
      email: (order as any).email,
      currency_code: (order as any).currency_code,
      created_at: (order as any).created_at,
      total: (order as any).total,
      subtotal: (order as any).subtotal,
      shipping_total: (order as any).shipping_total,
      shipping_address: (order as any).shipping_address,
      shipping_methods: (order as any).shipping_methods,
      items: (order as any).items,
      status_label: statusLabel,
      tracking,
    },
  })
}
