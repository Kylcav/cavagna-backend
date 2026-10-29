import { MedusaContainer } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  createProductCategoriesWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * Ajoute 8 produits gagnants "idées cadeaux" à la boutique Cavagna, chacun
 * CONNECTÉ à CJdropshipping (metadata cj_pid sur le produit + cj_vid/cj_sku/
 * cj_qty sur la variante -> le subscriber order.placed crée la commande CJ).
 *
 * Crée au besoin 2 nouvelles catégories (Mode & Beauté, Fun & Enfants).
 * Idempotent : ne recrée pas un produit dont le handle existe déjà.
 *
 * Lancer :  npx medusa exec ./src/scripts/add-gift-products.ts
 */

const NEW_CATEGORIES = [
  { name: "Mode & Beauté", handle: "mode-beaute" },
  { name: "Fun & Enfants", handle: "fun-enfants" },
]

type GiftProduct = {
  handle: string
  title: string
  price: number
  category: string
  description: string
  slug: string // dossier images public/produits/<slug>/
  cj_pid: string
  cj_vid: string
  cj_sku: string
  variantTitle: string
}

const PRODUCTS: GiftProduct[] = [
  {
    handle: "ceinture-ems-abdominale",
    title: "Ceinture EMS abdominale",
    price: 69,
    category: "tech-maison",
    description:
      "Tonifie tes abdos sans effort. La ceinture EMS envoie des micro-impulsions " +
      "qui font travailler les muscles pendant que tu vaques à tes occupations. " +
      "Rechargeable, intensité réglable, à porter 20 min par jour. Le cadeau fitness malin.",
    slug: "ceinture-ems",
    cj_pid: "1562401247699939328",
    cj_vid: "1562401247788019712",
    cj_sku: "CJJT154897101AZ",
    variantTitle: "Ceinture EMS",
  },
  {
    handle: "poele-pierre-antiadhesive",
    title: "Poêle anti-adhésive pierre 24 cm",
    price: 59,
    category: "maison-cuisine",
    description:
      "Cuisine sans accroche et avec peu de matière grasse grâce au revêtement " +
      "pierre anti-adhésif. Répartition homogène de la chaleur, compatible tous feux, " +
      "poignée ergonomique. Un classique de cuisine qui fait toujours plaisir à offrir.",
    slug: "poele-pierre",
    cj_pid: "1439060463794130944",
    cj_vid: "1439060463857045504",
    cj_sku: "CJCJ129117902BY",
    variantTitle: "24 cm",
  },
  {
    handle: "porte-cartes-popup-alu",
    title: "Porte-cartes pop-up aluminium",
    price: 59,
    category: "mode-beaute",
    description:
      "Un geste, tes cartes se déploient en éventail. Boîtier aluminium anti-RFID " +
      "qui protège tes cartes du piratage sans contact, format ultra-fin pour la poche. " +
      "Élégant, pratique, le cadeau parfait pour lui comme pour elle.",
    slug: "porte-cartes-popup",
    cj_pid: "2604010340051610800",
    cj_vid: "2604010340051611100",
    cj_sku: "CJQB281440401AZ",
    variantTitle: "Porte-cartes pop-up",
  },
  {
    handle: "extension-cheveux-halo",
    title: "Extension de cheveux Halo",
    price: 60,
    category: "mode-beaute",
    description:
      "Des cheveux longs et volumineux en 30 secondes, sans clips ni colle. " +
      "L'extension Halo se pose sur un fil invisible qui épouse la tête : confortable, " +
      "réutilisable, indétectable. Idéale pour une occasion ou au quotidien.",
    slug: "extension-halo",
    cj_pid: "2608280831061610400",
    cj_vid: "2608280831061611400",
    cj_sku: "CJYD310532501AZ",
    variantTitle: "Noir naturel",
  },
  {
    handle: "lip-plumper-gloss",
    title: "Lip Plumper — gloss repulpant",
    price: 25,
    category: "mode-beaute",
    description:
      "Des lèvres visiblement plus pulpeuses dès la première application. Ce gloss " +
      "repulpant hydrate et donne du volume avec un fini brillant non collant. " +
      "Effet avant/après bluffant, à glisser dans toutes les trousses.",
    slug: "lip-plumper",
    cj_pid: "2408120516091605700",
    cj_vid: "2408120516091606200",
    cj_sku: "CJKH210822001AZ",
    variantTitle: "Teinte 01",
  },
  {
    handle: "feutres-coloriage-double-pointe",
    title: "Feutres de coloriage double-pointe (36 couleurs)",
    price: 29,
    category: "fun-enfants",
    description:
      "36 couleurs, deux pointes (fine + large) pour dessiner, colorier et écrire. " +
      "Encre vive à base d'eau, lavable, sans odeur. Le set créatif qui occupe " +
      "les enfants des heures — un cadeau sûr pour les petits artistes.",
    slug: "feutres-coloriage",
    cj_pid: "1414777796709978112",
    cj_vid: "1414777798152818688",
    cj_sku: "CJJT121177203CX",
    variantTitle: "36 couleurs",
  },
  {
    handle: "jawline-trainer-masseter",
    title: "Jawline Trainer — exerciseur mâchoire",
    price: 29,
    category: "fun-enfants",
    description:
      "Redessine ta ligne de mâchoire en quelques minutes par jour. Cet exerciseur " +
      "en silicone alimentaire fait travailler les muscles masséters, comme une salle " +
      "de sport pour le visage. Plusieurs niveaux de résistance. Discret et réutilisable.",
    slug: "jawline-trainer",
    cj_pid: "1679744815862386688",
    cj_vid: "1679744815883358208",
    cj_sku: "CJYD180008801AZ",
    variantTitle: "Niveau 1 · Noir",
  },
  {
    handle: "balle-anti-destruction-chien",
    title: "Balle anti-destruction pour chien",
    price: 59,
    category: "fun-enfants",
    description:
      "Conçue pour les mâchoires les plus puissantes. Caoutchouc ultra-résistant " +
      "qui résiste aux mordeurs acharnés, couineur intégré, nettoie les dents et " +
      "calme l'anxiété. Le jouet qui survit (enfin) à ton chien.",
    slug: "balle-chien",
    cj_pid: "1814540500956237824",
    cj_vid: "1814540500981403648",
    cj_sku: "CJGY208859101AZ",
    variantTitle: "55 mm",
  },
]

