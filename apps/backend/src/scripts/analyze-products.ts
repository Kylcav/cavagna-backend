import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { readFileSync } from "fs"

/**
 * Audit complet : pour chaque produit, croise le cj_vid de chaque variante avec
 * la VRAIE couleur CJ (via /product/query), signale les incohérences, et calcule
 * la rentabilité avec le FAST shipping (ligne CJPacket la plus rapide < 15$).
 *
 *  npx medusa exec ./src/scripts/analyze-products.ts
 */
const CJ_BASE = "https://developers.cjdropshipping.com/api2.0/v1"
const USD_CHF = 0.8 // taux USD -> CHF utilisé
const TOK = (() => {
  try {
    return JSON.parse(readFileSync("/tmp/cj-dropshipping-token.json", "utf-8"))
      .accessToken
  } catch {
    return ""
  }
})()

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function cjGet(path: string) {
  const r = await fetch(CJ_BASE + path, { headers: { "CJ-Access-Token": TOK } })
  return r.json()
}
async function cjPost(path: string, body: any) {
  const r = await fetch(CJ_BASE + path, {
    method: "POST",
    headers: { "CJ-Access-Token": TOK, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return r.json()
}

function num(x: any): number {
  const n = parseFloat(String(x).split("-")[0])
  return isNaN(n) ? 0 : n
}

export default async function analyze({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const q = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data } = await q.graph({
    entity: "product",
    fields: [
      "title",
      "handle",
      "metadata",
      "variants.title",
      "variants.metadata",
      "variants.prices.amount",
      "variants.prices.currency_code",
    ],
  })

  // cache détails CJ par pid
  const cjCache: Record<string, any> = {}
  async function cjDetail(pid: string) {
    if (cjCache[pid]) return cjCache[pid]
    for (let i = 0; i < 4; i++) {
      try {
        const d = (await cjGet("/product/query?pid=" + pid)).data || {}
        cjCache[pid] = d
        return d
      } catch (e: any) {
        if (String(e).includes("429")) { await sleep(3000); continue }
        break
      }
    }
    cjCache[pid] = {}
    return {}
  }

  logger.info("================ AUDIT VARIANTES + RENTABILITÉ ================")
  const doubts: string[] = []
  const profit: any[] = []

  for (const p of data as any[]) {
    const pid = (p.metadata || {}).cj_pid
    const priceChf =
      num(
        (p.variants?.[0]?.prices || []).find(
          (pr: any) => pr.currency_code === "chf"
        )?.amount
      ) || 0
    logger.info(`\n### ${p.handle}  —  ${priceChf} CHF  (cj_pid: ${pid || "NON"})`)
    if (!pid) { doubts.push(`${p.handle}: PAS de cj_pid`); continue }

    const detail = await cjDetail(pid)
    const vidMap: Record<string, { color: string; cost: number }> = {}
    for (const v of detail.variants || []) {
      vidMap[v.vid] = {
        color: v.variantKey || v.variantNameEn || "?",
        cost: num(v.variantSellPrice),
      }
    }
    let prodCostUsd = 0
    for (const v of p.variants || []) {
      const vid = (v.metadata || {}).cj_vid
      const cj = vid ? vidMap[vid] : undefined
      const cost = cj?.cost ?? num(detail.sellPrice)
      if (cost > prodCostUsd) prodCostUsd = cost
      const flag = !vid ? "❌ sans vid" : !cj ? "⚠️ vid inconnu sur CJ" : "ok"
      if (flag !== "ok") doubts.push(`${p.handle} / ${v.title}: ${flag} (${vid})`)
      logger.info(
        `   ${flag === "ok" ? "✓" : "⚠"} ${String(v.title).padEnd(16)} vid=${vid} → CJ:"${cj?.color ?? "?"}"  (${cost}$)`
      )
    }

    // FAST shipping : 1ère variante
    const firstVid = (p.variants?.[0]?.metadata || {}).cj_vid
    let ship: any = null
    if (firstVid) {
      for (let i = 0; i < 4; i++) {
        try {
          const r = await cjPost("/logistic/freightCalculate", {
            startCountryCode: "CN",
            endCountryCode: "CH",
            products: [{ quantity: 1, vid: firstVid }],
          })
          const lines = (r.data || []).filter(
            (o: any) => o.logisticPrice && o.logisticPrice < 15
          )
          lines.sort(
            (a: any, b: any) =>
              num(a.logisticAging) - num(b.logisticAging) ||
              a.logisticPrice - b.logisticPrice
          )
          ship = lines[0]
          break
        } catch (e: any) {
          if (String(e).includes("429")) { await sleep(3000); continue }
          break
        }
      }
      await sleep(1500)
    }
    const shipUsd = ship?.logisticPrice || 0
    const costChf = prodCostUsd * USD_CHF
    const shipChf = shipUsd * USD_CHF
    const stripe = priceChf * 0.029 + 0.3
    const margin = priceChf - costChf - shipChf - stripe
    logger.info(
      `   💰 prix ${priceChf} − produit ${costChf.toFixed(2)} − port ${shipChf.toFixed(2)} (${ship?.logisticName || "?"} ${ship?.logisticAging || "?"}j) − stripe ${stripe.toFixed(2)} = MARGE ${margin.toFixed(2)} CHF`
    )
    profit.push({ handle: p.handle, priceChf, costChf, shipChf, margin, ship: ship?.logisticName, aging: ship?.logisticAging })
  }

  logger.info("\n================ SYNTHÈSE RENTABILITÉ ================")
  let tot = 0
  for (const r of profit) {
    tot += r.margin
    logger.info(`${r.handle.padEnd(32)} ${String(r.priceChf).padStart(3)} CHF → marge ${r.margin.toFixed(2)} CHF (${r.aging}j)`)
  }
  logger.info(`Marge moyenne : ${(tot / Math.max(profit.length,1)).toFixed(2)} CHF/vente`)

  logger.info("\n================ DOUTES / À VÉRIFIER ================")
  if (!doubts.length) logger.info("✅ Aucun doute : toutes les variantes pointent vers une couleur CJ valide.")
  else doubts.forEach((d) => logger.info("⚠️ " + d))
}
