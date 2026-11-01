import { MedusaContainer } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  deleteProductsWorkflow,
} from "@medusajs/medusa/core-flows"
import { readFileSync } from "fs"

/**
 * Reconstruit UN produit (variantes couleur + mapping CJ + photos par couleur).
 * Supprime l'existant par handle puis recrée proprement. Permet d'ajouter /
 * retirer des coloris (ex. ajouter "Café" connecté à sa variante CJ).
 *
 * Config /tmp/rebuild-product.json :
 * { "handle","title","price","description","category","cj_pid","thumbnail",
 *   "colors":[{"value","vid","sku","images":[...]}] }
 *
 * Lancer : RPRODUCT=/tmp/rebuild-product.json npx medusa exec ./src/scripts/rebuild-product.ts
 */
const PATH = process.env.RPRODUCT || "/tmp/rebuild-product.json"

type Color = { value: string; vid: string; sku?: string; images: string[] }
type Cfg = {
  handle: string
  title: string
  price: number
  description: string
  category?: string
  cj_pid: string
  thumbnail?: string
  colors: Color[]
}

export default async function rebuildProduct({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const p: Cfg = JSON.parse(readFileSync(PATH, "utf-8"))

  const { data: stores } = await query.graph({
    entity: "store",
    fields: ["default_sales_channel_id"],
  })
  const { data: channels } = await query.graph({
    entity: "sales_channel",
    fields: ["id"],
  })
  const salesChannel =
    channels.find((c: any) => c.id === stores[0]?.default_sales_channel_id) ??
    channels[0]
  const { data: profiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id", "name"],
  })
  const shippingProfile =
    profiles.find((pr: any) => /gratuit/i.test(pr.name)) || profiles[0]

  let catId: string | undefined
  if (p.category) {
    const { data: cats } = await query.graph({
      entity: "product_category",
      fields: ["id", "handle"],
      filters: { handle: p.category },
    })
    catId = (cats[0] as any)?.id
  }

  const { data: existing } = await query.graph({
    entity: "product",
    fields: ["id"],
    filters: { handle: p.handle },
  })
  if (existing.length) {
    await deleteProductsWorkflow(container).run({
      input: { ids: existing.map((e: any) => e.id) },
    })
    logger.info(`🧹 ${p.handle} supprimé (reconstruction).`)
  }

  const colorImages: Record<string, string[]> = {}
  p.colors.forEach((c) => (colorImages[c.value] = c.images))
  const allImgs = Array.from(new Set(p.colors.flatMap((c) => c.images)))

  await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: p.title,
          handle: p.handle,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          category_ids: catId ? [catId] : [],
          description: p.description,
          thumbnail: p.thumbnail || allImgs[0],
          images: allImgs.map((url) => ({ url })),
          options: [{ title: "Couleur", values: p.colors.map((c) => c.value) }],
          variants: p.colors.map((c, i) => ({
            title: c.value,
            sku: `${p.handle.toUpperCase()}-${i + 1}`,
            manage_inventory: false,
            options: { Couleur: c.value },
            prices: [
              { amount: p.price, currency_code: "chf" },
              { amount: p.price, currency_code: "eur" },
            ],
            metadata: { cj_vid: c.vid, cj_sku: c.sku || "", cj_qty: 1 },
          })),
          sales_channels: [{ id: salesChannel.id }],
          metadata: { cj_pid: p.cj_pid, colorImages },
        },
      ],
    },
  })
  logger.info(`✅ ${p.title} reconstruit : ${p.colors.length} coloris.`)
}
