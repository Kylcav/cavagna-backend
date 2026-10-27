import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * CORRECTIF : rattache la taie en soie au profil d'expédition
 * "Aspirateur - Livraison gratuite" (options livraison 0.- pour Europe + Suisse,
 * déjà créé par setup-aspirateur-eur-shipping.ts).
 *
 * Sans ça, la soie était sur un profil SANS méthode d'expédition valide →
 * le paiement passait mais la commande ne se créait pas
 * ("cart items require shipping profiles that are not satisfied...").
 *
 * Lancer : npx medusa exec ./src/scripts/fix-soie-shipping.ts
 */

const SOIE_HANDLE = "taie-soie-mulberry"
const PROFILE_NAME = "Aspirateur - Livraison gratuite"

export default async function fixSoieShipping({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)

  // Le profil "livraison gratuite" (celui de l'aspirateur : EU + CH).
  const { data: profiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id", "name"],
  })
  const target = profiles.find((p: any) => p.name === PROFILE_NAME)
  if (!target) {
    throw new Error(
      `Profil "${PROFILE_NAME}" introuvable. Lance d'abord setup-aspirateur-eur-shipping.ts.`
    )
  }

  // Le produit soie + son profil actuel.
  const { data: prods } = await query.graph({
    entity: "product",
    fields: ["id", "title", "shipping_profile.id", "shipping_profile.name"],
    filters: { handle: SOIE_HANDLE },
  })
  if (!prods.length) throw new Error("Produit soie introuvable.")
  const soie = prods[0]
  const current = soie.shipping_profile?.id

  if (current === target.id) {
    logger.info("Soie déjà rattachée au bon profil. Rien à faire.")
    return
  }

  // Détache l'ancien profil puis rattache le bon.
  if (current) {
    await link.dismiss({
      [Modules.PRODUCT]: { product_id: soie.id },
      [Modules.FULFILLMENT]: { shipping_profile_id: current },
    })
  }
  await link.create({
    [Modules.PRODUCT]: { product_id: soie.id },
    [Modules.FULFILLMENT]: { shipping_profile_id: target.id },
  })

  logger.info(
    `✅ "${soie.title}" rattachée au profil "${target.name}" (livraison gratuite EU + CH). Le checkout va maintenant aboutir.`
  )
}
