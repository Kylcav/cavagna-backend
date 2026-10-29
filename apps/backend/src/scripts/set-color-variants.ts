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
  /** Titre de l'option (défaut "Couleur"). Ex. "Modèle" pour le jawline. */
  optionTitle?: string
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
    { value: "Bleu", vid: "1562401247788019712", sku: "CJJT154897101AZ", images: ["/produits/ceinture-ems/bleu.webp"] },
    { value: "Orange", vid: "1562401247788019713", sku: "CJJT154897102BY", images: ["/produits/ceinture-ems/orange.webp"] },
    { value: "Rouge", vid: "2610250833511617600", sku: "CJJT154897103CX", images: ["/produits/ceinture-ems/rouge.webp"] },
  ],
}

const HALO: ColorProduct = {
  handle: "extension-cheveux-halo",
  title: "Extension de cheveux — queue-de-cheval ondulée",
  price: 60,
  category: "mode-beaute",
  description:
    "Une queue-de-cheval longue, ondulée et volumineuse en 30 secondes. " +
    "L'extension s'enroule autour de ta vraie attache et se fixe en un clin d'œil : " +
    "confortable, réutilisable, indétectable. Fibre haute qualité au toucher naturel, " +
    "résistante à la chaleur. Disponible en 7 teintes pour s'accorder à ta couleur.",
  cj_pid: "2608280831061610400",
  thumbnail: "/produits/extension-halo/chatain.webp",
  colors: [
    { value: "Noir", vid: "2608280831061611400", sku: "CJYD310532501AZ", images: ["/produits/extension-halo/noir.webp"] },
    { value: "Brun foncé", vid: "2608280831061611401", sku: "CJYD310532502BY", images: ["/produits/extension-halo/brun-fonce.webp"] },
    { value: "Chocolat", vid: "2608280831061611402", sku: "CJYD310532503CX", images: ["/produits/extension-halo/chocolat.webp"] },
    { value: "Châtain", vid: "2608280831061611403", sku: "CJYD310532504DW", images: ["/produits/extension-halo/chatain.webp"] },
    { value: "Caramel", vid: "2608280831061611404", sku: "CJYD310532505EV", images: ["/produits/extension-halo/caramel.webp"] },
    { value: "Blond clair", vid: "2608280831061611405", sku: "CJYD310532506FU", images: ["/produits/extension-halo/blond-clair.webp"] },
    { value: "Blond cendré", vid: "2608280831061611406", sku: "CJYD310532507GT", images: ["/produits/extension-halo/blond-cendre.webp"] },
  ],
}

const LIP: ColorProduct = {
  handle: "lip-plumper-gloss",
  title: "Lip Plumper — gloss repulpant",
  price: 25,
  category: "mode-beaute",
  description:
    "Des lèvres visiblement plus pulpeuses dès la première application. Ce gloss " +
    "repulpant hydrate et donne du volume avec un fini brillant non collant. " +
    "Effet avant/après bluffant, disponible en 8 teintes du nude pailleté au rouge intense.",
  cj_pid: "2408120516091605700",
  thumbnail: "/produits/lip-plumper/rose-vif.webp",
  colors: [
    { value: "Prune", vid: "2408120516091606200", sku: "CJKH210822001AZ", images: ["/produits/lip-plumper/prune.webp"] },
    { value: "Bordeaux", vid: "2408120516091607100", sku: "CJKH210822002BY", images: ["/produits/lip-plumper/bordeaux.webp"] },
    { value: "Rose pailleté", vid: "2408120516091607300", sku: "CJKH210822003CX", images: ["/produits/lip-plumper/rose-paillete.webp"] },
    { value: "Rose vif", vid: "2408120516091607500", sku: "CJKH210822004DW", images: ["/produits/lip-plumper/rose-vif.webp"] },
    { value: "Rouge", vid: "2408120516091607800", sku: "CJKH210822005EV", images: ["/produits/lip-plumper/rouge.webp"] },
    { value: "Pêche pailleté", vid: "2408120516091608100", sku: "CJKH210822006FU", images: ["/produits/lip-plumper/peche-paillete.webp"] },
    { value: "Vieux rose", vid: "2408120516091608400", sku: "CJKH210822007GT", images: ["/produits/lip-plumper/vieux-rose.webp"] },
    { value: "Rouge brique", vid: "2408120516091608700", sku: "CJKH210822008HS", images: ["/produits/lip-plumper/rouge-brique.webp"] },
  ],
}

