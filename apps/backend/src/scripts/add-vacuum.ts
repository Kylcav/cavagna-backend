import { MedusaContainer } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  ProductStatus,
} from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Crée le produit "Robot Aspirateur 18000 Pa" (variantes Noir / Blanc, prix CHF)
 * et le lie au sales channel du storefront pour qu'il soit vendable via Stripe.
 *
 * Lancer depuis apps/backend :  npx medusa exec ./src/scripts/add-vacuum.ts
 * Idempotent : ne recrée pas le produit s'il existe déjà (handle unique).
 */
export default async function add_vacuum({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const HANDLE = "aspirateur-robot-18000-pa"

  // Déjà présent ? -> on sort proprement.
  const { data: existing } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "status"],
    filters: { handle: HANDLE },
  })
  if (existing.length) {
    logger.info(
      `Produit déjà existant (${existing[0].id}, statut ${existing[0].status}). Rien à faire.`
    )
    return
  }

  // Sales channel du storefront (le store en expose un seul par défaut).
  const { data: stores } = await query.graph({
    entity: "store",
    fields: ["default_sales_channel_id"],
  })
  const defaultChannelId = stores[0]?.default_sales_channel_id

  const { data: channels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name"],
  })
  const salesChannel =
    channels.find((c: any) => c.id === defaultChannelId) ?? channels[0]
  if (!salesChannel) {
    throw new Error("Aucun sales channel trouvé.")
  }

  // Shipping profile par défaut.
  const { data: profiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  })
  const shippingProfile = profiles[0]
  if (!shippingProfile) {
    throw new Error("Aucun shipping profile trouvé.")
  }

  logger.info(
    `Création du produit sur le sales channel "${salesChannel.name}" (${salesChannel.id})...`
  )

  const PRICE_CHF = 199

  await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: "Robot Aspirateur 18000 Pa – Station Auto-Vidage",
          handle: HANDLE,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          description:
            "Robot aspirateur laveur intelligent de 18000 Pa avec station de vidage automatique. " +
            "Navigation laser LDS SLAM pour une cartographie précise, pilotage par application, " +
            "bac à poussière 2,5 L et autonomie jusqu'à 120 minutes. Disponible en noir et en blanc.",
          images: [
            {
              url: "https://s.alicdn.com/@sc01/kf/Sfd97ead8ab0f47e3b71fab4d0e1b4947y.jpg",
            },
            {
              url: "https://s.alicdn.com/@sc01/kf/H83826e52c3eb485881a1d38cef77a401L.jpg",
            },
          ],
          options: [
            {
              title: "Couleur",
              values: ["Noir", "Blanc"],
            },
          ],
          variants: [
            {
              title: "Noir",
              sku: "VAC-18000-NOIR",
              manage_inventory: false,
              options: { Couleur: "Noir" },
              prices: [{ amount: PRICE_CHF, currency_code: "chf" }],
            },
            {
              title: "Blanc",
              sku: "VAC-18000-BLANC",
              manage_inventory: false,
              options: { Couleur: "Blanc" },
              prices: [{ amount: PRICE_CHF, currency_code: "chf" }],
            },
          ],
          sales_channels: [{ id: salesChannel.id }],
        },
      ],
    },
  })

  logger.info(
    `✅ Produit "${HANDLE}" créé (publié, 2 variantes, ${PRICE_CHF} CHF, manage_inventory=false).`
  )
}
