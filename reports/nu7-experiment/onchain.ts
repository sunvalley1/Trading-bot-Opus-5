/**
 * Collects the onchain facts the NU7 report settles and scores against. Read-only; sends nothing.
 *
 *   npx tsx reports/nu7-experiment/onchain.ts
 *
 * - every outcome pool's seed price, swaps (with sender and block time), and liquidity adds/removals
 * - each bot wallet's outcome-token and sUSDS balances now
 * - the oracle state per market (Seer API index of the Reality.eth question)
 * - the gas each bot paid for the transactions its experiment trades sent, from the receipts
 * - ETH/USD (Chainlink on Optimism) and the sUSDS->USDS rate (sUSDS vault on Ethereum) for USD figures
 *
 * Writes onchain.json next to this file.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, type Address, type Hash } from "viem";
import { mainnet, optimism } from "viem/chains";
import { getPublicClient } from "../../src/clients.js";
import { erc20FullAbi } from "../../src/dex.js";
import { fetchSeerMarket } from "../../src/seer-api.js";
import { snapshot } from "../../src/trade.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BOTS_ROOT = "C:\\Users\\12\\Desktop\\bots";
const EXPERIMENT_START = "2026-09-13T16:30:00Z"; // first scheduled pass 16:35Z; earlier queue items were test passes

const MARKETS: Record<string, Address> = {
  zip218: "0xc38fa340cfdc9c758826dd4a8dc15b58728d0418",
  smoothing: "0x29bcd2cee8d413a2235f7970fcdde432dcaf10fc",
  features: "0xc03bf1725b72ab5765b639c582853ede9afb26a6",
  v4: "0xd21eadcf5c30475244aea8a9cf7cb6759f0bdae6",
  reissuance: "0xbfdf8ef15ab1ec4bd44bec7ee904270e6ad7ec9c",
};
const WALLETS: Record<string, Address> = {
  "fable-5.1": "0xf1b285F65A3174c9D6E062F089c5CD1Ea8cF30D9",
  "opus-5": "0x6e8211F9059648ee6b88fDCB3dB0415d9015cc9e",
  "astra-gpt-6": "0x017859431458cEdac674344f6031d41c9A68a858",
  "gpt-5.6-sol": "0x6156D8DEe1Cf1b8BC22261D5D98E5bBEC1eEA6fe",
};

const client = getPublicClient(10);
// Alchemy (RPC_URL) caps eth_getLogs at 10 blocks; Optimism's own endpoint serves 10k-block ranges
const logsClient = createPublicClient({ chain: optimism, transport: http("https://mainnet.optimism.io", { retryCount: 6, retryDelay: 1500 }) });

const poolEvents = [
  { type: "event", name: "Initialize", inputs: [{ name: "sqrtPriceX96", type: "uint160", indexed: false }, { name: "tick", type: "int24", indexed: false }] },
  {
    type: "event",
    name: "Swap",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount0", type: "int256", indexed: false },
      { name: "amount1", type: "int256", indexed: false },
      { name: "sqrtPriceX96", type: "uint160", indexed: false },
      { name: "liquidity", type: "uint128", indexed: false },
      { name: "tick", type: "int24", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Mint",
    inputs: [
      { name: "sender", type: "address", indexed: false },
      { name: "owner", type: "address", indexed: true },
      { name: "tickLower", type: "int24", indexed: true },
      { name: "tickUpper", type: "int24", indexed: true },
      { name: "amount", type: "uint128", indexed: false },
      { name: "amount0", type: "uint256", indexed: false },
      { name: "amount1", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Burn",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "tickLower", type: "int24", indexed: true },
      { name: "tickUpper", type: "int24", indexed: true },
      { name: "amount", type: "uint128", indexed: false },
      { name: "amount0", type: "uint256", indexed: false },
      { name: "amount1", type: "uint256", indexed: false },
    ],
  },
] as const;

const aggregatorAbi = [
  { type: "function", name: "description", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "decimals", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
  {
    type: "function",
    name: "latestRoundData",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
  },
] as const;
const vaultAbi = [
  { type: "function", name: "convertToAssets", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "symbol", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
] as const;

const sqrtToPrice = (s: bigint) => {
  const x = Number(s) / 2 ** 96;
  return x * x;
};
const iso = (ts: number) => new Date(ts * 1000).toISOString().replace(".000Z", "Z");

async function retry<T>(fn: () => Promise<T>, label: string, attempts = 6): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 800 * 2 ** i));
    }
  }
  throw new Error(label + " failed: " + String((last as Error)?.message ?? last).split("\n")[0]);
}

async function inBatches<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

// ------------------------------------------------------------------ markets, pools, oracle
type PoolInfo = { market: string; index: number; outcome: string; token: Address; pool: Address; outcomeIsToken0: boolean; fee: number; liquidityNow: string; priceNow?: number };
const markets: Record<string, unknown> = {};
const pools: PoolInfo[] = [];
let minCreation = 0n;
for (const [key, addr] of Object.entries(MARKETS)) {
  const api = await retry(() => fetchSeerMarket(10, addr), "fetchSeerMarket " + key);
  if (!api) throw new Error("no Seer API record for " + key);
  const snap = await retry(() => snapshot(client, 10, addr), "snapshot " + key);
  let creationBlock = 156661800n;
  if (api.transactionHash) {
    const rc = await retry(() => client.getTransactionReceipt({ hash: api.transactionHash as Hash }), "creation receipt " + key);
    creationBlock = rc.blockNumber;
  }
  if (minCreation === 0n || creationBlock < minCreation) minCreation = creationBlock;
  for (const p of snap.pools) {
    if (!p.exists) continue;
    pools.push({ market: key, index: p.index, outcome: p.outcome, token: p.token, pool: p.pool, outcomeIsToken0: p.outcomeIsToken0, fee: p.fee, liquidityNow: p.liquidity.toString(), priceNow: p.price });
  }
  const q = api.questions?.[0];
  markets[key] = {
    address: addr,
    name: snap.name,
    outcomes: snap.outcomes,
    tokens: snap.pools.map((p) => p.token),
    invalidIndex: snap.invalidIndex,
    collateral: snap.collateral,
    creationBlock: creationBlock.toString(),
    payoutReported: snap.payoutReported,
    oracle: q
      ? { questionId: q.id, hasAnswers: api.hasAnswers, bestAnswer: q.best_answer, bond: q.bond, minBond: q.min_bond, openingTs: q.opening_ts, finalizeTs: q.finalize_ts, timeout: q.timeout, pendingArbitration: q.is_pending_arbitration }
      : null,
  };
  console.log("market " + key + ": " + snap.outcomes.length + " outcomes, " + snap.pools.filter((p) => p.exists).length + " pools, created block " + creationBlock + ", oracle answered " + (api.hasAnswers ? "yes" : "no") + ", payout reported " + snap.payoutReported);
}

// ------------------------------------------------------------------ pool event history
const byPool = new Map(pools.map((p) => [p.pool.toLowerCase(), p]));
const latest = await retry(() => logsClient.getBlockNumber(), "getBlockNumber");
type Ev = { market: string; index: number; kind: string; block: string; logIndex: number; tx: Hash; price?: number; collateralDelta?: string; outcomeDelta?: string; recipient?: string; owner?: string; liquidity?: string; ts?: number; from?: string };
const events: Ev[] = [];
for (let from = minCreation; from <= latest; from += 10_000n) {
  const to = from + 9_999n > latest ? latest : from + 9_999n;
  const logs = await retry(() => logsClient.getLogs({ address: pools.map((p) => p.pool), events: poolEvents, fromBlock: from, toBlock: to }), "getLogs " + from + "-" + to);
  for (const l of logs) {
    const p = byPool.get(l.address.toLowerCase());
    if (!p || l.blockNumber === null || l.transactionHash === null) continue;
    const a = l.args as Record<string, bigint | string>;
    const base = { market: p.market, index: p.index, kind: l.eventName, block: l.blockNumber.toString(), logIndex: l.logIndex ?? 0, tx: l.transactionHash };
    if (l.eventName === "Initialize") {
      const p0 = sqrtToPrice(a.sqrtPriceX96 as bigint);
      events.push({ ...base, price: p.outcomeIsToken0 ? p0 : 1 / p0 });
    } else if (l.eventName === "Swap") {
      const p0 = sqrtToPrice(a.sqrtPriceX96 as bigint);
      const a0 = a.amount0 as bigint;
      const a1 = a.amount1 as bigint;
      events.push({ ...base, price: p.outcomeIsToken0 ? p0 : 1 / p0, collateralDelta: (p.outcomeIsToken0 ? a1 : a0).toString(), outcomeDelta: (p.outcomeIsToken0 ? a0 : a1).toString(), recipient: String(a.recipient).toLowerCase() });
    } else {
      events.push({ ...base, owner: String(a.owner).toLowerCase(), liquidity: (a.amount as bigint).toString(), collateralDelta: ((p.outcomeIsToken0 ? a.amount1 : a.amount0) as bigint).toString(), outcomeDelta: ((p.outcomeIsToken0 ? a.amount0 : a.amount1) as bigint).toString() });
    }
  }
}
events.sort((x, y) => (BigInt(x.block) === BigInt(y.block) ? x.logIndex - y.logIndex : BigInt(x.block) < BigInt(y.block) ? -1 : 1));
console.log("pool events: " + events.length + " (" + events.filter((e) => e.kind === "Swap").length + " swaps) across " + pools.length + " pools, blocks " + minCreation + "-" + latest);

const blockTs = new Map<string, number>();
await inBatches([...new Set(events.map((e) => e.block))], 6, async (b) => {
  const blk = await retry(() => client.getBlock({ blockNumber: BigInt(b) }), "getBlock " + b);
  blockTs.set(b, Number(blk.timestamp));
});
const txFrom = new Map<string, string>();
await inBatches([...new Set(events.map((e) => e.tx))], 6, async (h) => {
  const tx = await retry(() => client.getTransaction({ hash: h }), "getTransaction " + h);
  txFrom.set(h, tx.from.toLowerCase());
});
for (const e of events) {
  e.ts = blockTs.get(e.block);
  e.from = txFrom.get(e.tx);
}

// ------------------------------------------------------------------ balances now
const collateral = (markets.zip218 as { collateral: Address }).collateral;
const balances: Record<string, Record<string, string[]>> = {};
const cash: Record<string, string> = {};
for (const [bot, wallet] of Object.entries(WALLETS)) {
  balances[bot] = {};
  for (const key of Object.keys(MARKETS)) {
    const tokens = (markets[key] as { tokens: Address[] }).tokens;
    balances[bot][key] = (await inBatches(tokens, 4, (t) => retry(() => client.readContract({ address: t, abi: erc20FullAbi, functionName: "balanceOf", args: [wallet] }), "balanceOf"))).map((b) => b.toString());
  }
  cash[bot] = (await retry(() => client.readContract({ address: collateral, abi: erc20FullAbi, functionName: "balanceOf", args: [wallet] }), "sUSDS balanceOf")).toString();
}

// ------------------------------------------------------------------ gas of the experiment's own transactions
type Fee = { bot: string; queueId: string; tx: Hash; status: string; block: string; from: string; gasUsed: string; effectiveGasPrice: string; l1Fee: string; feeWei: string; ts?: number };
const fees: Fee[] = [];
for (const [bot, wallet] of Object.entries(WALLETS)) {
  const lines = fs.readFileSync(path.join(BOTS_ROOT, bot, ".queue", "executed.jsonl"), "utf8").split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const r = JSON.parse(line) as { id: string; createdAt: string; kind?: string; status: string; log?: string };
    if (r.kind === "unwind" || r.createdAt < EXPERIMENT_START || !r.log || !fs.existsSync(r.log)) continue;
    const text = fs.readFileSync(r.log, "utf8");
    const hashes = new Set<string>();
    for (const m of text.matchAll(/^\s*(?:submitted|tx)\s.*?(0x[0-9a-f]{64})/gim)) hashes.add(m[1].toLowerCase());
    for (const h of hashes) {
      const rc = await retry(() => client.getTransactionReceipt({ hash: h as Hash }), "receipt " + h);
      if (rc.from.toLowerCase() !== wallet.toLowerCase()) throw new Error(h + " was not sent by " + bot);
      const l1Fee = ((rc as unknown as { l1Fee?: bigint }).l1Fee ?? 0n) as bigint;
      const feeWei = rc.gasUsed * rc.effectiveGasPrice + l1Fee;
      fees.push({ bot, queueId: r.id, tx: h as Hash, status: rc.status, block: rc.blockNumber.toString(), from: rc.from, gasUsed: rc.gasUsed.toString(), effectiveGasPrice: rc.effectiveGasPrice.toString(), l1Fee: l1Fee.toString(), feeWei: feeWei.toString() });
    }
  }
}
await inBatches(fees, 6, async (f) => {
  if (!blockTs.has(f.block)) {
    const blk = await retry(() => client.getBlock({ blockNumber: BigInt(f.block) }), "getBlock " + f.block);
    blockTs.set(f.block, Number(blk.timestamp));
  }
  f.ts = blockTs.get(f.block);
});

// ------------------------------------------------------------------ prices for USD figures
const feed: Address = "0x13e3Ee699D1909E989722E753853AE30b17e08c5";
let ethUsd: { price: number; updatedAt: string; description: string } | null = null;
try {
  const [desc, dec, round] = await Promise.all([
    client.readContract({ address: feed, abi: aggregatorAbi, functionName: "description" }),
    client.readContract({ address: feed, abi: aggregatorAbi, functionName: "decimals" }),
    client.readContract({ address: feed, abi: aggregatorAbi, functionName: "latestRoundData" }),
  ]);
  if (desc === "ETH / USD") ethUsd = { price: Number(round[1]) / 10 ** Number(dec), updatedAt: iso(Number(round[3])), description: desc };
  else console.log("price feed at " + feed + " is '" + desc + "', not ETH / USD; skipped");
} catch (e) {
  console.log("ETH/USD feed read failed: " + String((e as Error).message).split("\n")[0]);
}
let susdsRate: { usdsPerSusds: number; source: string } | null = null;
try {
  const eth = createPublicClient({ chain: mainnet, transport: http("https://ethereum-rpc.publicnode.com", { retryCount: 3, retryDelay: 800 }) });
  const vault: Address = "0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD";
  const [sym, assets] = await Promise.all([eth.readContract({ address: vault, abi: vaultAbi, functionName: "symbol" }), eth.readContract({ address: vault, abi: vaultAbi, functionName: "convertToAssets", args: [10n ** 18n] })]);
  if (sym === "sUSDS") susdsRate = { usdsPerSusds: Number(assets) / 1e18, source: "sUSDS vault " + vault + " on Ethereum, convertToAssets(1e18)" };
} catch (e) {
  console.log("sUSDS rate read failed: " + String((e as Error).message).split("\n")[0]);
}

const latestBlock = await retry(() => client.getBlock({ blockNumber: latest }), "latest block");
const out = {
  collectedAt: iso(Math.floor(Date.now() / 1000)),
  latestBlock: latest.toString(),
  latestBlockTime: iso(Number(latestBlock.timestamp)),
  wallets: WALLETS,
  markets,
  pools,
  events,
  balances,
  cash,
  fees,
  ethUsd,
  susdsRate,
};
fs.writeFileSync(path.join(HERE, "onchain.json"), JSON.stringify(out, null, 1));
console.log("fees: " + fees.length + " transactions; ETH/USD " + (ethUsd?.price ?? "n/a") + "; USDS per sUSDS " + (susdsRate?.usdsPerSusds ?? "n/a"));
for (const [bot] of Object.entries(WALLETS)) {
  const held = Object.entries(balances[bot]).map(([k, bs]) => k + ":" + bs.map((b) => (Number(b) / 1e18).toFixed(4)).join("/")).join("  ");
  console.log(bot.padEnd(12) + " cash " + (Number(cash[bot]) / 1e18).toFixed(4) + "  " + held);
}
console.log("wrote " + path.join(HERE, "onchain.json"));
