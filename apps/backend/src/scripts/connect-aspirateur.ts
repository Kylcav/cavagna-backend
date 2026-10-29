import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Connecte l'aspirateur à CJ (robot rentable ~$22, noir uniquement).
 * Toutes les variantes pointent vers le même vid (CJ ne propose que le noir).
 *
 * Lancer : npx medusa exec ./src/scripts/connect-aspirateur.ts
 */
const CJ_PID = "2043957830356676609"
const CJ_VID = "2043957830549614593"
const CJ_SKU = "CJFU283376401AZ"

export default async function connectAspirateur({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: prods } = await query.graph({
    entity: "product",
    fields: ["id", "metadata", "variants.id", "variants.metadata"],
    filters: { handle: "aspirateur-robot-18000-pa" },
  })
  if (!prods.length) {
    throw new Error("Aspirateur introuvable.")
  }
  const p = prods[0]

  await updateProductsWorkflow(container).run({
    input: {
      products: [
        {
          id: p.id,
          metadata: { ...(p.metadata || {}), cj_pid: CJ_PID },
          variants: p.variants.map((v: any) => ({
            id: v.id,
            metadata: {
              ...(v.metadata || {}),
              cj_vid: CJ_VID,
              cj_sku: CJ_SKU,
              cj_qty: 1,
            },
          })),
        },
      ],
    },
  })

  logger.info(
    `✅ Aspirateur connecté CJ (pid=${CJ_PID}, vid=${CJ_VID}) sur ${p.variants.length} variante(s).`
  )
}
