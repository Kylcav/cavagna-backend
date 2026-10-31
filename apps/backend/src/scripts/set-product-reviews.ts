import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import { readFileSync } from "fs"

/**
 * Ajoute de VRAIS avis clients à des produits (metadata.reviews), sans toucher
 * au reste des métadonnées (cj_pid, colorImages...). N'INVENTE RIEN : les avis
 * viennent d'un fichier fourni par l'utilisateur (vrais retours d'acheteurs).
 *
 * Format /tmp/reviews.json :
 * { "porte-cartes-boitier-alu": [
 *     { "author":"Marc D.", "country":"Suisse", "date":"28/10/2026",
 *       "rating":5, "title":"Top", "text":"...", "verified":true }
 *   ] }
 *
 * Lancer : REVIEWS=/tmp/reviews.json npx medusa exec ./src/scripts/set-product-reviews.ts
 */
const PATH = process.env.REVIEWS || "/tmp/reviews.json"

export default async function setProductReviews({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const byHandle: Record<string, any[]> = JSON.parse(readFileSync(PATH, "utf-8"))

  for (const [handle, reviews] of Object.entries(byHandle)) {
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "metadata"],
      filters: { handle },
    })
    if (!data.length) {
      logger.warn(`⚠️ produit introuvable: ${handle}`)
      continue
    }
    const p: any = data[0]
    const metadata = { ...(p.metadata || {}), reviews }

    await updateProductsWorkflow(container).run({
      input: { selector: { id: p.id }, update: { metadata } },
    })
    logger.info(`✅ ${handle}: ${reviews.length} avis enregistrés.`)
  }

  logger.info("🎉 Avis mis à jour.")
}
