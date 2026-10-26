import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Remplace le contenu du produit aspirateur par le nouveau modèle
 * (aspirateur + laveur 35000 Pa, station auto-vidage). Garde le handle,
 * le prix, les variantes et le profil d'expédition (livraison gratuite).
 *
 * Lancer : npx medusa exec ./src/scripts/update-vacuum-product.ts
 */
export default async function update({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: prods } = await query.graph({
    entity: "product",
    fields: ["id"],
    filters: { handle: "aspirateur-robot-18000-pa" },
  })
  if (!prods.length) throw new Error("Produit introuvable.")

  await updateProductsWorkflow(container).run({
    input: {
      products: [
        {
          id: prods[0].id,
          title: "Robot Aspirateur & Laveur 35 000 Pa – Station Auto-Vidage",
          subtitle: "Aspire, lave et se vide tout seul",
          description:
            "Robot aspirateur et laveur multi-surfaces 2-en-1 : il aspire ET lave vos sols (humide et sec) " +
            "avec une puissance d'aspiration exceptionnelle de 35 000 Pa. Station d'auto-vidage, navigation " +
            "laser LDS + VSLAM pour une cartographie précise, pilotage par application, autonomie jusqu'à " +
            "180 minutes et réservoir d'eau de 4 L. Certifié CE.",
          thumbnail: "/aspirateur/robot.webp",
          images: [
            { url: "/aspirateur/robot.webp" },
            { url: "/aspirateur/robot-detail.webp" },
          ],
        },
      ],
    },
  })

  logger.info("✅ Produit mis à jour : Robot Aspirateur & Laveur 35 000 Pa")
}
