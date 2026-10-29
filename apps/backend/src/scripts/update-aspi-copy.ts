import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Aligne le titre + la description de l'aspirateur sur le vrai produit
 * (robot balai/laveur basique ~$22) — fini les specs premium mensongères
 * (18000 Pa, laser, station).
 *
 * Lancer : npx medusa exec ./src/scripts/update-aspi-copy.ts
 */
export default async function updateAspiCopy({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data } = await query.graph({
    entity: "product",
    fields: ["id"],
    filters: { handle: "aspirateur-robot-18000-pa" },
  })
  if (!data.length) throw new Error("Aspirateur introuvable.")

  await updateProductsWorkflow(container).run({
    input: {
      products: [
        {
          id: data[0].id,
          title: "Robot balai & laveur 3-en-1",
          subtitle: "Balaie, aspire et passe la serpillière",
          description:
            "Un petit robot malin qui fait le sale boulot à ta place. Il balaie, " +
            "ramasse la poussière et passe la serpillière en un seul passage, grâce à " +
            "ses brosses latérales et sa lingette microfibre. Réservoir spray/humidificateur " +
            "pour rafraîchir l'air, rechargeable par USB, ultra-silencieux. Parfait pour " +
            "l'entretien quotidien des parquets et carrelages, et pour passer sous les meubles. " +
            "Livré avec brosses de rechange, lingette, brosse de nettoyage et flacon de remplissage.",
        },
      ],
    },
  })

  logger.info("✅ Aspirateur : titre + description alignés (robot balai honnête).")
}
