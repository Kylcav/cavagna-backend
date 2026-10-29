import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  updateProductsWorkflow,
  createPriceListsWorkflow,
  deletePriceListsWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * Affiche un prix barré sur le porte-cartes : base 99 → soldé 59 (-40%), CHF + EUR.
 * Prix de base = 99 (le "Original" barré), liste de prix "sale" = 59 (le prix affiché).
 * Idempotent : supprime la liste "Solde Porte-cartes" existante avant de recréer.
 *   npx medusa exec ./src/scripts/set-portecartes-sale.ts
 */
const BASE = 99
const SALE = 59
const TITLE = "Solde Porte-cartes -40%"

export default async function ({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "title", "variants.id", "variants.title"],
    filters: { handle: "porte-cartes-popup-alu" },
  })
  const p: any = data?.[0]
  if (!p) {
    logger.error("❌ porte-cartes introuvable")
    return
  }
  const variants = p.variants || []

  // 1) Prix de BASE = 99 (le prix "Original" barré)
  await updateProductsWorkflow(container).run({
    input: {
      products: [
        {
          id: p.id,
          variants: variants.map((v: any) => ({
            id: v.id,
            prices: [
              { amount: BASE, currency_code: "chf" },
              { amount: BASE, currency_code: "eur" },
            ],
          })),
        },
      ],
    },
  })
  logger.info(`✅ Prix de base → ${BASE} CHF/EUR (${variants.length} variantes)`)

  // 2) Supprime une éventuelle ancienne liste de solde (idempotence)
  const { data: existing } = await query.graph({
    entity: "price_list",
    fields: ["id", "title"],
    filters: { title: TITLE } as any,
  })
  if (existing?.length) {
    await deletePriceListsWorkflow(container).run({
      input: { ids: existing.map((e: any) => e.id) },
    })
    logger.info(`🧹 Ancienne liste "${TITLE}" supprimée`)
  }

  // 3) Liste de prix SOLDE = 59 (le prix affiché, avec -40%)
  const prices = variants.flatMap((v: any) => [
    { amount: SALE, currency_code: "chf", variant_id: v.id },
    { amount: SALE, currency_code: "eur", variant_id: v.id },
  ])
  await createPriceListsWorkflow(container).run({
    input: {
      price_lists_data: [
        {
          title: TITLE,
          description: "Promotion lancement porte-cartes (-40%)",
          type: "sale",
          status: "active",
          prices,
        } as any,
      ],
    },
  })
  logger.info(`✅ Solde créé : ${SALE} CHF/EUR → affichage ~~${BASE}~~ ${SALE} (-40%)`)
}
