import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * TEST UNIQUEMENT : met toutes les variantes de la taie en soie à 1.-
 * (1 CHF et 1 EUR) pour pouvoir passer une commande test à moindre coût.
 *
 * ⚠️ À utiliser seulement pour tester le flux (email client, email marchand,
 * synchro CJ). REMETTRE les vrais prix juste après avec :
 *   npx medusa exec ./src/scripts/setup-soie-eur.ts   (rétablit 59 / 89)
 *
 * Lancer : npx medusa exec ./src/scripts/set-soie-test-price.ts
 */

const HANDLE = "taie-soie-mulberry"

export default async function setSoieTestPrice({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: prods } = await query.graph({
    entity: "product",
    fields: ["id", "title", "variants.id"],
    filters: { handle: HANDLE },
  })
  if (!prods.length) {
    throw new Error(`Produit introuvable pour le handle "${HANDLE}".`)
  }
  const product = prods[0]

  const variants = product.variants.map((v: any) => ({
    id: v.id,
    prices: [
      { amount: 1, currency_code: "chf" },
      { amount: 1, currency_code: "eur" },
    ],
  }))

  await updateProductsWorkflow(container).run({
    input: { products: [{ id: product.id, variants }] },
  })

  logger.info(
    `✅ TEST : ${variants.length} variantes de "${product.title}" mises à 1.- (CHF/EUR). ` +
      `Pense à rétablir 59/89 avec setup-soie-eur.ts après le test.`
  )
}
