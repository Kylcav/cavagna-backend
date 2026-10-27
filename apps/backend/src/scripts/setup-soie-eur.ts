import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  updateProductsWorkflow,
  updateRegionsWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * Active l'affichage en EUR pour la taie en soie (/soie) :
 *  1) ajoute les prix EUR aux 24 variantes (59 € l'unité / 89 € le lot de 2),
 *     à côté des prix CHF existants ;
 *  2) ajoute Monaco (mc) à la région Europe (EUR) — FR, BE, LU y sont déjà.
 *
 * Résultat : FR / BE / LU / MC (et le reste de l'UE) voient des euros, et seule
 * la Suisse reste en CHF.
 *
 * Lancer depuis apps/backend :
 *   npx medusa exec ./src/scripts/setup-soie-eur.ts
 */

const HANDLE = "taie-soie-mulberry"
const PRICE_UNITE = 59
const PRICE_DUO = 89

export default async function setupSoieEur({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  // 1) Prix EUR sur les variantes de la soie.
  const { data: prods } = await query.graph({
    entity: "product",
    fields: ["id", "title", "variants.id", "variants.sku"],
    filters: { handle: HANDLE },
  })
  if (!prods.length) {
    throw new Error(`Produit introuvable pour le handle "${HANDLE}".`)
  }
  const product = prods[0]

  const variants = product.variants.map((v: any) => {
    // SKU : SOIE-<CODE>-<U|D>  ->  U = 1 taie (59), D = lot de 2 (89)
    const isDuo = (v.sku || "").endsWith("-D")
    const amount = isDuo ? PRICE_DUO : PRICE_UNITE
    return {
      id: v.id,
      prices: [
        { amount, currency_code: "chf" },
        { amount, currency_code: "eur" },
      ],
    }
  })

  await updateProductsWorkflow(container).run({
    input: { products: [{ id: product.id, variants }] },
  })
  logger.info(
    `✅ Prix EUR ajoutés sur "${product.title}" (${variants.length} variantes : 59 €/89 €).`
  )

  // 2) Ajoute Monaco (mc) à la région Europe (EUR).
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name", "currency_code", "countries.iso_2"],
  })
  const europe = regions.find((r: any) => r.currency_code === "eur")
  if (!europe) {
    logger.warn("Région EUR introuvable, Monaco non ajouté.")
    return
  }

  const current: string[] = (europe.countries || []).map((c: any) => c.iso_2)
  if (current.includes("mc")) {
    logger.info("Monaco déjà dans la région Europe. Rien à faire.")
    return
  }

  const countries = Array.from(new Set([...current, "mc"]))
  await updateRegionsWorkflow(container).run({
    input: { selector: { id: europe.id }, update: { countries } },
  })
  logger.info(
    `✅ Monaco (mc) ajouté à la région "${europe.name}" (${countries.length} pays).`
  )
}
