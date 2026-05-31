import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Resend } from "resend"

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")

const formatImageUrl = (url?: string) => {
  if (!url) return ""

  if (url.startsWith("http")) {
    return url
  }

  const backendUrl = process.env.BACKEND_URL || "http://localhost:9000"

  return `${backendUrl}${url.startsWith("/") ? url : `/${url}`}`
}

export default async function orderPlacedHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const resend = new Resend(process.env.RESEND_API_KEY)
  const query = container.resolve("query")

  const { data } = await query.graph({
    entity: "order",
    fields: [
  "id",
  "display_id",
  "email",
  "currency_code",
  "total",
  "shipping_address.country_code",
  "shipping_methods.name",
  "items.title",
  "items.quantity",
  "items.thumbnail",
  "items.variant.images.url",
  "items.product.images.url",
],
    filters: {
      id: event.data.id,
    },
  })

  const order = data[0]

  if (!order?.email) {
    console.log("Aucun email client trouvé pour la commande")
    return
  }

  const storeUrl = process.env.STORE_URL || "http://localhost:8000"
  const cleanStoreUrl = storeUrl.replace(/\/$/, "")
const countryCode =
  order.shipping_address?.country_code?.toLowerCase() ||
  process.env.STORE_COUNTRY_CODE ||
  "ch"

const orderUrl = `${cleanStoreUrl}/${countryCode}/account`

  const deliveryEstimate = escapeHtml(
    order.shipping_methods?.[0]?.name || "Livraison standard"
  )

  const itemsHtml =
    order.items
      ?.filter(Boolean)
      .map((item: any) => {
        const imageUrl = formatImageUrl(
  item?.variant?.images?.[0]?.url ||
  item?.product?.images?.[0]?.url ||
  item?.thumbnail
)
        const title = escapeHtml(item?.title || "Produit")
        const quantity = Number(item?.quantity || 1)

        return `
          <tr>
            <td style="padding:16px 0;border-bottom:1px solid #eee;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="76" valign="top">
                    ${
                      imageUrl
                        ? `<img src="${imageUrl}" width="64" height="64" alt="${title}" style="border-radius:14px;object-fit:cover;border:1px solid #eee;background:#f5f5f5;display:block;" />`
                        : `<div style="width:64px;height:64px;border-radius:14px;background:#f5f5f5;border:1px solid #eee;"></div>`
                    }
                  </td>
                  <td style="padding-left:16px;" valign="middle">
                    <div style="font-size:15px;font-weight:700;color:#111;">
                      ${title}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        `
      })
      .join("") || ""

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: order.email,
    subject: `Confirmation de commande #${order.id}`,
    html: `
      <div style="background:#f7f4ef;padding:32px 16px;font-family:Arial,sans-serif;color:#111;line-height:1.6;">
        <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:22px;padding:32px;border:1px solid #eadfd2;">
          <div style="font-size:14px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#8b735d;margin-bottom:12px;">
            MizuCat
          </div>

          <h1 style="font-size:30px;line-height:1.2;margin:0 0 18px;color:#111;">
            Merci pour votre commande
          </h1>

          <p style="font-size:16px;color:#333;margin:0 0 20px;">
            Votre commande <strong>#${order.id}</strong> a bien été confirmée.
          </p>

          <div style="background:#f7f4ef;border-radius:16px;padding:18px;margin:24px 0;border:1px solid #eadfd2;">
            <div style="font-size:14px;color:#8b735d;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">
              Délai estimé
            </div>
            <div style="font-size:17px;color:#111;margin-top:4px;font-weight:700;">
              ${deliveryEstimate}
            </div>
          </div>

          <h2 style="font-size:22px;margin:28px 0 8px;color:#111;">
            Résumé de votre commande
          </h2>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
            ${itemsHtml}
          </table>

          <p style="font-size:15px;color:#333;margin-top:28px;">
            Vous pouvez suivre votre commande depuis votre espace compte.
          </p>

          <p style="margin:20px 0 24px;">
            <a href="${orderUrl}" style="background:#111;color:#fff;padding:14px 22px;text-decoration:none;border-radius:12px;display:inline-block;font-weight:700;">
              Voir ma commande
            </a>
          </p>

          <div style="background:#fafafa;border-radius:14px;padding:16px;border:1px solid #eee;">
            <div style="font-size:13px;color:#777;">
              Numéro de commande
            </div>
            <div style="font-size:16px;font-weight:700;color:#111;margin-top:4px;">
              #${order.id}
            </div>
          </div>

          <p style="margin-top:32px;font-size:15px;color:#333;">
            Merci pour votre confiance,<br/>
            <strong>L’équipe MizuCat</strong>
          </p>
        </div>
      </div>
    `,
  })

  console.log(`Email de confirmation envoyé à ${order.email}`)
}

export const config: SubscriberConfig = {
  event: "order.placed",
}