import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Resend } from "resend"

const ADMIN_EMAIL = "contact@mizucat.ch"

export default async function commandHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const resendApiKey = process.env.RESEND_API_KEY || process.env.RESEND_API
  const from = process.env.RESEND_FROM_EMAIL

  if (!resendApiKey || !from) {
    console.warn("Configuration Resend manquante.")
    return
  }

  const query = container.resolve("query")

  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "currency_code",
      "total",
      "shipping_address.*",
      "shipping_methods.name",
      "items.title",
      "items.quantity",
    ],
    filters: {
      id: event.data.id,
    },
  })

  const order = data[0]

  if (!order) return

  const resend = new Resend(resendApiKey)

  await resend.emails.send({
    from,
    to: ADMIN_EMAIL,
    subject: `Nouvelle commande MizuCat #${order.display_id || order.id}`,
    html: `
      <h1>Nouvelle commande MizuCat</h1>

      <p><strong>Commande :</strong> #${order.display_id || order.id}</p>
      <p><strong>Client :</strong> ${order.email || "-"}</p>
      <p><strong>Total :</strong> ${order.total} ${order.currency_code}</p>

      <h2>Adresse de livraison</h2>
      <p>
        ${order.shipping_address?.first_name || ""} ${order.shipping_address?.last_name || ""}<br />
        ${order.shipping_address?.address_1 || ""}<br />
        ${order.shipping_address?.postal_code || ""} ${order.shipping_address?.city || ""}<br />
        ${order.shipping_address?.country_code || ""}
      </p>

      <h2>Produits</h2>
      <ul>
        ${
          order.items
            ?.map(
              (item: any) =>
                `<li>${item.title} — Quantité : ${item.quantity}</li>`
            )
            .join("") || ""
        }
      </ul>

      <h2>Livraison</h2>
      <p>${order.shipping_methods?.[0]?.name || "-"}</p>
    `,
  })
}

export const config: SubscriberConfig = {
  event: "order.placed",
}