export default async function add_gift_products({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  /* --------------------- 1. Créer les catégories manquantes --------------- */
  const { data: existingCats } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle"],
  })
  const existingHandles = new Set(existingCats.map((c: any) => c.handle))
  const toCreate = NEW_CATEGORIES.filter((c) => !existingHandles.has(c.handle))
  if (toCreate.length) {
    await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: toCreate.map((c) => ({
          name: c.name,
          handle: c.handle,
          is_active: true,
        })),
      },
    })
    logger.info(`✅ ${toCreate.length} catégories créées : ${toCreate.map((c) => c.name).join(", ")}`)
  }

  const { data: catsNow } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle"],
  })
  const catIdByHandle: Record<string, string> = {}
  catsNow.forEach((c: any) => (catIdByHandle[c.handle] = c.id))

  /* --------------------- 2. Sales channel + shipping profile -------------- */
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

  /* --------------------- 3. Créer chaque produit -------------------------- */
  let created = 0
  for (const p of PRODUCTS) {
    const { data: exists } = await query.graph({
      entity: "product",
      fields: ["id"],
      filters: { handle: p.handle },
    })
    if (exists.length) {
      logger.info(`↷ ${p.handle} existe déjà, ignoré.`)
      continue
    }

    const catId = catIdByHandle[p.category]
    const img = (n: number) => `/produits/${p.slug}/${n}.jpg`

    await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: p.title,
            handle: p.handle,
            status: ProductStatus.PUBLISHED,
            shipping_profile_id: shippingProfile.id,
            category_ids: catId ? [catId] : [],
            description: p.description,
            thumbnail: img(1),
            images: [{ url: img(1) }, { url: img(2) }, { url: img(3) }],
            options: [{ title: "Format", values: [p.variantTitle] }],
            variants: [
              {
                title: p.variantTitle,
                sku: p.handle.toUpperCase().slice(0, 20) + "-1",
                manage_inventory: false,
                options: { Format: p.variantTitle },
                prices: [
                  { amount: p.price, currency_code: "chf" },
                  { amount: p.price, currency_code: "eur" },
                ],
                metadata: { cj_vid: p.cj_vid, cj_sku: p.cj_sku, cj_qty: 1 },
              },
            ],
            sales_channels: [{ id: salesChannel.id }],
            metadata: { cj_pid: p.cj_pid },
          },
        ],
      },
    })
    created++
    logger.info(`✅ ${p.title} (${p.price} CHF/EUR, CJ pid=${p.cj_pid}).`)
  }

  logger.info(`🎁 Terminé : ${created} nouveaux produits connectés CJ ajoutés.`)
}
