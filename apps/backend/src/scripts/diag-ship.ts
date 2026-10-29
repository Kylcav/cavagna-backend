import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
export default async function diag({ container }: { container: MedusaContainer }) {
  const q = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: opts } = await q.graph({
    entity: "shipping_option",
    fields: [
      "id","name","shipping_profile_id","price_type",
      "service_zone.name",
      "service_zone.geo_zones.country_code",
      "service_zone.fulfillment_set.location.name",
    ],
  })
  for (const o of opts as any[]) {
    const countries = (o.service_zone?.geo_zones||[]).map((g:any)=>g.country_code).join(",")
    console.log(`OPT "${o.name}" | prof=${o.shipping_profile_id?.slice(-6)} | zone=${o.service_zone?.name} | pays=[${countries}] | priceType=${o.price_type}`)
  }
}
