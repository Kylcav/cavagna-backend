import { MedusaContainer } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  ProductStatus,
} from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Crée le produit "Taie d'oreiller en soie de mûrier" pour la page /soie.
 *
 * 12 coloris élégants × 2 formats :
 *   - "1 taie"    -> 59 CHF
 *   - "Lot de 2"  -> 89 CHF  (= panier moyen plus élevé)
 *
 * Chaque variante porte dans ses metadata le SKU CJdropshipping du coloris
 * (`cj_sku`) + la quantité CJ à commander (`cj_qty` : 1 ou 2), pour la synchro
 * automatique des commandes. Produit source CJ : "Silk Pillow Case Pure Silk"
 * (SPU CJJJJFZT00561, vraie soie de mûrier 48×74 cm).
 *
 * Lancer depuis apps/backend :  npx medusa exec ./src/scripts/add-soie.ts
 * Idempotent : ne recrée pas le produit s'il existe déjà (handle unique).
 */

const HANDLE = "taie-soie-mulberry"
const PRICE_UNITE = 59
const PRICE_DUO = 89

// 12 coloris : nom affiché (FR) -> coloris CJ (suffixe du SKU), VID CJ (id de
// variante, utilisé par createOrderV2), code SKU interne + pastille (hex).
const COLORS: {
  fr: string
  cj: string
  vid: string
  code: string
  hex: string
}[] = [
  { fr: "Blanc nacré", cj: "Noble White", vid: "26DABF97-DB06-4913-BFD7-58D4C6B3D838", code: "BLNC", hex: "#EFEAE0" },
  { fr: "Champagne", cj: "Champagne gold", vid: "41DCEC1F-98D1-4C52-8F6B-6A1834056599", code: "CHMP", hex: "#E3D1AE" },
  { fr: "Or rose", cj: "Rose gold", vid: "3C1E75A2-5A8F-4267-88DE-B1EF67E462D5", code: "ORRS", hex: "#E3B7A6" },
  { fr: "Rose poudré", cj: "Cherry blossom powder", vid: "9B4C5177-3756-4819-8A97-BBB82BDD542C", code: "RSPD", hex: "#EBC7CC" },
  { fr: "Rose", cj: "Pink", vid: "D769106F-6384-4B6D-AC6E-84E5C0172558", code: "ROSE", hex: "#E48AA6" },
  { fr: "Gris perle", cj: "Metal grey", vid: "C323E94B-E2E7-4452-B0DA-C4757113692F", code: "GRPL", hex: "#C7C5C1" },
  { fr: "Gris anthracite", cj: "Space grey", vid: "B9DCC132-64AD-4597-B75E-49270703356A", code: "GRAN", hex: "#65656A" },
  { fr: "Bleu nuit", cj: "Noble Blue", vid: "B4B9115C-ABC8-4824-BB02-5D2DF30E0030", code: "BLNT", hex: "#2C3A5B" },
  { fr: "Bleu paon", cj: "Peacock blue", vid: "C84A6096-D785-4545-BFD6-B9E20797A051", code: "BLPA", hex: "#15707A" },
  { fr: "Émeraude", cj: "Emerald", vid: "E58D7472-94EE-4568-AECF-ECCFB993B2F8", code: "EMER", hex: "#1E6A52" },
  { fr: "Terracotta", cj: "Orange", vid: "394F73C7-C9A0-45EC-B08E-5D55788CB68F", code: "TERR", hex: "#C65A2E" },
  { fr: "Rouge rubis", cj: "Red", vid: "FACD0B44-B97E-4E78-AC8C-B0091F4F1952", code: "RUBI", hex: "#8E1F30" },
]

const CJ_SPU = "CJJJJFZT00561"

const FORMATS: { label: string; price: number; qty: number; sfx: string }[] = [
  { label: "1 taie", price: PRICE_UNITE, qty: 1, sfx: "U" },
  { label: "Lot de 2", price: PRICE_DUO, qty: 2, sfx: "D" },
]

export default async function add_soie({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  // Déjà présent ? -> on sort proprement.
  const { data: existing } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "status"],
    filters: { handle: HANDLE },
  })
  if (existing.length) {
    logger.info(
      `Produit déjà existant (${existing[0].id}, statut ${existing[0].status}). Rien à faire.`
    )
    return
  }

  // Sales channel du storefront (le store en expose un seul par défaut).
  const { data: stores } = await query.graph({
    entity: "store",
    fields: ["default_sales_channel_id"],
  })
  const defaultChannelId = stores[0]?.default_sales_channel_id

  const { data: channels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name"],
  })
  const salesChannel =
    channels.find((c: any) => c.id === defaultChannelId) ?? channels[0]
  if (!salesChannel) {
    throw new Error("Aucun sales channel trouvé.")
  }

  // Shipping profile par défaut.
  const { data: profiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  })
  const shippingProfile = profiles[0]
  if (!shippingProfile) {
    throw new Error("Aucun shipping profile trouvé.")
  }

  logger.info(
    `Création du produit "${HANDLE}" sur le sales channel "${salesChannel.name}" (${salesChannel.id})...`
  )

  // Génère les 12 x 2 = 24 variantes.
  const variants = COLORS.flatMap((c) =>
    FORMATS.map((f) => ({
      title: `${c.fr} · ${f.label}`,
      sku: `SOIE-${c.code}-${f.sfx}`,
      manage_inventory: false,
      options: { Couleur: c.fr, Format: f.label },
      prices: [{ amount: f.price, currency_code: "chf" }],
      metadata: {
        cj_vid: c.vid,
        cj_sku: `${CJ_SPU}-${c.cj}`,
        cj_color: c.cj,
        cj_qty: f.qty,
      },
    }))
  )

  await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: "Taie d'oreiller en soie de mûrier",
          handle: HANDLE,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          description:
            "Taie d'oreiller en soie de mûrier 100% (face contact), tissage satin. " +
            "Plus douce pour la peau et les cheveux : moins de frottements, moins de frisottis, " +
            "moins de plis d'oreiller au réveil. Thermorégulante et hypoallergénique. " +
            "Format 48 × 74 cm, fermeture enveloppe. Disponible en 12 coloris.",
          // Images LOCALES (servies par le storefront depuis public/soie).
          thumbnail: "/soie/soie-hero.jpg",
          images: [
            { url: "/soie/soie-hero.jpg" },
            { url: "/soie/soie-texture.jpg" },
            { url: "/soie/soie-detail.jpg" },
            { url: "/soie/soie-champagne.jpg" },
          ],
          options: [
            { title: "Couleur", values: COLORS.map((c) => c.fr) },
            { title: "Format", values: FORMATS.map((f) => f.label) },
          ],
          variants,
          sales_channels: [{ id: salesChannel.id }],
          metadata: {
            cj_spu: CJ_SPU,
          },
        },
      ],
    },
  })

  logger.info(
    `✅ Produit "${HANDLE}" créé (publié, ${variants.length} variantes, ` +
      `${PRICE_UNITE}/${PRICE_DUO} CHF, manage_inventory=false, mapping CJ par coloris).`
  )
}
