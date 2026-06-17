import crypto from "crypto"

const hash = (value?: string | null) => {
  if (!value) return undefined
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex")
}

const moneyToMajor = (amount: any) => {
  const n = Number(amount || 0)
  return n > 1000 ? n / 100 : n
}

export async function sendMetaPurchase(order: any) {
  const pixelId = process.env.META_PIXEL_ID
  const accessToken = process.env.META_ACCESS_TOKEN

  if (!pixelId || !accessToken) return

  const eventId = `purchase_${order.id}`

  const payload = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "website",
        event_source_url: `${process.env.STORE_URL || "https://mizucat.ch"}/ch/account`,
        user_data: {
          em: order.email ? [hash(order.email)] : undefined,
        },
        custom_data: {
          currency: (order.currency_code || "CHF").toUpperCase(),
          value: moneyToMajor(order.total),
          order_id: order.id,
          content_type: "product",
          contents:
            order.items?.map((item: any) => ({
              id: item.variant_id || item.id,
              quantity: item.quantity,
              item_price: moneyToMajor(item.unit_price),
            })) || [],
        },
      },
    ],
  }

  const response = await fetch(
    `https://graph.facebook.com/v23.0/${pixelId}/events?access_token=${accessToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  )

  const result = await response.json()
  console.log("Meta CAPI Purchase:", result)
}