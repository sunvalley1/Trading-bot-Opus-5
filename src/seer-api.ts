/**
 * app.seer.pm's own read API. Read-only, no key.
 *
 * It is the only place that has the off-chain half of a market: the slug the UI uses, the categories, the
 * indexed odds and liquidity, and the full Reality question text. Everything that decides money still comes
 * from the chain (`trade.ts`), but this is how a human's link becomes an address and how we search.
 */
import { isAddress, type Address } from "viem";
import type { ChainId } from "./config.js";

const API = "https://app.seer.pm/.netlify/functions";

export interface SeerMarket {
  id: Address;
  chainId: number;
  marketName: string;
  outcomes: string[];
  wrappedTokens: Address[];
  collateralToken: Address;
  conditionId: string;
  parentMarket?: { id: Address };
  openingTs: number;
  finalizeTs: number;
  hasAnswers: boolean;
  payoutReported: boolean;
  odds: (number | null)[];
  liquidityUSD: number;
  openInterestUSD: number;
  outcomesSupply: string;
  categories: string[];
  url: string;
  templateId: string;
  encodedQuestions: string[];
  questions: Array<{ id: string; opening_ts: number; finalize_ts: number; best_answer: string; bond: string; min_bond: string; arbitrator: Address; timeout: number; is_pending_arbitration: boolean }>;
  verification?: { status: string };
}

/** Accepts an address, a slug, or a full app.seer.pm URL. */
export function parseMarketRef(ref: string): { chainId?: ChainId; idOrSlug: string } {
  const trimmed = ref.trim().replace(/\/+$/, "");
  const m = trimmed.match(/app\.seer\.pm\/markets\/(\d+)\/([^/?#]+)/i);
  if (m) return { chainId: Number(m[1]) as ChainId, idOrSlug: decodeURIComponent(m[2]) };
  return { idOrSlug: trimmed };
}

export async function fetchSeerMarket(chainId: ChainId, idOrSlug: string): Promise<SeerMarket | undefined> {
  const body = isAddress(idOrSlug, { strict: false }) ? { chainId: Number(chainId), id: idOrSlug } : { chainId: Number(chainId), url: idOrSlug };
  const r = await fetch(API + "/get-market", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (r.status !== 200) return undefined;
  return (await r.json()) as SeerMarket;
}

/**
 * The search endpoint ignores most filters, so this pages through everything once and filters locally.
 * ~2.7k markets, under a second each page. Use it to find every market on a topic before trading any of them:
 * sibling markets on the same event are the best sanity check a single market's price can get.
 */
export async function searchSeerMarkets(pattern: RegExp, opts: { chainId?: ChainId; maxPages?: number } = {}): Promise<SeerMarket[]> {
  const out: SeerMarket[] = [];
  for (let page = 1; page <= (opts.maxPages ?? 40); page++) {
    const r = await fetch(API + "/markets-search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page, limit: 100 }) });
    if (!r.ok) throw new Error("markets-search failed: HTTP " + r.status);
    const d = (await r.json()) as { markets: SeerMarket[]; count: number };
    if (!d.markets?.length) break;
    for (const m of d.markets) {
      if (opts.chainId && Number(m.chainId) !== Number(opts.chainId)) continue;
      if (pattern.test(m.marketName)) out.push(m);
    }
    if (page * 100 >= d.count) break;
  }
  return out;
}

export function marketUrl(m: SeerMarket): string {
  return "https://app.seer.pm/markets/" + m.chainId + "/" + m.url;
}
