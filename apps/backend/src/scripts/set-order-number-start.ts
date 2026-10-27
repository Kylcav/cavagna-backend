import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * Fait démarrer la numérotation des commandes à un nombre élevé (ex. 1358)
 * au lieu de #1, #2, #3... pour un rendu "magasin établi".
 *
 * Le numéro affiché (display_id) est le MÊME partout : email client, page de
 * confirmation, ton admin Medusa et CJ. Le client te donne son numéro -> tu
 * retrouves la commande direct dans l'admin (recherche par numéro).
 *
 * N'affecte pas les commandes déjà créées. Idempotent (ne redescend jamais
 * sous le dernier numéro existant).
 *
 * Lancer : npx medusa exec ./src/scripts/set-order-number-start.ts
 */

const START = Number(process.env.ORDER_START || 1358)

export default async function setOrderNumberStart({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const pg: any = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  // 1) Trouver la séquence du display_id des commandes.
  let seq: string | null = null
  try {
    const r = await pg.raw(
      `SELECT pg_get_serial_sequence('"order"', 'display_id') AS seq`
    )
    seq = r?.rows?.[0]?.seq ?? null
  } catch (e) {
    logger.warn("pg_get_serial_sequence a échoué, tentative via information_schema.")
  }
  if (!seq) {
    const r2 = await pg.raw(
      `SELECT (sequence_schema || '.' || quote_ident(sequence_name)) AS seq
       FROM information_schema.sequences
       WHERE sequence_name ILIKE '%order%display%id%'
       LIMIT 1`
    )
    seq = r2?.rows?.[0]?.seq ?? null
  }
  if (!seq) {
    logger.error(
      "❌ Séquence du numéro de commande introuvable. Rien modifié."
    )
    return
  }

  // 2) Dernier numéro existant (pour ne pas créer de collision).
  const m = await pg.raw(`SELECT COALESCE(MAX(display_id), 0) AS max FROM "order"`)
  const currentMax = Number(m?.rows?.[0]?.max || 0)
  const target = Math.max(START, currentMax + 1)

  // 3) Redémarrer la séquence.
  await pg.raw(`ALTER SEQUENCE ${seq} RESTART WITH ${target}`)

  logger.info(
    `✅ Numérotation des commandes réglée : la prochaine commande sera #${target} ` +
      `(séquence ${seq}, dernier numéro existant ${currentMax}).`
  )
}
