import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Ajoute la photo INTÉRIEUR comme 2e image de chaque coloris du porte-cartes,
 * SANS recréer le produit (préserve id, variantes, mapping CJ).
 * - metadata.colorImages[coul] = [extérieur, intérieur]  -> fiche produit : survol = intérieur du coloris
 * - product.images ordonnées [noir ext, noir int, ...]    -> carte boutique : survol (images[1]) = intérieur noir
 *   npx medusa exec ./src/scripts/add-portecartes-interior.ts
 */
const BASE = "/produits/porte-cartes-popup"
const COLOR_IMAGES: Record<string, string[]> = {
  Noir: [`${BASE}/noir.webp`, `${BASE}/noir-interieur.webp`],
  Rouge: [`${BASE}/rouge.webp`, `${BASE}/rouge-interieur.webp`],
  Bleu: [`${BASE}/bleu.webp`, `${BASE}/bleu-interieur.webp`],
  Orange: [`${BASE}/orange.webp`, `${BASE}/orange-interieur.webp`],
}

export default async function ({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "metadata"],
    filters: { handle: "porte-cartes-popup-alu" },
  })
  const p: any = data?.[0]
  if (!p) {
    logger.error("❌ porte-cartes-popup-alu introuvable")
    return
  }

  const images = [
    ...COLOR_IMAGES.Noir,
    ...COLOR_IMAGES.Rouge,
    ...COLOR_IMAGES.Bleu,
    ...COLOR_IMAGES.Orange,
  ].map((url) => ({ url }))

  await updateProductsWorkflow(container).run({
    input: {
      products: [
        {
          id: p.id,
          images,
          metadata: { ...(p.metadata || {}), colorImages: COLOR_IMAGES },
        },
      ],
    },
  })

  logger.info(
    "✅ Porte-cartes : photo intérieur ajoutée par coloris (Noir/Rouge/Bleu/Orange)."
  )
}
