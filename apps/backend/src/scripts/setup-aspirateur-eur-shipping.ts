import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  updateProductsWorkflow,
  updateRegionsWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * Pour l'aspirateur :
 *  1. prix 199 CHF + 199 EUR sur les 2 variantes ;
 *  2. zone euro ajoutée à la région EUR + à la service zone "Europe" (routage + livraison hors Suisse) ;
 *  3. profil d'expédition DÉDIÉ (n'impacte pas les maillots) + 2 options "Livraison gratuite" (0) : Europe + Suisse.
 *
 * Idempotent. Lancer depuis apps/backend : npx medusa exec ./src/scripts/setup-aspirateur-eur-shipping.ts
 */

const HANDLE = "aspirateur-robot-18000-pa"
const PRICE = 199
const PROFILE_NAME = "Aspirateur - Livraison gratuite"
// Pays de la zone euro (ceux qui utilisent l'euro)
const EUROZONE = [
  "at", "be", "hr", "cy", "ee", "fi", "fr", "de", "gr", "ie",
  "it", "lv", "lt", "lu", "mt", "nl", "pt", "sk", "si", "es",
]

export default async function setup({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const fulfillment = container.resolve(Modules.FULFILLMENT)

  const { data: prods } = await query.graph({
    entity: "product",
    fields: ["id", "shipping_profile.id", "variants.id", "variants.title"],
    filters: { handle: HANDLE },
  })
  if (!prods.length) throw new Error("Produit aspirateur introuvable.")
  const product = prods[0]
  const productId = product.id
  const oldProfileId = product.shipping_profile?.id

  // 1) Prix CHF + EUR
  await updateProductsWorkflow(container).run({
    input: {
      products: [
        {
          id: productId,
          variants: product.variants.map((v: any) => ({
            id: v.id,
            prices: [
              { amount: PRICE, currency_code: "chf" },
              { amount: PRICE, currency_code: "eur" },
            ],
          })),
        },
      ],
    },
  })
  logger.info("✅ Prix 199 CHF + 199 EUR appliqués aux 2 variantes.")

  // 2a) Région EUR : union pays existants + zone euro
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name", "currency_code", "countries.iso_2"],
  })
  const eurRegion = regions.find((r: any) => r.currency_code === "eur")
  if (!eurRegion) throw new Error("Région EUR introuvable.")
  const regCountries = Array.from(
    new Set([...(eurRegion.countries || []).map((c: any) => c.iso_2), ...EUROZONE])
  )
  await updateRegionsWorkflow(container).run({
    input: { selector: { id: eurRegion.id }, update: { countries: regCountries } },
  })
  logger.info("✅ Région EUR couvre : " + regCountries.join(", "))

  // 2b) Service zone "Europe" : union geo_zones + zone euro
  const { data: fsets } = await query.graph({
    entity: "fulfillment_set",
    fields: [
      "id",
      "service_zones.id",
      "service_zones.name",
      "service_zones.geo_zones.country_code",
    ],
  })
  const zones = fsets[0].service_zones
  const euZone = zones.find((z: any) => z.name === "Europe")
  const chZone = zones.find((z: any) => z.name === "Suisse")
  if (!euZone || !chZone) throw new Error("Service zones Europe/Suisse introuvables.")
  const euGeo = Array.from(
    new Set([...(euZone.geo_zones || []).map((g: any) => g.country_code), ...EUROZONE])
  )
  await fulfillment.updateServiceZones(euZone.id, {
    geo_zones: euGeo.map((cc: string) => ({ country_code: cc, type: "country" })),
  })
  logfmt(logger, "✅ Service zone Europe couvre : " + euGeo.join(", "))

  // 3) Profil dédié (idempotent)
  const { data: profiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id", "name"],
  })
  let profile: any = profiles.find((p: any) => p.name === PROFILE_NAME)
  if (!profile) {
    const { result } = await createShippingProfilesWorkflow(container).run({
      input: { data: [{ name: PROFILE_NAME, type: "custom" }] },
    })
    profile = Array.isArray(result) ? result[0] : result
    logger.info("✅ Profil d'expédition dédié créé : " + profile.id)
  } else {
    logger.info("Profil dédié déjà existant : " + profile.id)
  }

  // Rattacher le produit au profil dédié
  if (oldProfileId && oldProfileId !== profile.id) {
    await link.dismiss({
      [Modules.PRODUCT]: { product_id: productId },
      [Modules.FULFILLMENT]: { shipping_profile_id: oldProfileId },
    })
  }
  await link.create({
    [Modules.PRODUCT]: { product_id: productId },
    [Modules.FULFILLMENT]: { shipping_profile_id: profile.id },
  })
  logger.info("✅ Aspirateur rattaché au profil dédié.")

  // 4) Options "Livraison gratuite" (idempotent)
  const { data: opts } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "shipping_profile_id"],
  })
  if (opts.some((o: any) => o.shipping_profile_id === profile.id)) {
    logger.info("Options déjà présentes sur le profil dédié, rien à créer.")
  } else {
    const rules: any[] = [
      { attribute: "enabled_in_store", value: "true", operator: "eq" },
      { attribute: "is_return", value: "false", operator: "eq" },
    ]
    await createShippingOptionsWorkflow(container).run({
      input: [
        {
          name: "Livraison gratuite",
          price_type: "flat",
          provider_id: "manual_manual",
          service_zone_id: euZone.id,
          shipping_profile_id: profile.id,
          type: { label: "Livraison gratuite", description: "Livraison offerte", code: "free-eu" },
          prices: [
            { currency_code: "eur", amount: 0 },
            { currency_code: "chf", amount: 0 },
            { currency_code: "usd", amount: 0 },
          ],
          rules,
        },
        {
          name: "Livraison gratuite",
          price_type: "flat",
          provider_id: "manual_manual",
          service_zone_id: chZone.id,
          shipping_profile_id: profile.id,
          type: { label: "Livraison gratuite", description: "Livraison offerte", code: "free-ch" },
          prices: [
            { currency_code: "chf", amount: 0 },
            { currency_code: "eur", amount: 0 },
          ],
          rules,
        },
      ],
    })
    logger.info("✅ Options 'Livraison gratuite' créées (Europe + Suisse).")
  }

  logger.info("🎉 Terminé : EUR 199 + zone euro + livraison gratuite.")
}

function logfmt(logger: any, msg: string) {
  logger.info(msg)
}
