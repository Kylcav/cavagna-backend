import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Remet les VRAIS prix après le test à 1 CHF (set-test-price.ts).
 * Par handle, toutes variantes, CHF + EUR au meme montant. Ne touche QUE les prix
 * (pas de recreation produit -> conserve IDs, variantes, mapping CJ, photos).
 *   npx medusa exec ./src/scripts/restore-prices.ts
 */
const PRICES: Record<string, number> = {
  "aspirateur-robot-18000-pa": 99,
  "machine-lait-portable": 129,
  "projecteur-mini-hd": 89,
  "ceinture-ems-abdominale": 69,
  "porte-cartes-popup-alu": 59,
  "extension-cheveux-halo": 60,
  "lip-plumper-gloss": 25,
  "jawline-trainer-masseter": 29,
  "balle-anti-destruction-chien": 59,
  "feutres-coloriage-double-pointe": 29,
  "poele-pierre-antiadhesive": 59,
}

export default async function restorePrices({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: prods } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "title", "variants.id"],
  })

  let done = 0
  const missing: string[] = []
  for (const [handle, amount] of Object.entries(PRICES)) {
    const p = prods.find((x: any) => x.handle === handle)
    if (!p) {
      missing.push(handle)
      continue
    }
    await updateProductsWorkflow(container).run({
      input: {
        products: [
          {
            id: p.id,
            variants: p.variants.map((v: any) => ({
              id: v.id,
              prices: [
                { amount, currency_code: "chf" },
                { amount, currency_code: "eur" },
              ],
            })),
          },
        ],
      },
    })
    logger.info(`✅ ${handle} -> ${amount} CHF/EUR (${p.variants.length} variantes)`)
    done++
  }

  if (missing.length) {
    logger.warn(`⚠️ Handles introuvables (ignorés) : ${missing.join(", ")}`)
  }
  logger.info(`🏁 Prix restaurés sur ${done}/${Object.keys(PRICES).length} produits.`)
}
