import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductCategoriesWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Renomme une catégorie (le handle/URL reste inchangé).
 *
 *   CAT_HANDLE="fun-enfants" CAT_NAME="Fun, Enfants & Animaux" \
 *     npx medusa exec ./src/scripts/rename-category.ts
 *
 * Valeurs par défaut : fun-enfants -> "Fun, Enfants & Animaux".
 */
export default async function renameCategory({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const handle = process.env.CAT_HANDLE || "fun-enfants"
  const name = process.env.CAT_NAME || "Fun, Enfants & Animaux"

  const { data: cats } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle", "name"],
    filters: { handle },
  })
  if (!cats.length) {
    throw new Error(`Catégorie introuvable pour le handle "${handle}".`)
  }

  await updateProductCategoriesWorkflow(container).run({
    input: { selector: { id: cats[0].id }, update: { name } },
  })

  logger.info(`✅ Catégorie "${handle}" renommée : "${cats[0].name}" -> "${name}".`)
}
