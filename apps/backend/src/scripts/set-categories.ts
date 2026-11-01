import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createProductCategoriesWorkflow,
  deleteProductCategoriesWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * Recatégorise la boutique en 3 catégories par MÉCANISME :
 *  Porte-monnaie · Porte-cartes sans pop-up · Porte-cartes pop-up.
 * Réassigne chaque produit, puis supprime les anciennes catégories.
 *
 *  npx medusa exec ./src/scripts/set-categories.ts
 */
const NEW_CATS = [
  { name: "Porte-cartes pop-up", handle: "porte-cartes-popup", rank: 0 },
  { name: "Porte-cartes sans pop-up", handle: "porte-cartes-sans-popup", rank: 1 },
]

const ASSIGN: Record<string, string> = {
  "porte-cartes-metal-homme": "porte-cartes-sans-popup",
  "porte-cartes-metal-anti-scan": "porte-cartes-sans-popup",
  "porte-cartes-rfid-capacite": "porte-cartes-sans-popup",
  "porte-cartes-popup-alu": "porte-cartes-popup",
  "porte-cartes-popup-auto": "porte-cartes-popup",
  "porte-cartes-carbone-popup": "porte-cartes-popup",
  "porte-cartes-boitier-alu": "porte-cartes-popup",
  "porte-cartes-alu-compact": "porte-cartes-popup",
  "portefeuille-carbone-pliable": "porte-cartes-popup",
  "portefeuille-carbone-poussoir": "porte-cartes-popup",
}

const OLD_CATS = ["porte-monnaie"]

export default async function setCategories({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: existing } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle"],
  })
  const catId: Record<string, string> = {}
  existing.forEach((c: any) => (catId[c.handle] = c.id))

  // 1) crée les nouvelles catégories manquantes
  const toCreate = NEW_CATS.filter((c) => !catId[c.handle])
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
    ;(result as any[]).forEach((c) => (catId[c.handle] = c.id))
    logger.info(`🗂️  Créées : ${toCreate.map((c) => c.handle).join(", ")}`)
  }

  // 2) réassigne chaque produit
  for (const [handle, cat] of Object.entries(ASSIGN)) {
    const { data } = await query.graph({
      entity: "product",
      fields: ["id"],
      filters: { handle },
    })
    if (!data.length) { logger.warn(`introuvable: ${handle}`); continue }
    await updateProductsWorkflow(container).run({
      input: {
        selector: { id: (data[0] as any).id },
        update: { categories: [{ id: catId[cat] }] } as any,
      },
    })
    logger.info(`  → ${handle} = ${cat}`)
  }

  // 3) supprime les anciennes catégories
  const { data: olds } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle"],
    filters: { handle: OLD_CATS },
  })
  if (olds.length) {
    await deleteProductCategoriesWorkflow(container).run({
      input: olds.map((c: any) => c.id),
    })
    logger.info(`🧹 Anciennes catégories supprimées : ${olds.map((c: any) => c.handle).join(", ")}`)
  }

  logger.info("🎉 Catégories mises à jour.")
}
