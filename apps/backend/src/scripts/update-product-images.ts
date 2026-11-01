import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import { readFileSync } from "fs"

/**
 * Met à jour les PHOTOS d'un produit (galerie + photos par couleur + vignette)
 * sans toucher au reste (variantes, cj_pid, prix). Préserve les autres clés de
 * metadata, ne remplace que colorImages.
 *
 * Config /tmp/product-images.json :
 * { "handle":"...", "thumbnail":"/produits/.../x.webp",
 *   "colorImages": { "Noir":["/produits/.../noir-1.webp", ...], ... } }
 *
 * Lancer : PIMAGES=/tmp/product-images.json npx medusa exec ./src/scripts/update-product-images.ts
 */
const PATH = process.env.PIMAGES || "/tmp/product-images.json"

export default async function updateProductImages({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const cfg = JSON.parse(readFileSync(PATH, "utf-8")) as {
    handle: string
    thumbnail?: string
    colorImages: Record<string, string[]>
  }

  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "metadata"],
    filters: { handle: cfg.handle },
  })
  if (!data.length) {
    logger.error(`❌ produit introuvable: ${cfg.handle}`)
    return
  }
  const p: any = data[0]

  // Galerie = toutes les images (dédupliquées, ordre stable).
  const all = Array.from(new Set(Object.values(cfg.colorImages).flat()))
  const metadata = { ...(p.metadata || {}), colorImages: cfg.colorImages }

  await updateProductsWorkflow(container).run({
    input: {
      selector: { id: p.id },
      update: {
        thumbnail: cfg.thumbnail || all[0],
        images: all.map((url) => ({ url })),
        metadata,
      } as any,
    },
  })

  logger.info(
    `✅ ${cfg.handle} : ${all.length} photos, ${
      Object.keys(cfg.colorImages).length
    } couleurs mises à jour.`
  )
}
