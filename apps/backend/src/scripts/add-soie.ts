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

// 12 coloris : nom affiché (FR) -> coloris CJ (suffixe du SKU) + pastille (hex).
const COLORS: { fr: string; cj: string; code: string; hex: string }[] = [
  { fr: "Blanc nacré", cj: "Noble White", code: "BLNC", hex: "#EFEAE0" },
  { fr: "Champagne", cj: "Champagne gold", code: "CHMP", hex: "#E3D1AE" },
  { fr: "Or rose", cj: "Rose gold", code: "ORRS", hex: "#E3B7A6" },
  { fr: "Rose poudré", cj: "Cherry blossom powder", code: "RSPD", hex: "#EBC7CC" },
  { fr: "Rose", cj: "Pink", code: "ROSE", hex: "#E48AA6" },
  { fr: "Gris perle", cj: "Metal grey", code: "GRPL", hex: "#C7C5C1" },
  { fr: "Gris anthracite", cj: "Space grey", code: "GRAN", hex: "#65656A" },
  { fr: "Bleu nuit", cj: "Noble Blue", code: "BLNT", hex: "#2C3A5B" },
  { fr: "Bleu paon", cj: "Peacock blue", code: "BLPA", hex: "#15707A" },
  { fr: "Émeraude", cj: "Emerald", code: "EMER", hex: "#1E6A52" },
  { fr: "Terracotta", cj: "Orange", code: "TERR", hex: "#C65A2E" },
  { fr: "Rouge rubis", cj: "Red", code: "RUBI", hex: "#8E1F30" },
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
          images: [
            {
              url: "https://cf.cjdropshipping.com/20200812/2295286953929.jpg",
            },
            {
              url: "https://cf.cjdropshipping.com/20200812/1742659521809.jpg",
            },
            {
              url: "https://cf.cjdropshipping.com/20200812/2304461737237.jpg",
            },
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
