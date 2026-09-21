/**
 * What a wallet's Seer positions are worth if it sold them right now.
 *
 * `npm run portfolio` prints one wallet's book market by market; `npm run scoreboard` puts every bot's on one
 * line. Both value it here, so the numbers mean the same thing: a quote for the whole position rather than the
 * spot price (on pools this thin those are different numbers), complete sets marked at 1 collateral because
 * merging returns exactly that, and a conditional market's mark - which comes out in one of its parent's outcome
 * tokens - quoted back through the parent's own pool into the chain's collateral, which is what makes two books
 * comparable at all.
 */
import { formatUnits, parseUnits, type Address, type PublicClient } from "viem";
import type { ChainId } from "./config.js";
import { erc20FullAbi, quoteExactIn, readOutcomePool } from "./dex.js";
import type { SeerMarket } from "./seer-api.js";

export interface BookRow {
  outcome: string;
  tokens: bigint;
  exit: number;
  note: string;
}

export interface MarketBook {
  market: SeerMarket;
  collateral: Address;
  collateralSymbol: string;
  sets: bigint;
  /** the whole position in this market, in the market's own collateral */
  mark: number;
  rows: BookRow[];
}

export interface Book {
  positions: MarketBook[];
  /** the marks added up per collateral token, keyed by its lowercased address */
  perCollateral: Map<string, { token: Address; symbol: string; total: number }>;
}

const symbols = new Map<string, string>();

export async function symbolOf(client: PublicClient, token: Address): Promise<string> {
  const k = token.toLowerCase();
  if (!symbols.has(k)) symbols.set(k, await client.readContract({ address: token, abi: erc20FullAbi, functionName: "symbol" }).catch(() => "?"));
  return symbols.get(k)!;
}

/** Keeps `limit` reads in flight: the node answers one call at a time, but not one round trip at a time. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i], i);
    }),
  );
  return out;
}

export async function valueBook(client: PublicClient, chainId: ChainId, account: Address, markets: SeerMarket[], concurrency = 4): Promise<Book> {
  const books = await mapLimit(markets, concurrency, async (m) => {
    const tokens = m.wrappedTokens ?? [];
    const bals = await mapLimit(tokens, 3, (token) =>
      client.readContract({ address: token, abi: erc20FullAbi, functionName: "balanceOf", args: [account] }).then((b) => b as bigint).catch(() => 0n),
    );
    if (!bals.length || bals.every((b) => b === 0n)) return undefined;
    // complete sets merge into exactly 1 collateral each, so they are marked at that and only the rest is quoted
    const sets = bals.every((b) => b > 0n) ? bals.reduce((a, b) => (b < a ? b : a)) : 0n;
    const rows: BookRow[] = [];
    let mark = Number(formatUnits(sets, 18));
    for (const [i, token] of tokens.entries()) {
      const bal = bals[i];
      if (bal === 0n) continue;
      const rest = bal - sets;
      let exit = 0;
      let note = rest === 0n ? "all in complete sets" : "no pool - only redeemable if this outcome wins";
      if (rest > 0n) {
        const pool = await readOutcomePool(client, chainId, i, m.outcomes[i] ?? "?", token, m.collateralToken);
        if (pool.exists) {
          const got = await quoteExactIn(client, chainId, token, m.collateralToken, rest, pool.fee);
          exit = Number(formatUnits(got, 18));
          note = got > 0n ? "exit @ " + (exit / Number(formatUnits(rest, 18))).toFixed(4) + " (spot " + (pool.price ?? 0).toFixed(4) + ")" : "pool cannot absorb this size";
        }
        if (sets > 0n) note = "beyond the sets: " + note;
      }
      mark += exit;
      rows.push({ outcome: m.outcomes[i] ?? "?", tokens: bal, exit, note });
    }
    const collateralSymbol = await symbolOf(client, m.collateralToken);
    return { market: m, collateral: m.collateralToken, collateralSymbol, sets, mark, rows } satisfies MarketBook;
  });

  const positions = books.filter((b): b is MarketBook => !!b);
  const perCollateral: Book["perCollateral"] = new Map();
  for (const b of positions) {
    const k = b.collateral.toLowerCase();
    const cur = perCollateral.get(k) ?? { token: b.collateral, symbol: b.collateralSymbol, total: 0 };
    cur.total += b.mark;
    perCollateral.set(k, cur);
  }
  return { positions, perCollateral };
}

export interface RootValue {
  /** every collateral's marks, in the chain's own collateral */
  total: number;
  parts: Array<{ symbol: string; amount: number; value: number; note: string }>;
}

/**
 * Turns marks denominated in a parent's outcome tokens into the chain's own collateral.
 *
 * On Gnosis the parent pools hold no liquidity at all - the bots got their parent tokens by minting complete sets,
 * not by buying - so quoting a parent token into sDAI returns nothing, and marking it at zero would value a whole
 * book at nothing. The way out is the way in: a parent token completes a set with the other outcomes the wallet is
 * still holding, and a complete set merges into exactly 1 collateral. So each parent token is credited at 1 up to
 * the number of sets it would complete once the child position is sold, and only the excess beyond that falls back
 * to the pool - a quote if the pool can absorb it, its spot price if the pool exists but is empty, nothing if there
 * is no pool at all, each said plainly in the note.
 *
 * Sets the wallet can already merge today are counted by `valueBook`, and subtracted here so they are not counted
 * twice. Where several children share one parent, the sets they would complete together are worked out together.
 */
