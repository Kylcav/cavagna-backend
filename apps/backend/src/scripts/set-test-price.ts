import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * TEST : met TOUTES les variantes de TOUS les produits à un prix donné.
 *   TEST_PRICE=1 npx medusa exec ./src/scripts/set-test-price.ts   (défaut 1)
 * Pour revenir aux vrais prix : relancer set-color-variants.ts + les prix uniques.
 */
export default async function setTestPrice({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const amount = Number(process.env.TEST_PRICE || "1")
  const { data: prods } = await query.graph({
    entity: "product", fields: ["id", "title", "variants.id"],
  })
  const input = prods.map((p: any) => ({
    id: p.id,
    variants: p.variants.map((v: any) => ({
      id: v.id,
      prices: [{ amount, currency_code: "chf" }, { amount, currency_code: "eur" }],
    })),
  }))
  for (const prod of input) {
    await updateProductsWorkflow(container).run({ input: { products: [prod] } })
  }
  logger.info(`✅ TEST : ${input.length} produits mis à ${amount} CHF/EUR (toutes variantes).`)
}
