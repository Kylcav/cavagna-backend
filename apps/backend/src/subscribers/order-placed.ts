import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Resend } from "resend"
import crypto from "crypto"

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")

// Numéro de commande affiché partout (client, admin, CJ) = le display_id.
// La numérotation démarre haut (voir script set-order-number-start.ts) pour
// éviter le "#3" qui fait "magasin tout neuf". Un seul numéro => le client te
// donne SON numéro et tu retrouves la commande direct dans l'admin.
const orderRef = (displayId: unknown): string => `${displayId ?? ""}`

// URL du storefront (où sont servies les images locales /soie, /aspirateur...).
const SITE_URL = (
  process.env.STOREFRONT_URL ||
  process.env.STORE_URL ||
  "https://cavagna.shop"
).replace(/\/$/, "")

const formatImageUrl = (url?: string) => {
  if (!url) return ""

  if (url.startsWith("http")) {
    return url
  }

  // Images locales (relatives) -> servies par le storefront (URL absolue
  // obligatoire dans un email).
  return `${SITE_URL}${url.startsWith("/") ? url : `/${url}`}`
}

// Taie en soie : coloris -> code image locale (pour afficher la bonne couleur
// dans l'email client).
const SOIE_COLOR_CODE: Record<string, string> = {
  "Blanc nacré": "BLNC",
  Champagne: "CHMP",
  "Or rose": "ORRS",
  "Rose poudré": "RSPD",
  Rose: "ROSE",
  "Gris perle": "GRPL",
  "Gris anthracite": "GRAN",
  "Bleu nuit": "BLNT",
  "Bleu paon": "BLPA",
  Émeraude: "EMER",
  Terracotta: "TERR",
  "Rouge rubis": "RUBI",
}

const soieEmailImage = (item: any): string | undefined => {
  const c = item?.metadata?.couleur_1
  const code = typeof c === "string" ? SOIE_COLOR_CODE[c] : undefined
  return code ? `${SITE_URL}/soie/colors/soie-${code}.jpg` : undefined
}

// Détail des coloris commandés (pour rassurer le client) :
//   bicolore   -> "1× Rouge rubis + 1× Bleu paon"
//   même teinte -> "2× Rouge rubis"
//   1 taie      -> "Rouge rubis"
const couleursLabel = (item: any): string => {
  const c1 = item?.metadata?.couleur_1
  const c2 = item?.metadata?.couleur_2
  if (c1 && c2 && c2 !== c1) return `1× ${c1} + 1× ${c2}`
  if (c1 && c2) return `2× ${c1}`
  if (c1) return `${c1}`
  return ""
}

const sha256 = (value?: string | null) => {
  if (!value) return undefined

  return crypto
    .createHash("sha256")
    .update(value.trim().toLowerCase())
    .digest("hex")
}

const removeUndefined = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined).filter((v) => v !== undefined)
  }

  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj)
        .map(([key, value]) => [key, removeUndefined(value)])
        .filter(([, value]) => value !== undefined)
    )
  }

  return obj
}

