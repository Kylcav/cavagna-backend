import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Associe une variante Medusa à sa variante CJdropshipping (pour la synchro
 * automatique des commandes). Enregistre cj_vid / cj_sku dans metadata.
 *
 *   CJ_VID="123456..." npx medusa exec ./src/scripts/set-cj-mapping.ts
 *   CJ_SKU="CJABC..."  npx medusa exec ./src/scripts/set-cj-mapping.ts
 *   CJ_PRODUCT_HANDLE="aspirateur-robot-18000-pa" CJ_VID="..." npx medusa exec ./src/scripts/set-cj-mapping.ts
 *
 * Par défaut, applique à TOUTES les variantes du produit (l'aspirateur n'en a qu'une).
 */
export default async function setCjMapping({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const handle = process.env.CJ_PRODUCT_HANDLE || "aspirateur-robot-18000-pa"
  const vid = process.env.CJ_VID
  const sku = process.env.CJ_SKU

  if (!vid && !sku) {
    throw new Error(
      "Fournis au moins CJ_VID ou CJ_SKU (idéalement CJ_VID, l'ID de variante CJ)."
    )
  }

  const { data: prods } = await query.graph({
    entity: "product",
    fields: ["id", "title", "variants.id", "variants.title", "variants.metadata"],
    filters: { handle },
  })

  if (!prods.length) {
    throw new Error(`Produit introuvable pour le handle "${handle}".`)
  }
  const product = prods[0]

  await updateProductsWorkflow(container).run({
    input: {
      products: [
        {
          id: product.id,
          variants: product.variants.map((v: any) => ({
            id: v.id,
            metadata: {
              ...(v.metadata || {}),
              ...(vid ? { cj_vid: vid } : {}),
              ...(sku ? { cj_sku: sku } : {}),
            },
          })),
        },
      ],
    },
  })

  logger.info(
    `✅ Mapping CJ enregistré sur "${product.title}" (${product.variants.length} variante(s)) : ${
      vid ? `cj_vid=${vid}` : ""
    } ${sku ? `cj_sku=${sku}` : ""}`.trim()
  )
}
