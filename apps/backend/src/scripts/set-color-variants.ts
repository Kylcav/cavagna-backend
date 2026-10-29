import { MedusaContainer } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  deleteProductsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * Passe porte-cartes + ceinture EMS en MULTI-VARIANTES couleur, chaque couleur
 * ayant sa propre photo (product.metadata.colorImages[couleur]) + son mapping
 * CJ (cj_vid/cj_sku sur la variante). Met aussi les photos de la poêle.
 *
 * L'image de la fiche suit la couleur sélectionnée (voir ImageGallery front).
 *
 * Lancer :  npx medusa exec ./src/scripts/set-color-variants.ts
 */

type ColorVariant = {
  value: string
  vid: string
  sku: string
  images: string[]
}

type ColorProduct = {
  handle: string
  title: string
  price: number
  category: string
  description: string
  cj_pid: string
  thumbnail: string
  colors: ColorVariant[]
}

const PORTE_CARTES: ColorProduct = {
  handle: "porte-cartes-popup-alu",
  title: "Porte-cartes pop-up aluminium",
  price: 59,
  category: "mode-beaute",
  description:
    "Un geste, tes cartes se déploient en éventail. Boîtier aluminium anti-RFID " +
    "qui protège tes cartes du piratage sans contact, format ultra-fin pour la poche. " +
    "Poche zippée pour la monnaie. Élégant, pratique, le cadeau parfait pour lui comme pour elle.",
  cj_pid: "2604010340051610800",
  thumbnail: "/produits/porte-cartes-popup/noir.webp",
  colors: [
    { value: "Noir", vid: "2604010340051612100", sku: "CJQB281440404DW", images: ["/produits/porte-cartes-popup/noir.webp"] },
    { value: "Rouge", vid: "2604010340051611100", sku: "CJQB281440401AZ", images: ["/produits/porte-cartes-popup/rouge.webp"] },
    { value: "Bleu", vid: "2604010340051611800", sku: "CJQB281440403CX", images: ["/produits/porte-cartes-popup/bleu.webp"] },
    { value: "Orange", vid: "2604010340051611500", sku: "CJQB281440402BY", images: ["/produits/porte-cartes-popup/orange.webp"] },
  ],
}

const EMS: ColorProduct = {
  handle: "ceinture-ems-abdominale",
  title: "Ceinture EMS abdominale",
  price: 69,
  category: "tech-maison",
  description:
    "Tonifie tes abdos sans effort. La ceinture EMS envoie des micro-impulsions " +
    "qui font travailler les muscles pendant que tu vaques à tes occupations. " +
    "Rechargeable par USB, intensité réglable, à porter 20 min par jour. Le cadeau fitness malin.",
  cj_pid: "1562401247699939328",
  thumbnail: "/produits/ceinture-ems/bleu.webp",
  colors: [
    { value: "Bleu", vid: "1562401247788019712", sku: "CJJT154897101AZ", images: ["/produits/ceinture-ems/bleu.webp", "/produits/ceinture-ems/bleu-2.webp"] },
    { value: "Orange", vid: "1562401247788019713", sku: "CJJT154897102BY", images: ["/produits/ceinture-ems/orange.webp"] },
    { value: "Rouge", vid: "2610250833511617600", sku: "CJJT154897103CX", images: ["/produits/ceinture-ems/rouge.webp"] },
  ],
}

export default async function setColorVariants({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  // Contexte commun.
  const { data: catsNow } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle"],
  })
  const catIdByHandle: Record<string, string> = {}
  catsNow.forEach((c: any) => (catIdByHandle[c.handle] = c.id))

  const { data: stores } = await query.graph({
    entity: "store",
    fields: ["default_sales_channel_id"],
  })
  const { data: channels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name"],
  })
  const salesChannel =
    channels.find((c: any) => c.id === stores[0]?.default_sales_channel_id) ??
    channels[0]
  const { data: profiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  })
  const shippingProfile = profiles[0]

  for (const p of [PORTE_CARTES, EMS]) {
    // Supprime l'ancien produit mono-variante.
    const { data: existing } = await query.graph({
      entity: "product",
      fields: ["id"],
      filters: { handle: p.handle },
    })
    if (existing.length) {
      await deleteProductsWorkflow(container).run({
        input: { ids: existing.map((e: any) => e.id) },
      })
      logger.info(`🧹 ${p.handle} supprimé (recréation multi-couleurs).`)
    }

    // Images produit = toutes les couleurs (dédupliquées).
    const allImgs = Array.from(new Set(p.colors.flatMap((c) => c.images)))
    const colorImages: Record<string, string[]> = {}
    p.colors.forEach((c) => (colorImages[c.value] = c.images))

    await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: p.title,
            handle: p.handle,
            status: ProductStatus.PUBLISHED,
            shipping_profile_id: shippingProfile.id,
            category_ids: catIdByHandle[p.category]
              ? [catIdByHandle[p.category]]
              : [],
            description: p.description,
            thumbnail: p.thumbnail,
            images: allImgs.map((url) => ({ url })),
            options: [{ title: "Couleur", values: p.colors.map((c) => c.value) }],
            variants: p.colors.map((c) => ({
              title: c.value,
              sku: `${p.handle.toUpperCase().slice(0, 16)}-${c.value.slice(0, 3).toUpperCase()}`,
              manage_inventory: false,
              options: { Couleur: c.value },
              prices: [
                { amount: p.price, currency_code: "chf" },
                { amount: p.price, currency_code: "eur" },
              ],
              metadata: { cj_vid: c.vid, cj_sku: c.sku, cj_qty: 1 },
            })),
            sales_channels: [{ id: salesChannel.id }],
            metadata: { cj_pid: p.cj_pid, colorImages },
          },
        ],
      },
    })
    logger.info(`✅ ${p.title} recréé avec ${p.colors.length} couleurs + photos.`)
  }

  // Poêle : remplace les photos CJ par les vraies (verte).
  const { data: poele } = await query.graph({
    entity: "product",
    fields: ["id", "metadata"],
    filters: { handle: "poele-pierre-antiadhesive" },
  })
  if (poele.length) {
    const imgs = [
      "/produits/poele-pierre/vert-1.webp",
      "/produits/poele-pierre/vert-2.webp",
    ]
    await updateProductsWorkflow(container).run({
      input: {
        products: [
          {
            id: poele[0].id,
            thumbnail: imgs[0],
            images: imgs.map((url) => ({ url })),
          },
        ],
      },
    })
    logger.info("✅ Poêle : photos vertes mises à jour.")
  }

  logger.info("🎨 Variantes couleur + photos terminées.")
}
