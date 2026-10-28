import { MedusaContainer } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  deleteProductsWorkflow,
} from "@medusajs/medusa/core-flows"

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
const PRICE = 169

// Machine inox "soup maker" (façon Mylky), source CJ "Fully Automatic Soybean
// Milk Machine ... Stainless Steel" (SPU CJYD2399268).
const CJ_PID = "2506110931331621400"
const CJ_VID_EU = "2506110931331622600"
const CJ_SKU = "CJYD239926803CX" // SKU de la variante prise-EU (Silver Gray-EU)

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
      `Produit déjà existant (${existing[0].id}) — suppression puis recréation ` +
        `(swap vers la machine inox + prix ${PRICE}).`
    )
    await deleteProductsWorkflow(container).run({
      input: { ids: existing.map((p: any) => p.id) },
    })
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
            "La machine Lattéo en inox prépare du lait végétal frais à partir " +
            "d'ingrédients bruts : amandes, avoine, noisettes, soja, graines… Chauffe et " +
            "mixe automatiquement (lame SUS 304, double paroi inox), sans additifs ni " +
            "conservateurs. Capacité 1,2–1,5 L, auto-nettoyage, prise européenne. Plus goûtu, " +
            "moins cher et moins de déchets que les briques du commerce.",
          thumbnail: "/latteo/latteo-main.jpg",
          images: [
            { url: "/latteo/latteo-main.jpg" },
            { url: "/latteo/ingredients.jpg" },
            { url: "/latteo/recette-amande.jpg" },
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