const sendMetaPurchaseEvent = async (order: any) => {
  const pixelId = process.env.META_PIXEL_ID
  const accessToken = process.env.META_ACCESS_TOKEN

  if (!pixelId || !accessToken) {
    console.log("Meta CAPI ignoré : META_PIXEL_ID ou META_ACCESS_TOKEN manquant")
    return
  }

  const storeUrl = process.env.STORE_URL || "https://mizucat.ch"
  const cleanStoreUrl = storeUrl.replace(/\/$/, "")
  const countryCode =
    order.shipping_address?.country_code?.toLowerCase() ||
    process.env.STORE_COUNTRY_CODE ||
    "ch"

  const eventId = `purchase_${order.id}`

  const payload = removeUndefined({
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "website",
        event_source_url: `${cleanStoreUrl}/${countryCode}/account`,
        user_data: {
          em: order.email ? [sha256(order.email)] : undefined,
        },
        custom_data: {
          currency: (order.currency_code || "CHF").toUpperCase(),
          value: Number(order.total || 0),
          order_id: order.id,
          content_type: "product",
          content_ids:
            order.items?.map((item: any) => item.variant_id || item.id) || [],
          contents:
            order.items?.map((item: any) => ({
              id: item.variant_id || item.id,
              quantity: item.quantity,
              item_price: Number(item.unit_price || 0),
            })) || [],
        },
      },
    ],
    test_event_code: process.env.META_TEST_EVENT_CODE || undefined,
  })

  const response = await fetch(
    `https://graph.facebook.com/v23.0/${pixelId}/events?access_token=${accessToken}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  )

  const result = await response.json()

  if (!response.ok) {
    console.error("Erreur Meta CAPI Purchase:", result)
    return
  }

  console.log("Meta CAPI Purchase envoyé:", result)
}

const sendTikTokPurchaseEvent = async (order: any) => {
  const pixelId = process.env.TIKTOK_PIXEL_ID
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN

  if (!pixelId || !accessToken) {
    console.log(
      "TikTok Events API ignoré : TIKTOK_PIXEL_ID ou TIKTOK_ACCESS_TOKEN manquant"
    )
    return
  }

  const storeUrl = process.env.STORE_URL || "https://mizucat.ch"
  const cleanStoreUrl = storeUrl.replace(/\/$/, "")
  const countryCode =
    order.shipping_address?.country_code?.toLowerCase() ||
    process.env.STORE_COUNTRY_CODE ||
    "ch"

  const eventId = `purchase_${order.id}`

  const payload = removeUndefined({
    event_source: "web",
    event_source_id: pixelId,
    data: [
      {
        event: "CompletePayment",
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        user: {
          email: order.email ? sha256(order.email) : undefined,
        },
        page: {
          url: `${cleanStoreUrl}/${countryCode}/account`,
        },
        properties: {
          currency: (order.currency_code || "CHF").toUpperCase(),
          value: Number(order.total || 0),
          order_id: order.id,
          content_type: "product",
          content_id:
            order.items?.map((item: any) => item.variant_id || item.id) || [],
          contents:
            order.items?.map((item: any) => ({
              content_id: item.variant_id || item.id,
              content_name: item.title,
              content_type: "product",
              quantity: item.quantity,
              price: Number(item.unit_price || 0),
            })) || [],
        },
      },
    ],
  })

  const response = await fetch(
    "https://business-api.tiktok.com/open_api/v1.3/event/track/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Access-Token": accessToken,
      },
      body: JSON.stringify(payload),
    }
  )

  const result = await response.json()

  if (!response.ok || result?.code !== 0) {
    console.error("Erreur TikTok Events API CompletePayment:", result)
    return
  }

  console.log("TikTok Events API CompletePayment envoyé:", result)
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
      "shipping_address.first_name",
      "shipping_address.last_name",
      "shipping_address.address_1",
      "shipping_address.address_2",
      "shipping_address.postal_code",
      "shipping_address.city",
      "shipping_address.country_code",
      "shipping_address.phone",
      "shipping_methods.name",
      "items.id",
      "items.title",
      "items.quantity",
      "items.unit_price",
      "items.total",
      "items.metadata",
      "items.variant_id",
      "items.thumbnail",
      "items.variant.images.url",
      "items.variant.options.value",
      "items.product.images.url",
      "items.product.metadata",
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

  try {
    await sendMetaPurchaseEvent(order)
  } catch (error) {
    console.error("Meta CAPI Purchase a échoué, mais l'email continue:", error)
  }

  try {
    await sendTikTokPurchaseEvent(order)
  } catch (error) {
    console.error(
      "TikTok Events API CompletePayment a échoué, mais l'email continue:",
      error
    )
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
        // Image du coloris choisi (metadata.colorImages + option variante).
        const colorImages = item?.product?.metadata?.colorImages as
          | Record<string, string[]>
          | undefined
        const optVal = (item?.variant?.options || [])
          .map((o: any) => o?.value)
          .find((v: string) => v && colorImages?.[v])
        const colorImg =
          optVal && colorImages
            ? formatImageUrl(colorImages[optVal]?.[0])
            : undefined

        const imageUrl =
          colorImg ||
          soieEmailImage(item) ||
          formatImageUrl(
            item?.variant?.images?.[0]?.url ||
              item?.product?.images?.[0]?.url ||
              item?.thumbnail
          )
        const title = escapeHtml(item?.title || "Produit")

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
                    ${
                      couleursLabel(item)
                        ? `<div style="font-size:13px;color:#8b735d;margin-top:4px;">${escapeHtml(
                            couleursLabel(item)
                          )}</div>`
                        : ""
                    }
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        `
      })
      .join("") || ""

  const customerResult = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: order.email,
    subject: `Confirmation de votre commande #${orderRef(order.display_id)}`,
    html: `
      <div style="background:#f7f4ef;padding:32px 16px;font-family:Arial,sans-serif;color:#111;line-height:1.6;">
        <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:22px;padding:32px;border:1px solid #eadfd2;">
          <div style="font-size:14px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#8b735d;margin-bottom:12px;">
            CAVAGNA
          </div>

          <h1 style="font-size:30px;line-height:1.2;margin:0 0 18px;color:#111;">
            Merci pour votre commande
          </h1>

          <p style="font-size:16px;color:#333;margin:0 0 20px;">
            Votre commande a bien été confirmée.
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

          <div style="background:#fff8ec;border:1px solid #f0e2c4;border-radius:14px;padding:14px 16px;margin-top:20px;">
            <p style="margin:0;font-size:14px;color:#6b5a33;line-height:1.5;">
              ⏱️ <strong>Délai de livraison :</strong> en raison d’un nombre de
              commandes important, le délai annoncé peut varier de
              <strong>± 3 jours</strong>. Merci de votre patience et de votre
              compréhension.
            </p>
          </div>

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
              #${orderRef(order.display_id)}
            </div>
          </div>

          <p style="margin-top:32px;font-size:15px;color:#333;">
            Merci pour votre confiance,<br/>
            <strong>L’équipe CAVAGNA</strong>
          </p>
        </div>
      </div>
    `,
  })

  if (customerResult.error) {
    console.error(
      "❌ Resend (email CLIENT) a refusé l'envoi:",
      JSON.stringify(customerResult.error)
    )
  } else {
    console.log(
      `✅ Email de confirmation envoyé à ${order.email} (id ${customerResult.data?.id})`
    )
  }

  // Copie marchand : notification de nouvelle commande vers contact@cavagna.shop.
  try {
    const merchantEmail =
      process.env.MERCHANT_NOTIFICATION_EMAIL || "contact@cavagna.shop"
    const addr = order.shipping_address
    const fullName = [addr?.first_name, addr?.last_name]
      .filter(Boolean)
      .join(" ")
    const addressHtml = addr
      ? `${escapeHtml(fullName)}<br/>${escapeHtml(addr.address_1 || "")}${
          addr.address_2 ? "<br/>" + escapeHtml(addr.address_2) : ""
        }<br/>${escapeHtml(addr.postal_code || "")} ${escapeHtml(
          addr.city || ""
        )}<br/>${escapeHtml((addr.country_code || "").toUpperCase())}${
          addr.phone ? "<br/>Tél : " + escapeHtml(addr.phone) : ""
        }`
      : "—"
    const merchantItems =
      order.items
        ?.filter(Boolean)
        .map((item: any) => {
          const couleurs = couleursLabel(item)
          const detail = couleurs
            ? ` — ${couleurs}`
            : item.quantity
              ? ` × ${item.quantity}`
              : ""
          return `<li><strong>${escapeHtml(item.title)}</strong>${escapeHtml(
            detail
          )}</li>`
        })
        .join("") || ""
    const totalNum =
      Number(order.total) ||
      (order.items || []).reduce(
        (s: number, it: any) =>
          s +
          (Number(it.total) ||
            Number(it.unit_price) * Number(it.quantity) ||
            0),
        0
      )
    const totalLabel = `${totalNum} ${(order.currency_code || "").toUpperCase()}`

    const merchantResult = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: merchantEmail,
      subject: `🛎️ Nouvelle commande #${orderRef(order.display_id)} — ${totalLabel}`,
      html: `
        <div style="font-family:Arial,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;padding:16px;">
          <h2 style="margin:0 0 12px;">Nouvelle commande #${orderRef(order.display_id)}</h2>
          <p style="margin:0 0 16px;">
            <strong>Total :</strong> ${totalLabel}<br/>
            <strong>Email client :</strong> ${escapeHtml(order.email)}
          </p>
          <h3 style="margin:0 0 6px;">Articles</h3>
          <ul style="margin:0 0 16px;padding-left:18px;">${merchantItems}</ul>
          <h3 style="margin:0 0 6px;">Adresse de livraison</h3>
          <p style="margin:0 0 16px;">${addressHtml}</p>
          <p style="color:#777;font-size:13px;">
            Si l'article est dropshippé, la commande fournisseur a été créée
            automatiquement chez CJdropshipping (à valider/payer dans CJ).
          </p>
        </div>
      `,
    })
    if (merchantResult.error) {
      console.error(
        "❌ Resend (email MARCHAND) a refusé l'envoi:",
        JSON.stringify(merchantResult.error)
      )
    } else {
      console.log(
        `✅ Email marchand envoyé à ${merchantEmail} (id ${merchantResult.data?.id})`
      )
    }
  } catch (error) {
    console.error("Email marchand a échoué, sans bloquer la commande:", error)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}