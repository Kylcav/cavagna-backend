import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  deleteProductsWorkflow,
  deleteProductCategoriesWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * Supprime la taie d'oreiller en soie + la catégorie "Bien-être & Confort".
 *
 * Lancer : npx medusa exec ./src/scripts/remove-soie-confort.ts
 */
export default async function removeSoieConfort({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  // 1. Produit taie soie
  const { data: soie } = await query.graph({
    entity: "product",
    fields: ["id"],
    filters: { handle: "taie-soie-mulberry" },
  })
  if (soie.length) {
    await deleteProductsWorkflow(container).run({
      input: { ids: soie.map((p: any) => p.id) },
    })
    logger.info("🧹 Taie d'oreiller soie supprimée.")
  }

  // 2. Catégorie Bien-être & Confort
  const { data: cats } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle"],
    filters: { handle: "bien-etre-confort" },
  })
  if (cats.length) {
    await deleteProductCategoriesWorkflow(container).run({
      input: cats.map((c: any) => c.id),
    })
    logger.info("🧹 Catégorie Bien-être & Confort supprimée.")
  }

  logger.info("🎁 Terminé.")
}
