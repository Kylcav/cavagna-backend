import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Met à jour les images du produit aspirateur pour pointer sur les visuels
 * hébergés par le storefront lui-même (chemins relatifs servis depuis /public).
 * Évite la dépendance à un CDN externe + l'erreur next/image (host non whitelisté).
 *
 * Lancer depuis apps/backend :  npx medusa exec ./src/scripts/update-vacuum-images.ts
 */
export default async function update_vacuum_images({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const HANDLE = "aspirateur-robot-18000-pa"

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
    filters: { handle: HANDLE },
  })
  if (!products.length) {
    throw new Error(`Produit introuvable (handle ${HANDLE}).`)
  }
  const id = products[0].id

  await updateProductsWorkflow(container).run({
    input: {
      products: [
        {
          id,
          thumbnail: "/aspirateur/robot-noir.webp",
          images: [
            { url: "/aspirateur/robot-noir.webp" },
            { url: "/aspirateur/robot-blanc.webp" },
          ],
        },
      ],
    },
  })

  logger.info(`✅ Images du produit ${id} mises à jour (chemins /aspirateur/*).`)
}