const JAW = "/produits/jawline-trainer"
const JAWLINE: ColorProduct = {
  handle: "jawline-trainer-masseter",
  title: "Jawline Trainer — exerciseur mâchoire",
  price: 29,
  category: "fun-enfants",
  optionTitle: "Modèle",
  description:
    "Redessine ta ligne de mâchoire en quelques minutes par jour. Cet exerciseur " +
    "en silicone alimentaire fait travailler les muscles masséters, comme une salle " +
    "de sport pour le visage. Plusieurs modèles et niveaux de résistance, cordon de " +
    "maintien inclus. Discret et réutilisable.",
  cj_pid: "1679744815862386688",
  thumbnail: `${JAW}/boule-rouge.webp`,
  colors: [
    // Boule à clips (5e génération)
    { value: "Boule · Rouge", vid: "1679744816034353152", sku: "", images: [`${JAW}/boule-rouge.webp`] },
    { value: "Boule · Bleu", vid: "1679744816076296192", sku: "", images: [`${JAW}/boule-bleu.webp`] },
    { value: "Boule · Noir", vid: "1679744816051130368", sku: "", images: [`${JAW}/boule-noir.webp`] },
    // Cube arrondi (2e génération)
    { value: "Cube · Violet", vid: "1679744815916912640", sku: "", images: [`${JAW}/cube-violet.webp`] },
    { value: "Cube · Rouge", vid: "1679744815933689856", sku: "", images: [`${JAW}/cube-rouge.webp`] },
    { value: "Cube · Noir", vid: "1679744815883358208", sku: "", images: [`${JAW}/cube-noir.webp`] },
    { value: "Cube · Rose", vid: "1679744815967244288", sku: "", images: [`${JAW}/cube-rose.webp`] },
    { value: "Cube · Bleu", vid: "1679744815900135424", sku: "", images: [`${JAW}/cube-bleu.webp`] },
    { value: "Cube · Gris", vid: "1679744815950467072", sku: "", images: [`${JAW}/cube-gris.webp`] },
    // Carré 6 trous (3e génération)
    { value: "6 trous · Gris", vid: "1679744816000798720", sku: "", images: [`${JAW}/6trous-gris.webp`] },
    { value: "6 trous · Bleu", vid: "1679744816017575936", sku: "", images: [`${JAW}/6trous-bleu.webp`] },
    { value: "6 trous · Jaune", vid: "1679744815984021504", sku: "", images: [`${JAW}/6trous-jaune.webp`] },
    // Octogone (6e génération)
    { value: "Octogone · Noir", vid: "1679744816097267712", sku: "", images: [`${JAW}/octogone-noir.webp`] },
    { value: "Octogone · Gris", vid: "1679744816114044928", sku: "", images: [`${JAW}/octogone-gris.webp`] },
  ],
}

const BALLE: ColorProduct = {
  handle: "balle-anti-destruction-chien",
  title: "Balle anti-destruction pour chien",
  price: 59,
  category: "fun-enfants",
  description:
    "Conçue pour les mâchoires les plus puissantes. Caoutchouc ultra-résistant " +
    "qui résiste aux mordeurs acharnés, couineur intégré, nettoie les dents et " +
    "calme l'anxiété. Le jouet qui survit (enfin) à ton chien. Diamètre 55 mm.",
  cj_pid: "1814540500956237824",
  thumbnail: "/produits/balle-chien/bleu.webp",
  colors: [
    { value: "Bleu", vid: "1814540500981403650", sku: "CJGY208859103CX", images: ["/produits/balle-chien/bleu.webp"] },
    { value: "Vert", vid: "1814540500981403652", sku: "CJGY208859105EV", images: ["/produits/balle-chien/vert.webp"] },
    { value: "Rouge", vid: "1814540500981403648", sku: "CJGY208859101AZ", images: ["/produits/balle-chien/rouge.webp"] },
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

  for (const p of [PORTE_CARTES, EMS, HALO, LIP, JAWLINE, BALLE]) {
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
            options: [
              {
                title: p.optionTitle || "Couleur",
                values: p.colors.map((c) => c.value),
              },
            ],
            variants: p.colors.map((c, i) => ({
              title: c.value,
              sku: `${p.handle.toUpperCase().slice(0, 18)}-${i + 1}`,
              manage_inventory: false,
              options: { [p.optionTitle || "Couleur"]: c.value },
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
