import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  deleteProductsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * 1) Aspirateur : 2 photos (robot + gros plan brosse).
 * 2) Supprime la machine à lait inox (latteo-machine-lait-vegetal) —
 *    on garde la machine portable verte.
 *
 * Lancer : npx medusa exec ./src/scripts/vac-photos-remove-inox.ts
 */
export default async function vacPhotosRemoveInox({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  // 1. Aspirateur : 2 images
  const { data: vac } = await query.graph({
    entity: "product",
    fields: ["id"],
    filters: { handle: "aspirateur-robot-18000-pa" },
  })
  if (vac.length) {
    const imgs = [
      "/produits/aspirateur/robot.webp",
      "/produits/aspirateur/robot-2.webp",
    ]
    await updateProductsWorkflow(container).run({
      input: {
        products: [
          {
            id: vac[0].id,
            thumbnail: imgs[0],
            images: imgs.map((url) => ({ url })),
          },
        ],
      },
    })
    logger.info("✅ Aspirateur : 2 photos appliquées.")
  }

  // 2. Supprimer la machine inox
  const { data: inox } = await query.graph({
    entity: "product",
    fields: ["id"],
    filters: { handle: "latteo-machine-lait-vegetal" },
  })
  if (inox.length) {
    await deleteProductsWorkflow(container).run({
      input: { ids: inox.map((p: any) => p.id) },
    })
    logger.info("🧹 Machine à lait inox (Lattéo) supprimée.")
  } else {
    logger.info("Machine inox déjà absente.")
  }

  logger.info("🎁 Terminé.")
}
