import crypto from "crypto"

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

export const sendTikTokPurchaseEvent = async (order: any) => {
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