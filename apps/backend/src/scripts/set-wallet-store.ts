import { MedusaContainer } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  deleteProductsWorkflow,
  updateProductsWorkflow,
  createProductCategoriesWorkflow,
  deleteProductCategoriesWorkflow,
} from "@medusajs/medusa/core-flows"
import { readFileSync } from "fs"

/**
 * Transforme cavagna.shop en boutique 100% porte-cartes / portefeuilles.
 *  - Crée 3 catégories : Pop-up, Métal & Aluminium, Fibre de carbone.
 *  - Crée les 9 nouveaux produits (connectés CJ : cj_pid + cj_vid par variante),
 *    depuis /tmp/wallets_config.json (généré côté local, scp sur le VPS).
 *  - Range le porte-cartes pop-up EXISTANT dans la catégorie Pop-up (sans le
 *    supprimer → garde sa promo -40%).
 *  - SUPPRIME les 10 anciens produits cadeaux + les 4 anciennes catégories.
 *
 * Lancer :  WALLETS_CONFIG=/tmp/wallets_config.json npx medusa exec ./src/scripts/set-wallet-store.ts
 */

const CONFIG_PATH = process.env.WALLETS_CONFIG || "/tmp/wallets_config.json"

// Catégorie par slug de produit.
const CAT_BY_SLUG: Record<string, string> = {
  "porte-cartes-popup-auto": "pop-up",
  "porte-cartes-popup-alu": "pop-up", // existant
  "porte-cartes-rfid-capacite": "metal-aluminium",
  "porte-cartes-boitier-alu": "metal-aluminium",
  "porte-cartes-alu-compact": "metal-aluminium",
  "porte-cartes-metal-homme": "metal-aluminium",
  "porte-cartes-metal-anti-scan": "metal-aluminium",
  "portefeuille-carbone-pliable": "fibre-carbone",
  "porte-cartes-carbone-popup": "fibre-carbone",
  "portefeuille-carbone-poussoir": "fibre-carbone",
}

const NEW_CATS = [
  { name: "Pop-up", handle: "pop-up", rank: 0 },
  { name: "Métal & Aluminium", handle: "metal-aluminium", rank: 1 },
  { name: "Fibre de carbone", handle: "fibre-carbone", rank: 2 },
]

const OLD_CAT_HANDLES = [
  "mode-beaute",
  "tech-maison",
  "maison-cuisine",
  "fun-enfants",
]

const GIFT_HANDLES_TO_DELETE = [
  "aspirateur-robot-18000-pa",
  "machine-lait-portable",
  "projecteur-mini-hd",
  "ceinture-ems-abdominale",
  "extension-cheveux-halo",
  "lip-plumper-gloss",
  "jawline-trainer-masseter",
  "balle-anti-destruction-chien",
  "feutres-coloriage-double-pointe",
  "poele-pierre-antiadhesive",
]

type Color = { value: string; vid: string; sku: string; image: string }
type WalletProduct = {
  pid: string
  slug: string
  title: string
  price: number
  description: string
  thumbnail: string
  colors: Color[]
}

export default async function setWalletStore({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const products: WalletProduct[] = JSON.parse(
    readFileSync(CONFIG_PATH, "utf-8")
  )
  logger.info(`📦 ${products.length} produits à créer depuis ${CONFIG_PATH}`)

  // --- Contexte commun ---
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
    fields: ["id", "name"],
  })
  const shippingProfile =
    profiles.find((p: any) => /gratuit/i.test(p.name)) || profiles[0]

  // --- 1) Catégories : crée celles qui manquent ---
  const { data: existingCats } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle"],
  })
  const catIdByHandle: Record<string, string> = {}
  existingCats.forEach((c: any) => (catIdByHandle[c.handle] = c.id))

  const toCreate = NEW_CATS.filter((c) => !catIdByHandle[c.handle])
  if (toCreate.length) {
    const { result } = await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: toCreate.map((c) => ({
          name: c.name,
          handle: c.handle,
          rank: c.rank,
          is_active: true,
        })),
      },
    })
    ;(result as any[]).forEach((c) => (catIdByHandle[c.handle] = c.id))
    logger.info(`🗂️  Catégories créées : ${toCreate.map((c) => c.handle).join(", ")}`)
  }

  // --- 2) Crée les 9 nouveaux produits ---
  for (const p of products) {
    const { data: existing } = await query.graph({
      entity: "product",
      fields: ["id"],
      filters: { handle: p.slug },
    })
    if (existing.length) {
      await deleteProductsWorkflow(container).run({
        input: { ids: existing.map((e: any) => e.id) },
      })
    }

    const colorImages: Record<string, string[]> = {}
    p.colors.forEach((c) => (colorImages[c.value] = [c.image]))
    const allImgs = Array.from(new Set(p.colors.map((c) => c.image)))
    const catHandle = CAT_BY_SLUG[p.slug]
    const catId = catHandle ? catIdByHandle[catHandle] : undefined

    await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: p.title,
            handle: p.slug,
            status: ProductStatus.PUBLISHED,
            shipping_profile_id: shippingProfile.id,
            category_ids: catId ? [catId] : [],
            description: p.description,
            thumbnail: p.thumbnail,
            images: allImgs.map((url) => ({ url })),
            options: [
              { title: "Couleur", values: p.colors.map((c) => c.value) },
            ],
            variants: p.colors.map((c, i) => ({
              title: c.value,
              sku: `${p.slug.toUpperCase()}-${i + 1}`,
              manage_inventory: false,
              options: { Couleur: c.value },
              prices: [
                { amount: p.price, currency_code: "chf" },
                { amount: p.price, currency_code: "eur" },
              ],
              metadata: { cj_vid: c.vid, cj_sku: c.sku, cj_qty: 1 },
            })),
            sales_channels: [{ id: salesChannel.id }],
            metadata: { cj_pid: p.pid, colorImages },
          },
        ],
      },
    })
    logger.info(`✅ ${p.title} (${p.colors.length} coul.) → ${catHandle}`)
  }

  // --- 3) Range le pop-up EXISTANT dans la catégorie Pop-up ---
  const { data: popup } = await query.graph({
    entity: "product",
    fields: ["id"],
    filters: { handle: "porte-cartes-popup-alu" },
  })
  if (popup.length && catIdByHandle["pop-up"]) {
    await updateProductsWorkflow(container).run({
      input: {
        selector: { id: popup[0].id },
        update: { category_ids: [catIdByHandle["pop-up"]] },
      },
    })
    logger.info("🔖 Porte-cartes pop-up existant rangé dans Pop-up.")
  }

  // --- 4) Supprime les 10 produits cadeaux ---
  const { data: gifts } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
    filters: { handle: GIFT_HANDLES_TO_DELETE },
  })
  if (gifts.length) {
    await deleteProductsWorkflow(container).run({
      input: { ids: gifts.map((g: any) => g.id) },
    })
    logger.info(`🗑️  ${gifts.length} produits cadeaux supprimés.`)
  }

  // --- 5) Supprime les anciennes catégories ---
  const { data: oldCats } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle"],
    filters: { handle: OLD_CAT_HANDLES },
  })
  if (oldCats.length) {
    await deleteProductCategoriesWorkflow(container).run({
      input: oldCats.map((c: any) => c.id),
    })
    logger.info(`🧹 ${oldCats.length} anciennes catégories supprimées.`)
  }

  logger.info("🎉 Boutique portefeuilles prête.")
}
