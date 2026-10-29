import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * Corrige le checkout : repointe les options de livraison dont le profil
 * d'expédition ne correspond à aucun produit (profil orphelin) vers le profil
 * "Default" (celui des 11 produits). Sans ça, choisir "Livraison gratuite"
 * faisait échouer la finalisation du panier (400) alors que Stripe débitait.
 *
 * Non destructif : on met simplement à jour le profil des options.
 *
 * Lancer : npx medusa exec ./src/scripts/fix-shipping-profile.ts
 */
export default async function fix({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const q = container.resolve(ContainerRegistrationKeys.QUERY)
  const fulfillment = container.resolve(Modules.FULFILLMENT)

  const { data: profs } = await q.graph({
    entity: "shipping_profile",
    fields: ["id", "name"],
  })
  const def = profs.find((p: any) => /default/i.test(p.name))
  if (!def) throw new Error("Profil Default introuvable")

  const { data: prods } = await q.graph({
    entity: "product",
    fields: ["shipping_profile.id"],
  })
  const usedProfiles = new Set(
    prods.map((p: any) => p.shipping_profile?.id).filter(Boolean)
  )

  const { data: opts } = await q.graph({
    entity: "shipping_option",
    fields: ["id", "name", "shipping_profile_id"],
  })
  const orphan = opts.filter(
    (o: any) => !usedProfiles.has(o.shipping_profile_id)
  )
  if (!orphan.length) {
    logger.info("Rien à corriger : toutes les options couvrent un profil utilisé.")
    return
  }

  for (const o of orphan) {
    // Signature (id, data) -> met à jour une option à la fois.
    await fulfillment.updateShippingOptions(o.id, {
      shipping_profile_id: def.id,
    } as any)
    logger.info(`✅ "${o.name}" repointée vers le profil Default.`)
  }
  logger.info(`Terminé : ${orphan.length} option(s) corrigée(s).`)
}