export async function inRootCollateral(
  client: PublicClient,
  chainId: ChainId,
  markets: SeerMarket[],
  root: Address,
  book: Book,
  account: Address,
): Promise<RootValue> {
  const byToken = new Map<string, { market: SeerMarket; index: number }>();
  for (const m of markets) (m.wrappedTokens ?? []).forEach((t, index) => byToken.set(t.toLowerCase(), { market: m, index }));

  const parts: RootValue["parts"] = [];
  let total = 0;

  interface Entry { token: Address; symbol: string; amount: number; index: number }
  const groups = new Map<string, { parent: SeerMarket; entries: Entry[] }>();
  for (const { token, symbol, total: amount } of book.perCollateral.values()) {
    if (token.toLowerCase() === root.toLowerCase()) {
      total += amount;
      parts.push({ symbol, amount, value: amount, note: "the chain's own collateral" });
      continue;
    }
    const where = byToken.get(token.toLowerCase());
    if (!where) {
      parts.push({ symbol, amount, value: 0, note: "no market in view mints it, so it is left out" });
      continue;
    }
    const g = groups.get(where.market.id.toLowerCase()) ?? { parent: where.market, entries: [] };
    g.entries.push({ token, symbol, amount, index: where.index });
    groups.set(where.market.id.toLowerCase(), g);
  }

  for (const { parent, entries } of groups.values()) {
    const tokens = parent.wrappedTokens ?? [];
    const balances = await mapLimit(tokens, 3, (token) =>
      client.readContract({ address: token, abi: erc20FullAbi, functionName: "balanceOf", args: [account] }).then((b) => b as bigint).catch(() => 0n),
    );
    const held = new Map(entries.map((e) => [e.index, parseUnits(e.amount.toFixed(18), 18)]));
    const after = balances.map((b, i) => b + (held.get(i) ?? 0n));
    const credited = book.positions.find((p) => p.market.id.toLowerCase() === parent.id.toLowerCase())?.sets ?? 0n;
    let mergeable = after.length ? after.reduce((a, b) => (b < a ? b : a)) - credited : 0n;
    if (mergeable < 0n) mergeable = 0n;

    for (const e of entries.sort((a, b) => b.amount - a.amount)) {
      const amount = parseUnits(e.amount.toFixed(18), 18);
      const merged = amount < mergeable ? amount : mergeable;
      mergeable -= merged;
      const rest = amount - merged;
      let value = Number(formatUnits(merged, 18));
      const notes: string[] = [];
      if (merged > 0n) notes.push("completes " + Number(formatUnits(merged, 18)).toFixed(2) + " set(s) of " + parent.marketName.slice(0, 32) + ", merged 1:1");
      if (rest > 0n) {
        const pool = await readOutcomePool(client, chainId, e.index, parent.outcomes[e.index] ?? "?", e.token, parent.collateralToken);
        if (!pool.exists) {
          notes.push(
            Number(formatUnits(rest, 18)).toFixed(2) +
              " completes no set the wallet can assemble" +
              (merged > 0n || entries.length > 1 ? " (its siblings' marks took the rest)" : "") +
              " and has no pool, so it counts for nothing until " +
              (parent.outcomes[e.index] ?? "that outcome") +
              " wins",
          );
        } else {
          const got = await quoteExactIn(client, chainId, e.token, parent.collateralToken, rest, pool.fee);
          if (got > 0n) {
            value += Number(formatUnits(got, 18));
            notes.push(Number(formatUnits(rest, 18)).toFixed(2) + " beyond that sold into the parent pool");
          } else {
            value += Number(formatUnits(rest, 18)) * (pool.price ?? 0);
            notes.push(Number(formatUnits(rest, 18)).toFixed(2) + " beyond that at the parent's spot " + (pool.price ?? 0).toFixed(4) + ", a pool with no depth to sell into");
          }
        }
      }
      // a parent whose own collateral is another outcome token: quote what we just worked out one hop further up
      let hop = parent.collateralToken;
      for (let depth = 0; depth < 3 && hop.toLowerCase() !== root.toLowerCase() && value > 0; depth++) {
        const up = byToken.get(hop.toLowerCase());
        if (!up) {
          notes.push("its parent's collateral is not in view, so it is left out");
          value = 0;
          break;
        }
        const pool = await readOutcomePool(client, chainId, up.index, up.market.outcomes[up.index] ?? "?", hop, up.market.collateralToken);
        const got = pool.exists ? await quoteExactIn(client, chainId, hop, up.market.collateralToken, parseUnits(value.toFixed(18), 18), pool.fee) : 0n;
        value = got > 0n ? Number(formatUnits(got, 18)) : value * (pool.exists ? pool.price ?? 0 : 0);
        hop = up.market.collateralToken;
      }
      total += value;
      parts.push({ symbol: e.symbol, amount: e.amount, value, note: notes.join("; ") });
    }
  }
  return { total, parts };
}
