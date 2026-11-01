import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import { readFileSync } from "fs"
const PATH = process.env.DESCS || "/tmp/descriptions.json"
export default async function ({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const q = container.resolve(ContainerRegistrationKeys.QUERY)
  const map: Record<string, string> = JSON.parse(readFileSync(PATH, "utf-8"))
  for (const [handle, description] of Object.entries(map)) {
    const { data } = await q.graph({ entity: "product", fields: ["id"], filters: { handle } })
    if (!data.length) { logger.warn("introuvable: " + handle); continue }
    await updateProductsWorkflow(container).run({ input: { selector: { id: (data[0] as any).id }, update: { description } as any } })
    logger.info("✅ " + handle)
  }
  logger.info("🎉 Descriptions mises à jour.")
}
