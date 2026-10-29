import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
export default async function d({ container }: { container: MedusaContainer }) {
  const q = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: opts } = await q.graph({
    entity: "shipping_option",
    fields: ["id","name","price_type","provider_id","shipping_profile_id",
      "service_zone.name","service_zone.countries.iso_2","prices.amount","prices.currency_code"],
  })
  for (const o of opts as any[]) {
    const pays=(o.service_zone?.countries||[]).map((c:any)=>c.iso_2).join(",")
    const px=(o.prices||[]).map((p:any)=>p.amount+p.currency_code).join("/")
    console.log(`OPTX "${o.name}" prof=${o.shipping_profile_id?.slice(-6)} type=${o.price_type} prov=${o.provider_id} zone=${o.service_zone?.name} pays=[${pays}] prix=[${px}]`)
  }
}
