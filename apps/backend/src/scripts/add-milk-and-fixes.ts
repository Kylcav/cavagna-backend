import { MedusaContainer } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * 1) Ajoute la 2e machine à lait (Small Soybean Milk Machine, verte) connectée CJ.
 * 2) Remplace la photo de l'aspirateur par la nouvelle (robot + station).
 *
 * Lancer : npx medusa exec ./src/scripts/add-milk-and-fixes.ts
 */

const MILK = {
  handle: "machine-lait-portable",
  title: "Machine à lait végétal portable",
  price: 129,
  category: "maison-cuisine",
  cj_pid: "1370276155982221312",
  cj_vid: "1370276157324398592",
  cj_sku: "CJCF103978901AZ",
  images: [
    "/produits/milk-portable/main.webp",
    "/produits/milk-portable/lifestyle.webp",
  ],
  description:
    "Du lait végétal frais, chaud ou froid, où que tu sois. Cette machine portable " +
    "chauffe et mixe automatiquement amandes, avoine, soja ou fruits en une boisson " +
    "onctueuse, sans additifs. Format nomade avec dragonne, rechargeable, auto-nettoyage. " +
    "Le cadeau healthy au look vert & or.",
}

export default async function addMilkAndFixes({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: catsNow } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle"],
  })
  const catId = catsNow.find((c: any) => c.handle === MILK.category)?.id

  const { data: stores } = await query.graph({
    entity: "store",
    fields: ["default_sales_channel_id"],
  })
  const { data: channels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name"],
  })
  const salesChannel =
    channels.find((c: any) => c.id === stores[0]?.default_sales_channel_id) ??
    channels[0]
  const { data: profiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  })
  const shippingProfile = profiles[0]

  /* --------- 1. Machine à lait portable (si pas déjà créée) --------- */
  const { data: exists } = await query.graph({
    entity: "product",
    fields: ["id"],
    filters: { handle: MILK.handle },
  })
  if (!exists.length) {
    await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: MILK.title,
            handle: MILK.handle,
            status: ProductStatus.PUBLISHED,
            shipping_profile_id: shippingProfile.id,
            category_ids: catId ? [catId] : [],
            description: MILK.description,
            thumbnail: MILK.images[0],
            images: MILK.images.map((url) => ({ url })),
            options: [{ title: "Format", values: ["Vert & or"] }],
            variants: [
              {
                title: "Vert & or",
                sku: "MILK-PORTABLE-1",
                manage_inventory: false,
                options: { Format: "Vert & or" },
                prices: [
                  { amount: MILK.price, currency_code: "chf" },
                  { amount: MILK.price, currency_code: "eur" },
                ],
                metadata: { cj_vid: MILK.cj_vid, cj_sku: MILK.cj_sku, cj_qty: 1 },
              },
            ],
            sales_channels: [{ id: salesChannel.id }],
            metadata: { cj_pid: MILK.cj_pid },
          },
        ],
      },
    })
    logger.info(`✅ ${MILK.title} créée (${MILK.price} CHF/EUR, connectée CJ).`)
  } else {
    logger.info("Machine portable déjà existante, non recréée.")
  }

  /* --------- 2. Nouvelle photo aspirateur --------- */
  const { data: vac } = await query.graph({
    entity: "product",
    fields: ["id"],
    filters: { handle: "aspirateur-robot-18000-pa" },
  })
  if (vac.length) {
    await updateProductsWorkflow(container).run({
      input: {
        products: [
          {
            id: vac[0].id,
            thumbnail: "/produits/aspirateur/robot.webp",
            images: [{ url: "/produits/aspirateur/robot.webp" }],
          },
        ],
      },
    })
    logger.info("✅ Aspirateur : nouvelle photo (robot + station) appliquée.")
  }

  logger.info("🎁 Terminé.")
}
