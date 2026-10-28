import { MedusaContainer } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  ProductStatus,
} from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Crée le produit "Machine à lait végétal Lattéo" pour le site /latteo.
 *
 * Produit mono-variante vendu 149 CHF / 149 EUR.
 * Source CJdropshipping : "Soybean Milk Machine Multifunction Juicer"
 *   - SPU / pid CJ : 2602190943141606000
 *   - Variante prise EU (cj_vid) : 2602190943141606600  (~18,29 $)
 *
 * La variante porte dans ses metadata le cj_vid + cj_sku + cj_qty pour la
 * synchro automatique des commandes (subscriber order.placed -> CJ).
 *
 * Lancer depuis apps/backend :  npx medusa exec ./src/scripts/add-latteo.ts
 * Idempotent : ne recrée pas le produit s'il existe déjà (handle unique).
 */

const HANDLE = "latteo-machine-lait-vegetal"
const PRICE = 149

const CJ_PID = "2602190943141606000"
const CJ_VID_EU = "2602190943141606600"
const CJ_SKU = "CJJT276399802BY" // SKU de la variante prise-EU (Beige set-EU)

export default async function add_latteo({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

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

  const { data: profiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  })
  const shippingProfile = profiles[0]
  if (!shippingProfile) {
    throw new Error("Aucun shipping profile trouvé.")
  }

  logger.info(
    `Création du produit "${HANDLE}" sur le sales channel "${salesChannel.name}" (${salesChannel.id})...`
  )

  await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: "Machine à lait végétal Lattéo",
          handle: HANDLE,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          description:
            "La machine Lattéo prépare du lait végétal frais en 60 secondes, à partir " +
            "d'ingrédients bruts : amandes, avoine, noisettes, soja, graines… Chauffe et " +
            "mixe automatiquement, panier-filtre intégré, sans additifs ni conservateurs. " +
            "Capacité ~1,2 L, nettoyage facile, prise européenne. Plus goûtu, moins cher et " +
            "moins de déchets que les briques du commerce.",
          thumbnail: "/latteo/cj-1.jpg",
          images: [
            { url: "/latteo/cj-1.jpg" },
            { url: "/latteo/cj-2.jpg" },
            { url: "/latteo/cj-3.jpg" },
            { url: "/latteo/cj-4.jpg" },
            { url: "/latteo/cj-5.jpg" },
          ],
          options: [{ title: "Format", values: ["Machine Lattéo"] }],
          variants: [
            {
              title: "Machine Lattéo",
              sku: "LATTEO-1",
              manage_inventory: false,
              options: { Format: "Machine Lattéo" },
              prices: [
                { amount: PRICE, currency_code: "chf" },
                { amount: PRICE, currency_code: "eur" },
              ],
              metadata: {
                cj_vid: CJ_VID_EU,
                cj_sku: CJ_SKU,
                cj_qty: 1,
              },
            },
          ],
          sales_channels: [{ id: salesChannel.id }],
          metadata: {
            cj_pid: CJ_PID,
          },
        },
      ],
    },
  })

  logger.info(
    `✅ Produit "${HANDLE}" créé (publié, 1 variante, ${PRICE} CHF/EUR, ` +
      `manage_inventory=false, mapping CJ vid=${CJ_VID_EU}).`
  )
}
