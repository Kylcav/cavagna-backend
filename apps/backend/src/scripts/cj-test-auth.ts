import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getCjAccessToken } from "../lib/cj-dropshipping"

/**
 * Vérifie que la clé API CJdropshipping fonctionne.
 *   CJ_API_KEY="CJUserNum@api@xxxx" npx medusa exec ./src/scripts/cj-test-auth.ts
 * (ou CJ_API_KEY déjà dans .env)
 */
export default async function cjTestAuth({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  if (!process.env.CJ_API_KEY) {
    logger.error("❌ CJ_API_KEY manquant (dans .env ou en variable d'env).")
    return
  }

  try {
    const token = await getCjAccessToken()
    logger.info(
      `✅ Connexion CJ OK — access token obtenu (${token.slice(0, 12)}…).`
    )
    logger.info(
      "La synchro des commandes est active : chaque commande contenant un article mappé CJ sera créée chez CJ automatiquement."
    )
  } catch (err: any) {
    logger.error(`❌ Connexion CJ échouée : ${err?.message || err}`)
  }
}
