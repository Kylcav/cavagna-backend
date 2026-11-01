import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/** Vérifie que chaque produit a cj_pid et que TOUTES ses variantes ont cj_vid. */
export default async function checkCj({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const q = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await q.graph({
    entity: "product",
    fields: ["title", "handle", "metadata", "variants.title", "variants.metadata"],
  })
  let allOk = true
  for (const p of data as any[]) {
    const pid = (p.metadata || {}).cj_pid
    const vs = p.variants || []
    const mapped = vs.filter((v: any) => (v.metadata || {}).cj_vid)
    const ok = !!pid && mapped.length === vs.length && vs.length > 0
    if (!ok) allOk = false
    logger.info(`${ok ? "OK " : "KO "}| ${p.handle} | cj_pid:${pid ? "oui" : "NON"} | variantes:${mapped.length}/${vs.length}`)
    for (const v of vs) {
      if (!(v.metadata || {}).cj_vid) logger.info(`     -> sans cj_vid: ${v.title}`)
    }
  }
  logger.info(allOk ? "🎉 TOUT est connecté CJ." : "⚠️ Des variantes ne sont PAS connectées.")
}
