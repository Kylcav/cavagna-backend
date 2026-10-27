import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Met TOUS les maillots de bain + accessoires (casquettes, pareo) à 500.-
 * (500 CHF ET 500 EUR) sur toutes leurs variantes (toutes les tailles).
 *
 * Les produits "tunnel" (aspirateur, taie en soie) sont EXCLUS.
 *
 * Lancer : npx medusa exec ./src/scripts/set-maillots-price.ts
 */

const PRICE = 500
const EXCLUDE_HANDLES = [
  "aspirateur-robot-18000-pa",
  "taie-soie-mulberry",
]

export default async function setMaillotsPrice({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: prods } = await query.graph({
    entity: "product",
    fields: ["id", "title", "handle", "variants.id"],
    pagination: { take: 500, skip: 0 },
  })

  const targets = prods.filter(
    (p: any) => !EXCLUDE_HANDLES.includes(p.handle)
  )

  if (!targets.length) {
    logger.info("Aucun produit à mettre à jour.")
    return
  }

  const products = targets.map((p: any) => ({
    id: p.id,
    variants: (p.variants || []).map((v: any) => ({
      id: v.id,
      prices: [
        { amount: PRICE, currency_code: "chf" },
        { amount: PRICE, currency_code: "eur" },
      ],
    })),
  }))

  await updateProductsWorkflow(container).run({ input: { products } })

  const variantCount = products.reduce(
    (n, p) => n + p.variants.length,
    0
  )
  logger.info(
    `✅ ${targets.length} produits (maillots + accessoires) mis à ${PRICE} CHF / ${PRICE} EUR ` +
      `(${variantCount} variantes). Exclus : ${EXCLUDE_HANDLES.join(", ")}.`
  )
  logger.info(
    `Produits modifiés : ${targets.map((p: any) => p.handle).join(", ")}`
  )
}
