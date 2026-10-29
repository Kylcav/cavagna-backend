import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateShippingOptionsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Corrige le checkout : repointe toutes les options de livraison vers le profil
 * d'expédition "Default" (celui qu'utilisent les 11 produits). Avant ce fix,
 * l'option "Livraison gratuite" pointait vers un profil orphelin (Aspirateur)
 * -> la finalisation du panier échouait (400) alors que Stripe débitait.
 *
 * Lancer : npx medusa exec ./src/scripts/fix-shipping-profile.ts
 */
export default async function fix({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const q = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: profs } = await q.graph({
    entity: "shipping_profile",
    fields: ["id", "name"],
  })
  const def = profs.find((p: any) => /default/i.test(p.name))
  if (!def) throw new Error("Profil Default introuvable")

  const { data: opts } = await q.graph({
    entity: "shipping_option",
    fields: ["id", "name", "shipping_profile_id"],
  })
  const toFix = opts.filter((o: any) => o.shipping_profile_id !== def.id)
  if (!toFix.length) {
    logger.info("Rien à corriger : toutes les options sont déjà sur Default.")
    return
  }

  await updateShippingOptionsWorkflow(container).run({
    input: toFix.map((o: any) => ({
      id: o.id,
      shipping_profile_id: def.id,
    })),
  })
  logger.info(
    `✅ ${toFix.length} option(s) de livraison repointée(s) vers Default : ${toFix
      .map((o: any) => o.name)
      .join(", ")}`
  )
}
