import { MedusaContainer } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  deleteProductsWorkflow,
  createProductCategoriesWorkflow,
  deleteProductCategoriesWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * Transforme la boutique Cavagna en boutique "idées cadeaux" :
 *   1. Supprime les anciens produits maillots / casquettes / pareo.
 *   2. Supprime les anciennes catégories (maillots H/F, accessoires).
 *   3. Crée les nouvelles catégories cadeaux.
 *   4. Crée le produit héros "Mini projecteur portable HD" (connecté CJ).
 *   5. Affecte les produits gagnants gardés (aspirateur, soie, machine à lait)
 *      + le projecteur aux bonnes catégories.
 *
 * Idempotent : relançable sans créer de doublons.
 * Lancer :  npx medusa exec ./src/scripts/setup-gift-store.ts
 */

// Catégories cadeaux à créer.
const GIFT_CATEGORIES = [
  { name: "Tech & Maison", handle: "tech-maison" },
  { name: "Maison & Cuisine", handle: "maison-cuisine" },
  { name: "Bien-être & Confort", handle: "bien-etre-confort" },
]

// Produits gardés -> catégorie (par handle).
const KEEP_IN_CATEGORY: Record<string, string> = {
  "aspirateur-robot-18000-pa": "tech-maison",
  "latteo-machine-lait-vegetal": "maison-cuisine",
  "taie-soie-mulberry": "bien-etre-confort",
}

// Projecteur (héros) — source CJ "Home Portable HD LED Mini Projector".
const PROJ_HANDLE = "projecteur-mini-hd"
const PROJ_PRICE = 89
const PROJ_CJ_PID = "2610280308421600400"
const PROJ_COLORS = [
  { fr: "Blanc", vid: "2610280308421601600", sku: "CJYD352474101AZ", code: "BLC" },
  { fr: "Noir", vid: "2610280308421601601", sku: "CJYD352474102BY", code: "NOI" },
]

export default async function setup_gift_store({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  /* ----------------------- 1. Supprimer les maillots ---------------------- */
  const { data: allProducts } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
  })
  const removeIds = allProducts
    .filter((p: any) => /^(maillot|casquette|pareo)/.test(p.handle || ""))
    .map((p: any) => p.id)
  if (removeIds.length) {
    await deleteProductsWorkflow(container).run({ input: { ids: removeIds } })
    logger.info(`🧹 ${removeIds.length} produits maillots/accessoires supprimés.`)
  } else {
    logger.info("Aucun ancien produit maillot à supprimer.")
  }

  /* --------------------- 2. Supprimer anciennes catégories ---------------- */
  const { data: cats } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle"],
  })
  const oldCatIds = cats
    .filter((c: any) =>
      ["accessoires", "maillots-de-bain-homme", "maillots-de-bain-femme"].includes(
        c.handle
      )
    )
    .map((c: any) => c.id)
  if (oldCatIds.length) {
    await deleteProductCategoriesWorkflow(container).run({
      input: oldCatIds,
    })
    logger.info(`🧹 ${oldCatIds.length} anciennes catégories supprimées.`)
  }

  /* --------------------- 3. Créer les catégories cadeaux ------------------ */
  const { data: existingCats } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle"],
  })
  const existingHandles = new Set(existingCats.map((c: any) => c.handle))
  const toCreate = GIFT_CATEGORIES.filter((c) => !existingHandles.has(c.handle))
  if (toCreate.length) {
    await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: toCreate.map((c) => ({
          name: c.name,
          handle: c.handle,
          is_active: true,
        })),
      },
    })
    logger.info(`✅ ${toCreate.length} catégories cadeaux créées.`)
  }

  // Recharge la map handle -> id.
  const { data: catsNow } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle"],
  })
  const catIdByHandle: Record<string, string> = {}
  catsNow.forEach((c: any) => (catIdByHandle[c.handle] = c.id))

  /* --------------------------- 4. Sales channel + profile ----------------- */
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

  /* --------------------------- 5. Créer le projecteur --------------------- */
  const { data: existingProj } = await query.graph({
    entity: "product",
    fields: ["id"],
    filters: { handle: PROJ_HANDLE },
  })
  if (!existingProj.length) {
    await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: "Mini projecteur portable HD",
            handle: PROJ_HANDLE,
            status: ProductStatus.PUBLISHED,
            shipping_profile_id: shippingProfile.id,
            category_ids: [catIdByHandle["tech-maison"]].filter(Boolean),
            description:
              "Transformez votre salon en cinéma. Ce mini projecteur portable HD " +
              "se connecte à votre téléphone, console ou clé USB et projette jusqu'à " +
              "une grande image sur n'importe quel mur. Compact, léger, prêt à offrir.",
            thumbnail: "/produits/projecteur-1.jpg",
            images: [
              { url: "/produits/projecteur-1.jpg" },
              { url: "/produits/projecteur-2.jpg" },
              { url: "/produits/projecteur-3.jpg" },
            ],
            options: [{ title: "Couleur", values: PROJ_COLORS.map((c) => c.fr) }],
            variants: PROJ_COLORS.map((c) => ({
              title: c.fr,
              sku: `PROJ-${c.code}`,
              manage_inventory: false,
              options: { Couleur: c.fr },
              prices: [
                { amount: PROJ_PRICE, currency_code: "chf" },
                { amount: PROJ_PRICE, currency_code: "eur" },
              ],
              metadata: { cj_vid: c.vid, cj_sku: c.sku, cj_qty: 1 },
            })),
            sales_channels: [{ id: salesChannel.id }],
            metadata: { cj_pid: PROJ_CJ_PID },
          },
        ],
      },
    })
    logger.info(`✅ Projecteur créé (${PROJ_PRICE} CHF/EUR, connecté CJ).`)
  } else {
    logger.info("Projecteur déjà existant, non recréé.")
  }

  /* ------------- 6. Affecter les produits gardés aux catégories ----------- */
  const { data: keepProducts } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
    filters: { handle: Object.keys(KEEP_IN_CATEGORY) },
  })
  const updates = keepProducts
    .map((p: any) => {
      const catId = catIdByHandle[KEEP_IN_CATEGORY[p.handle]]
      return catId ? { id: p.id, category_ids: [catId] } : null
    })
    .filter(Boolean) as { id: string; category_ids: string[] }[]
  if (updates.length) {
    await updateProductsWorkflow(container).run({ input: { products: updates } })
    logger.info(`✅ ${updates.length} produits gagnants rangés dans les catégories.`)
  }

  logger.info("🎁 Boutique cadeaux prête (maillots retirés, catégories + projecteur + produits gagnants).")
}
