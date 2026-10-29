import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

/** Passe le prix de l'aspirateur à 99 CHF/EUR sur toutes ses variantes. */
export default async function setAspiPrice({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product", fields: ["id", "variants.id"],
    filters: { handle: "aspirateur-robot-18000-pa" },
  })
  if (!data.length) throw new Error("Aspirateur introuvable.")
  await updateProductsWorkflow(container).run({
    input: { products: [{ id: data[0].id, variants: data[0].variants.map((v: any) => ({
      id: v.id, prices: [{ amount: 99, currency_code: "chf" }, { amount: 99, currency_code: "eur" }],
    })) }] },
  })
  logger.info(`✅ Aspirateur : prix 99 CHF/EUR sur ${data[0].variants.length} variantes.`)
}
