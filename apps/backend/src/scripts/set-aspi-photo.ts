import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

/** Remplace la photo de l'aspirateur par le vrai robot (basique, $22). */
export default async function setAspiPhoto({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product", fields: ["id"], filters: { handle: "aspirateur-robot-18000-pa" },
  })
  if (!data.length) throw new Error("Aspirateur introuvable.")
  const img = "/produits/aspirateur/robot-basic.webp"
  await updateProductsWorkflow(container).run({
    input: { products: [{ id: data[0].id, thumbnail: img, images: [{ url: img }] }] },
  })
  logger.info("✅ Aspirateur : photo du vrai robot (basique) appliquée.")
}
