import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Ajoute le VID CJ (id de variante, requis par createOrderV2) dans les
 * metadata de chaque variante de la taie en soie DÉJÀ créée en base.
 * (add-soie.ts est idempotent et ne met pas à jour un produit existant.)
 *
 * Mapping par code SKU interne (SOIE-<CODE>-<U|D>) -> VID CJ.
 *
 * Lancer depuis apps/backend :
 *   npx medusa exec ./src/scripts/update-soie-cj-vid.ts
 */

const HANDLE = "taie-soie-mulberry"

// code SKU interne -> VID CJ du coloris.
const VID_BY_CODE: Record<string, string> = {
  BLNC: "26DABF97-DB06-4913-BFD7-58D4C6B3D838",
  CHMP: "41DCEC1F-98D1-4C52-8F6B-6A1834056599",
  ORRS: "3C1E75A2-5A8F-4267-88DE-B1EF67E462D5",
  RSPD: "9B4C5177-3756-4819-8A97-BBB82BDD542C",
  ROSE: "D769106F-6384-4B6D-AC6E-84E5C0172558",
  GRPL: "C323E94B-E2E7-4452-B0DA-C4757113692F",
  GRAN: "B9DCC132-64AD-4597-B75E-49270703356A",
  BLNT: "B4B9115C-ABC8-4824-BB02-5D2DF30E0030",
  BLPA: "C84A6096-D785-4545-BFD6-B9E20797A051",
  EMER: "E58D7472-94EE-4568-AECF-ECCFB993B2F8",
  TERR: "394F73C7-C9A0-45EC-B08E-5D55788CB68F",
  RUBI: "FACD0B44-B97E-4E78-AC8C-B0091F4F1952",
}

export default async function updateSoieCjVid({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: prods } = await query.graph({
    entity: "product",
    fields: ["id", "title", "variants.id", "variants.sku", "variants.metadata"],
    filters: { handle: HANDLE },
  })

  if (!prods.length) {
    throw new Error(`Produit introuvable pour le handle "${HANDLE}".`)
  }
  const product = prods[0]

  let patched = 0
  let skipped = 0

  const variants = product.variants.map((v: any) => {
    // SKU attendu : SOIE-<CODE>-<U|D>  ->  code = 2e segment
    const code = (v.sku || "").split("-")[1]
    const vid = code ? VID_BY_CODE[code] : undefined
    if (!vid) {
      skipped++
      return { id: v.id, metadata: v.metadata || {} }
    }
    patched++
    return {
      id: v.id,
      metadata: { ...(v.metadata || {}), cj_vid: vid },
    }
  })

  await updateProductsWorkflow(container).run({
    input: { products: [{ id: product.id, variants }] },
  })

  logger.info(
    `✅ VID CJ ajoutés sur "${product.title}" : ${patched} variante(s) mises à jour, ${skipped} ignorée(s).`
  )
}
