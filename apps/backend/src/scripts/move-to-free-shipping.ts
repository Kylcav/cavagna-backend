import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Corrige le checkout : met TOUS les produits sur le profil d'expédition qui
 * porte l'option "Livraison gratuite", pour que cette option couvre bien tous
 * les articles. Avant, les produits étaient sur "Default" et l'option gratuite
 * sur un profil orphelin -> la finalisation du panier échouait (400) alors que
 * Stripe débitait. En bonus : livraison gratuite pour tout le catalogue.
 *
 * Lancer : npx medusa exec ./src/scripts/move-to-free-shipping.ts
 */
export default async function move({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const q = container.resolve(ContainerRegistrationKeys.QUERY)

  // Profil qui porte une option "Livraison gratuite".
  const { data: opts } = await q.graph({
    entity: "shipping_option",
    fields: ["name", "shipping_profile_id"],
  })
  const freeOpt = opts.find((o: any) => /gratuit/i.test(o.name))
  if (!freeOpt?.shipping_profile_id) {
    throw new Error("Option 'Livraison gratuite' introuvable.")
  }
  const freeProfile = freeOpt.shipping_profile_id

  const { data: prods } = await q.graph({
    entity: "product",
    fields: ["id", "title", "shipping_profile.id"],
  })
  const toMove = prods.filter((p: any) => p.shipping_profile?.id !== freeProfile)
  if (!toMove.length) {
    logger.info("Tous les produits sont déjà sur le profil Livraison gratuite.")
    return
  }

  await updateProductsWorkflow(container).run({
    input: {
      products: toMove.map((p: any) => ({
        id: p.id,
        shipping_profile_id: freeProfile,
      })),
    },
  })
  logger.info(
    `✅ ${toMove.length} produit(s) déplacé(s) sur le profil Livraison gratuite (${freeProfile}). Le checkout couvre désormais tous les articles.`
  )
}
