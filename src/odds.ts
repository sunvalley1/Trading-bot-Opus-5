/**
 * Looks for the same question on Polymarket (first) and Kalshi (second) and prints their current prices with links.
 *   npm run odds -- "french presidential election second round" [--limit 5] [--kalshi-pages 40]
 * Polymarket: public search API. Kalshi: no text search in the public API, so open events are scanned for the keywords.
 * Read-only; no keys needed.
 */
import { parseArgs } from "./args.js";

const args = parseArgs(process.argv.slice(2));
const query = args._.join(" ").trim();
if (!query) {
  console.error('usage: tsx src/odds.ts "<question keywords>" [--limit 5] [--kalshi-pages 40]');
  process.exit(2);
}
const limit = Number(args.limit ?? 5);
const kalshiPages = Number(args["kalshi-pages"] ?? 40);
const STOP = new Set(["the", "a", "an", "of", "in", "on", "at", "to", "for", "will", "who", "which", "what", "be", "by", "is", "are", "and", "or", "vs", "next", "second", "round", "2nd"]);
const keywords = query.toLowerCase().split(/[^a-z0-9éèàùâêîôûç]+/i).filter((w) => w.length > 2 && !STOP.has(w));
const pct = (p: unknown) => (p === undefined || p === null || p === "" ? "  -  " : `${(Number(p) * 100).toFixed(1).padStart(5)}%`);

// ---------- Polymarket ----------
console.log(`POLYMARKET  search "${query}"`);
try {
  const r = await fetch(`https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(query)}&limit_per_type=${limit}`);
  const d = (await r.json()) as { events?: Array<{ title: string; slug: string; active: boolean; closed: boolean; volume?: string; endDate?: string; markets?: Array<{ question?: string; groupItemTitle?: string; outcomes?: string; outcomePrices?: string; volume?: string; endDate?: string; closed?: boolean }> }> };
  const events = (d.events ?? []).filter((e) => !e.closed);
  if (!events.length) console.log("  no active Polymarket event matches");
  for (const ev of events) {
    console.log(`\n  ${ev.title}`);
    console.log(`  link: https://polymarket.com/event/${ev.slug}   volume ${Math.round(Number(ev.volume ?? 0)).toLocaleString()}   ends ${(ev.endDate ?? "").slice(0, 10)}`);
    const markets = (ev.markets ?? []).filter((m) => !m.closed);
    const rows = markets
      .map((m) => {
        let outcomes: string[] = [];
        let prices: string[] = [];
        try {
          outcomes = JSON.parse(m.outcomes ?? "[]");
          prices = JSON.parse(m.outcomePrices ?? "[]");
        } catch {
          /* ignore */
        }
        const yes = outcomes.findIndex((o) => o === "Yes");
        return { label: m.groupItemTitle || m.question || "?", yes: yes >= 0 ? Number(prices[yes]) : undefined, pairs: outcomes.map((o, i) => `${o} ${pct(prices[i])}`), volume: Number(m.volume ?? 0) };
      })
      .sort((a, b) => (b.yes ?? 0) - (a.yes ?? 0));
    for (const row of rows.slice(0, 15)) {
      console.log(`    ${row.yes !== undefined ? pct(row.yes) : row.pairs.join(" | ")}  ${row.label}${row.yes !== undefined ? "" : ""}  (vol ${Math.round(row.volume).toLocaleString()})`);
    }
    if (rows.length > 15) console.log(`    ... ${rows.length - 15} more markets in this event`);
  }
} catch (e) {
  console.log(`  Polymarket lookup failed: ${(e as Error).message}`);
}

// ---------- Kalshi ----------
console.log(`\nKALSHI  scanning open events for: ${keywords.join(", ")}`);
try {
  let cursor = "";
  let scanned = 0;
  const hits: Array<{ title: string; event_ticker: string; series_ticker: string; markets?: Array<{ title?: string; yes_sub_title?: string; yes_bid?: number; yes_ask?: number; last_price?: number; volume?: number; status?: string; yes_bid_dollars?: string; yes_ask_dollars?: string; last_price_dollars?: string; volume_fp?: string }> }> = [];
  for (let page = 0; page < kalshiPages; page++) {
    const url = `https://api.elections.kalshi.com/trade-api/v2/events?status=open&limit=200&with_nested_markets=true${cursor ? `&cursor=${cursor}` : ""}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = (await r.json()) as { cursor?: string; events?: typeof hits };
    for (const ev of d.events ?? []) {
      scanned++;
      const t = (ev.title ?? "").toLowerCase();
      if (keywords.length && keywords.every((k) => t.includes(k))) hits.push(ev);
    }
    cursor = d.cursor ?? "";
    if (!cursor) break;
  }
  console.log(`  scanned ${scanned} open events, ${hits.length} match${hits.length === 1 ? "" : "es"}`);
  for (const ev of hits.slice(0, limit)) {
    console.log(`\n  ${ev.title}`);
    console.log(`  link: https://kalshi.com/markets/${ev.series_ticker.toLowerCase()}   (event ${ev.event_ticker})`);
    // the events list omits prices; the markets endpoint has bid/ask/last (cents) and volume
    let ms = ev.markets ?? [];
    try {
      const mr = await fetch(`https://api.elections.kalshi.com/trade-api/v2/markets?event_ticker=${encodeURIComponent(ev.event_ticker)}&limit=200`);
      const md = (await mr.json()) as { markets?: typeof ms };
      if (md.markets?.length) ms = md.markets;
    } catch {
      /* keep the nested list */
    }
    ms = ms.filter((m) => m.status === "active" || m.status === "open" || !m.status);
    // Kalshi's API now reports prices in dollars (0..1) with *_dollars fields; older cent fields are the fallback
    const num = (d?: string, c?: number) => (d !== undefined && d !== null && d !== "" ? Number(d) : c !== undefined && c !== null ? c / 100 : undefined);
    const rows = ms
      .map((m) => ({ label: m.yes_sub_title || m.title || "?", bid: num(m.yes_bid_dollars, m.yes_bid), ask: num(m.yes_ask_dollars, m.yes_ask), last: num(m.last_price_dollars, m.last_price), volume: Number(m.volume_fp ?? m.volume ?? 0) }))
      .sort((a, b) => (b.last ?? 0) - (a.last ?? 0));
    for (const row of rows.slice(0, 15)) {
      const mid = row.bid !== undefined && row.ask !== undefined && row.bid > 0 && row.ask > 0 ? (row.bid + row.ask) / 2 : row.last;
      console.log(`    ${pct(mid)}  ${row.label}  (bid ${pct(row.bid).trim()} / ask ${pct(row.ask).trim()}, last ${pct(row.last).trim()}, vol ${row.volume})`);
    }
    if (rows.length > 15) console.log(`    ... ${rows.length - 15} more markets in this event`);
  }
  if (!hits.length) console.log("  no matching Kalshi event (Kalshi lists mostly US topics)");
} catch (e) {
  console.log(`  Kalshi lookup failed: ${(e as Error).message}`);
}
console.log("\nIf a market matches the Seer question, use its prices (Invalid = 0, outcomes summing to 1) and paste the link; otherwise research manually.");
