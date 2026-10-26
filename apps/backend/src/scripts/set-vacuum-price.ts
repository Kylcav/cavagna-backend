import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Change le prix de l'aspirateur (test Stripe).
 *   VAC_CHF=1 npx medusa exec ./src/scripts/set-vacuum-price.ts   -> 1 CHF (EUR reste 199)
 *   npx medusa exec ./src/scripts/set-vacuum-price.ts             -> remet 199 / 199
 */
export default async function setPrice({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const CHF = Number(process.env.VAC_CHF || "199")
  const EUR = Number(process.env.VAC_EUR || "199")

  const { data: prods } = await query.graph({
    entity: "product",
    fields: ["id", "variants.id", "variants.title"],
    filters: { handle: "aspirateur-robot-18000-pa" },
  })
  if (!prods.length) throw new Error("Produit introuvable.")
  const product = prods[0]

  await updateProductsWorkflow(container).run({
    input: {
      products: [
        {
          id: product.id,
          variants: product.variants.map((v: any) => ({
            id: v.id,
            prices: [
              { amount: CHF, currency_code: "chf" },
              { amount: EUR, currency_code: "eur" },
            ],
          })),
        },
      ],
    },
  })

  logger.info(`✅ Prix aspirateur : ${CHF} CHF / ${EUR} EUR`)
}
