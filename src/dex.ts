/**
 * The AMM layer Seer outcome tokens actually trade on, per chain.
 *
 * Seer itself only mints and burns complete sets; every price comes from one AMM pool per outcome,
 * `outcomeToken x collateral`. Which AMM that is depends on the chain:
 *   - Gnosis (100):   Swapr v3 (Algebra) - no fee tier, `globalState()`, router takes a deadline.
 *   - Optimism (10):  Uniswap v3 - fee tier per pool, `slot0()`, SwapRouter02 (no deadline field).
 *
 * Address provenance (ethskills rule: never hallucinate an address):
 *   - Gnosis Swapr addresses were verified on Blockscout 2026-09-06/07 (see SWAPR_GNOSIS below).
 *   - Optimism Uniswap v3 addresses were verified on 2026-09-12 by reading the live chain: the factory
 *     returns the real Seer pools (balances match app.seer.pm's own `poolBalance` to the 4th decimal), and
 *     the router/quoter bytecode contains exactly the selectors this file encodes - SwapRouter02's
 *     `exactInputSingle` has NO deadline field, SwapRouter v1's does.
 *   - `npm run verify-dex` re-runs every one of those checks against the live chain.
 */
import { isAddressEqual, zeroAddress, type Abi, type Address, type PublicClient } from "viem";
import type { ChainId } from "./config.js";
/**
 * Swapr v3 (Algebra) on Gnosis, verified on Blockscout 2026-09-06/07. Kept inline so this repository does not
 * depend on the liquidity-provision code it was split out of.
 */
const SWAPR_GNOSIS = {
  factory: "0xA0864cCA6E114013AB0e27cbd5B6f4c8947da766", // AlgebraFactory (Swapr v3)
  nfpm: "0x91fd594c46d8b01e62dbdebed2401dde01817834", // NonfungiblePositionManager
  router: "0xffb643e73f280b97809a8b41f7232ab401a04ee1", // SwapRouter
  // Algebra Quoter. Verified 2026-09-18 by reading the chain: factory() returns the AlgebraFactory above, the
  // bytecode dispatches quoteExactInputSingle(address,address,uint256,uint160) (0x2d9ebd1d) and
  // quoteExactOutputSingle(address,address,uint256,uint160) (0x9e73c81d), and a live quote on a Seer outcome
  // pool matched that pool's globalState price to the 4th decimal.
  quoter: "0xcBaD9FDf0D2814659Eb26f600EFDeAF005Eda0F7",
} as const satisfies Record<string, Address>;

export type DexKind = "algebra" | "univ3";

export interface DexConfig {
  kind: DexKind;
  name: string;
  factory: Address;
  router: Address;
  /** Uniswap QuoterV2 on Optimism; the Algebra Quoter (flat arguments, no fee) on Gnosis. */
  quoter?: Address;
  nfpm: Address;
  /** Uniswap fee tiers to look for, most likely first. Algebra pools have no fee tier. */
  feeTiers: number[];
  poolUrl: (pool: Address) => string;
}

export const DEXES: Partial<Record<ChainId, DexConfig>> = {
  100: {
    kind: "algebra",
    name: "Swapr v3 (Algebra)",
    factory: SWAPR_GNOSIS.factory,
    router: SWAPR_GNOSIS.router,
    quoter: SWAPR_GNOSIS.quoter,
    nfpm: SWAPR_GNOSIS.nfpm,
    feeTiers: [0],
    poolUrl: (p) => "https://gnosisscan.io/address/" + p,
  },
  10: {
    kind: "univ3",
    name: "Uniswap v3",
    factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", // SwapRouter02: params tuple has no deadline
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e", // QuoterV2
    nfpm: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    feeTiers: [100, 500, 3000, 10000], // Seer's Optimism outcome pools are the 0.01% tier
    poolUrl: (p) => "https://app.uniswap.org/explore/pools/optimism/" + p,
  },
};

export function getDex(chainId: ChainId): DexConfig {
  const dex = DEXES[chainId];
  if (!dex) throw new Error("No AMM configured for chain " + chainId + ". Seer trading is set up for Gnosis (100) and Optimism (10).");
  return dex;
}

// ---------------------------------------------------------------- ABIs

export const univ3FactoryAbi = [
  { type: "function", name: "getPool", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }], outputs: [{ type: "address" }] },
] as const satisfies Abi;

export const algebraFactoryLookupAbi = [
  { type: "function", name: "poolByPair", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "address" }] },
] as const satisfies Abi;

export const univ3PoolAbi = [
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
  { type: "function", name: "liquidity", stateMutability: "view", inputs: [], outputs: [{ type: "uint128" }] },
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "fee", stateMutability: "view", inputs: [], outputs: [{ type: "uint24" }] },
] as const satisfies Abi;

export const algebraPoolStateAbi = [
  {
    type: "function",
    name: "globalState",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "price", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "fee", type: "uint16" },
      { name: "timepointIndex", type: "uint16" },
      { name: "communityFeeToken0", type: "uint8" },
      { name: "communityFeeToken1", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
] as const satisfies Abi;

export const quoterV2Abi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "quoteExactOutputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountIn", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const satisfies Abi;

/**
 * Algebra Quoter (Swapr v3, Gnosis): flat arguments and no fee tier, unlike Uniswap's QuoterV2 tuple. Like
 * QuoterV2 it is not a view: it runs the swap and reverts with the result, so it is called through eth_call.
 */
export const algebraQuoterAbi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "limitSqrtPrice", type: "uint160" },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "fee", type: "uint16" },
    ],
  },
  {
    type: "function",
    name: "quoteExactOutputSingle",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountOut", type: "uint256" },
      { name: "limitSqrtPrice", type: "uint160" },
    ],
    outputs: [
      { name: "amountIn", type: "uint256" },
      { name: "fee", type: "uint16" },
    ],
  },
] as const satisfies Abi;

/**
 * Algebra SwapRouter (Swapr v3, Gnosis). exactInputSingle has a deadline and no fee field; exactOutputSingle
 * keeps a uint24 fee field that Algebra ignores. Both selectors (0xbc651188, 0xdb3e2198) are in the deployed
 * bytecode; the Uniswap-shaped variants are not.
 */
export const algebraRouterAbi = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "limitSqrtPrice", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "exactOutputSingle",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
          { name: "amountOut", type: "uint256" },
          { name: "amountInMaximum", type: "uint256" },
          { name: "limitSqrtPrice", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountIn", type: "uint256" }],
  },
] as const satisfies Abi;

/** A router call ready to send, with `recipient` left blank for the sender to fill in with its own address. */
export interface SwapCall {
  abi: Abi;
  functionName: "exactInputSingle" | "exactOutputSingle";
  args: readonly unknown[];
}

// Algebra's router refuses a swap mined after its deadline. Legs go out one after another, each waiting for its
// receipt, so half an hour covers a long multi-leg trade without leaving a signed swap valid for days.
const SWAP_DEADLINE_SECONDS = 30 * 60;
const swapDeadline = () => BigInt(Math.floor(Date.now() / 1000) + SWAP_DEADLINE_SECONDS);

/** Sell exactly `amountIn` of tokenIn for at least `minOut` of tokenOut, in the call format of this chain's router. */
export function exactInCall(chainId: ChainId, p: { tokenIn: Address; tokenOut: Address; fee: number; amountIn: bigint; minOut: bigint }): SwapCall {
  if (getDex(chainId).kind === "algebra") {
    return {
      abi: algebraRouterAbi,
      functionName: "exactInputSingle",
      args: [{ tokenIn: p.tokenIn, tokenOut: p.tokenOut, recipient: "" as Address, deadline: swapDeadline(), amountIn: p.amountIn, amountOutMinimum: p.minOut, limitSqrtPrice: 0n }],
    };
  }
  return {
    abi: univ3RouterAbi,
    functionName: "exactInputSingle",
    args: [{ tokenIn: p.tokenIn, tokenOut: p.tokenOut, fee: p.fee, recipient: "" as Address, amountIn: p.amountIn, amountOutMinimum: p.minOut, sqrtPriceLimitX96: 0n }],
  };
}

/** Buy exactly `amountOut` of tokenOut for at most `maxIn` of tokenIn, in the call format of this chain's router. */
export function exactOutCall(chainId: ChainId, p: { tokenIn: Address; tokenOut: Address; fee: number; amountOut: bigint; maxIn: bigint }): SwapCall {
  if (getDex(chainId).kind === "algebra") {
    return {
      abi: algebraRouterAbi,
      functionName: "exactOutputSingle",
      args: [{ tokenIn: p.tokenIn, tokenOut: p.tokenOut, fee: 0, recipient: "" as Address, deadline: swapDeadline(), amountOut: p.amountOut, amountInMaximum: p.maxIn, limitSqrtPrice: 0n }],
    };
  }
  return {
    abi: univ3RouterAbi,
    functionName: "exactOutputSingle",
    args: [{ tokenIn: p.tokenIn, tokenOut: p.tokenOut, fee: p.fee, recipient: "" as Address, amountOut: p.amountOut, amountInMaximum: p.maxIn, sqrtPriceLimitX96: 0n }],
  };
}

/** SwapRouter02 (Uniswap v3, Optimism): the params tuple has NO deadline field. Verified against the bytecode. */
export const univ3RouterAbi = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "exactOutputSingle",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountOut", type: "uint256" },
          { name: "amountInMaximum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountIn", type: "uint256" }],
  },
] as const satisfies Abi;

export const erc20FullAbi = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
] as const satisfies Abi;

/** Seer Router: complete-set mint/burn and redemption. Selectors verified in the deployed bytecode. */
export const seerRouterAbi = [
  { type: "function", name: "splitPosition", stateMutability: "nonpayable", inputs: [{ name: "collateralToken", type: "address" }, { name: "market", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "mergePositions", stateMutability: "nonpayable", inputs: [{ name: "collateralToken", type: "address" }, { name: "market", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  {
    type: "function",
    name: "redeemPositions",
    stateMutability: "nonpayable",
    inputs: [
      { name: "collateralToken", type: "address" },
      { name: "market", type: "address" },
      { name: "outcomeIndexes", type: "uint256[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [],
  },
] as const satisfies Abi;

// ---------------------------------------------------------------- pool discovery

export interface OutcomePool {
  index: number;
  outcome: string;
  token: Address;
  symbol: string;
  pool: Address;
  /** false when no pool was ever created for this outcome (common for "Invalid") */
  exists: boolean;
  fee: number;
  outcomeIsToken0: boolean;
  /** collateral per outcome token, from the pool's current sqrt price; undefined if uninitialized */
  price?: number;
  liquidity: bigint;
  /** raw token balances held by the pool contract */
  outcomeBalance: bigint;
  collateralBalance: bigint;
}

function priceFromSqrtX96(sqrtPriceX96: bigint): number {
  const s = Number(sqrtPriceX96) / 2 ** 96;
  return s * s;
}

/**
 * A contract call that reverted told us something true about the chain. A transport that timed out or got
 * rate-limited told us nothing at all - and silently turning the second into a default is how a scan decides
 * a funded market is empty. Public RPCs rate-limit hard when a scan makes hundreds of calls, so the two must
 * never be conflated: reverts are returned to the caller to interpret, transport failures are retried and
 * then thrown.
 */
function isTransportError(e: unknown): boolean {
  const name = (e as { name?: string })?.name ?? "";
  const msg = (e as Error)?.message ?? "";
  if (/ContractFunctionRevertedError|ContractFunctionZeroDataError|AbiDecodingZeroDataError/.test(name)) return false;
  if (/reverted|execution reverted|returned no data/i.test(msg) && !/rate ?limit|429|timeout|fetch failed/i.test(msg)) return false;
  return true;
}

export async function withRetry<T>(fn: () => Promise<T>, label: string, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (!isTransportError(e)) throw e;
      await new Promise((r) => setTimeout(r, 250 * 2 ** i));
    }
  }
  throw new Error(label + ": RPC failed after " + attempts + " attempts - " + ((lastError as Error)?.message ?? "").split("\n")[0]);
}

/** A read whose revert means "this contract does not answer that", but whose transport failure must not be hidden. */
async function readOr<T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await withRetry(fn, label);
  } catch (e) {
    if (isTransportError(e)) throw e;
    return fallback;
  }
}

/** Finds the outcomeToken/collateral pool for one outcome and reads its current state. */
export async function readOutcomePool(
  client: PublicClient,
  chainId: ChainId,
  index: number,
  outcome: string,
  token: Address,
  collateral: Address,
): Promise<OutcomePool> {
  const dex = getDex(chainId);
  const symbol = await readOr(() => client.readContract({ address: token, abi: erc20FullAbi, functionName: "symbol" }), "?", "symbol(" + token + ")");
  const base: OutcomePool = {
    index,
    outcome,
    token,
    symbol,
    pool: zeroAddress,
    exists: false,
    fee: 0,
    outcomeIsToken0: false,
    liquidity: 0n,
    outcomeBalance: 0n,
    collateralBalance: 0n,
  };

  let pool: Address = zeroAddress;
  let fee = 0;
  if (dex.kind === "univ3") {
    for (const tier of dex.feeTiers) {
      const p = await withRetry(() => client.readContract({ address: dex.factory, abi: univ3FactoryAbi, functionName: "getPool", args: [token, collateral, tier] }), "getPool");
      if (isAddressEqual(p, zeroAddress)) continue;
      const liq = await readOr(() => client.readContract({ address: p, abi: univ3PoolAbi, functionName: "liquidity" }), 0n, "liquidity(" + p + ")");
      // several tiers can exist; keep the one that actually has liquidity, else the first that exists
      if (isAddressEqual(pool, zeroAddress) || liq > 0n) {
        pool = p;
        fee = tier;
        if (liq > 0n) break;
      }
    }
  } else {
    const [t0, t1] = token.toLowerCase() < collateral.toLowerCase() ? [token, collateral] : [collateral, token];
    pool = await withRetry(() => client.readContract({ address: dex.factory, abi: algebraFactoryLookupAbi, functionName: "poolByPair", args: [t0, t1] }), "poolByPair");
  }
  if (isAddressEqual(pool, zeroAddress)) return base;

  const t0 = await withRetry(() => client.readContract({ address: pool, abi: univ3PoolAbi, functionName: "token0" }), "token0(" + pool + ")");
  const liquidity = await withRetry(() => client.readContract({ address: pool, abi: univ3PoolAbi, functionName: "liquidity" }), "liquidity(" + pool + ")");
  const outcomeBalance = await withRetry(() => client.readContract({ address: token, abi: erc20FullAbi, functionName: "balanceOf", args: [pool] }), "balanceOf(outcome)");
  const collateralBalance = await withRetry(() => client.readContract({ address: collateral, abi: erc20FullAbi, functionName: "balanceOf", args: [pool] }), "balanceOf(collateral)");
  const outcomeIsToken0 = isAddressEqual(t0, token);

  let sqrtPriceX96 = 0n;
  if (dex.kind === "univ3") {
    const s0 = await withRetry(() => client.readContract({ address: pool, abi: univ3PoolAbi, functionName: "slot0" }), "slot0(" + pool + ")");
    sqrtPriceX96 = s0[0];
  } else {
    const gs = await withRetry(() => client.readContract({ address: pool, abi: algebraPoolStateAbi, functionName: "globalState" }), "globalState(" + pool + ")");
    sqrtPriceX96 = gs[0];
  }
  const p0 = sqrtPriceX96 > 0n ? priceFromSqrtX96(sqrtPriceX96) : undefined;
  return {
    ...base,
    pool,
    exists: true,
    fee,
    outcomeIsToken0,
    liquidity,
    outcomeBalance,
    collateralBalance,
    price: p0 === undefined ? undefined : outcomeIsToken0 ? p0 : 1 / p0,
  };
}

// ---------------------------------------------------------------- activity: what has actually traded

/**
 * What a pool's own event log says has happened in it. This is the honest measure of participation.
 *
 * Seer's "open interest" is complete sets minted times the collateral price: it counts the creator's seed
 * sets, it moves only on a split or a merge, and a trader who swaps collateral straight into a pool leaves it
 * unchanged. A market can carry thousands of dollars of it with nobody but the creator having acted. The
 * Swap events cannot be faked that way: every fill is one, with its size and the address it was filled for.
 */
export interface PoolActivity {
  /** the price the pool was initialized at, collateral per outcome token: what the creator seeded */
  seedPrice?: number;
  swaps: number;
  /** swaps that moved collateral INTO the pool (someone bought the outcome) / out of it (someone sold) */
  buys: number;
  sells: number;
  /** collateral moved through the pool by swaps, both directions, in collateral units (18 decimals) */
  volume: bigint;
  /** the addresses swaps were filled for (the router passes the trader as recipient) */
  traders: Set<string>;
  firstSwapBlock?: bigint;
  lastSwapBlock?: bigint;
}

// Uniswap v3 and Algebra emit the same two events with the same parameter types, so one pair of definitions
// serves both chains (Algebra calls the sqrt price "price"; the topic hash only depends on the types).
const initializeEvent = {
  type: "event",
  name: "Initialize",
  inputs: [
    { name: "sqrtPriceX96", type: "uint160", indexed: false },
    { name: "tick", type: "int24", indexed: false },
  ],
} as const;
const swapEvent = {
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
} as const;

/**
 * Reads Initialize and Swap events for one pool between two blocks. Public RPCs refuse wide log queries
 * (Optimism's answers "RPC Request failed" past about 10k blocks), so the range is walked in chunks; each
 * chunk is a fast call, and a market a few days old costs a few seconds per pool.
 */
export async function poolActivity(
  client: PublicClient,
  pool: Address,
  outcomeIsToken0: boolean,
  fromBlock: bigint,
  toBlock: bigint,
  chunk = 10_000n,
): Promise<PoolActivity> {
  const out: PoolActivity = { swaps: 0, buys: 0, sells: 0, volume: 0n, traders: new Set() };
  // Providers cap the block range of a log query at different sizes (10k on mainnet.optimism.io, less on some
  // fallbacks). Start at `chunk` and halve on failure down to 1k, so any endpoint that answers at all is usable.
  let step = chunk;
  let from = fromBlock;
  while (from <= toBlock) {
    const to = from + step - 1n > toBlock ? toBlock : from + step - 1n;
    let logs;
    try {
      logs = await withRetry(() => client.getLogs({ address: pool, events: [initializeEvent, swapEvent], fromBlock: from, toBlock: to }), "getLogs(" + pool + " " + from + "-" + to + ")", 3);
    } catch (e) {
      // a provider that caps the range at a handful of blocks (Alchemy's free tier: 10) will never serve this scan;
      // say so at once instead of halving toward a size that would take thousands of calls
      if (/up to a \d+ block range|free tier/i.test((e as Error).message ?? "")) throw e;
      if (step > 1_000n) {
        step = step / 2n;
        continue;
      }
      throw e;
    }
    from = to + 1n;
    for (const l of logs) {
      const a = l.args as unknown as { sqrtPriceX96?: bigint; amount0?: bigint; amount1?: bigint; recipient?: Address };
      if (l.eventName === "Initialize") {
        if (a.sqrtPriceX96 && a.sqrtPriceX96 > 0n) {
          const p0 = priceFromSqrtX96(a.sqrtPriceX96);
          out.seedPrice = outcomeIsToken0 ? p0 : 1 / p0;
        }
        continue;
      }
      const collateralAmount = (outcomeIsToken0 ? a.amount1 : a.amount0) ?? 0n;
      out.swaps++;
      if (collateralAmount > 0n) out.buys++;
      else out.sells++;
      out.volume += collateralAmount < 0n ? -collateralAmount : collateralAmount;
      if (a.recipient) out.traders.add(a.recipient.toLowerCase());
      if (l.blockNumber !== null) {
        out.firstSwapBlock ??= l.blockNumber;
        out.lastSwapBlock = l.blockNumber;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- quoting

/**
 * Exact-input quote through the chain's quoter. Needs no balance and no allowance, so it is safe to ask for
 * sizes the wallet could not actually afford - that is the point: map the depth curve before sizing anything.
 * Returns 0n when the pool cannot fill the trade at all.
 */
export async function quoteExactIn(
  client: PublicClient,
  chainId: ChainId,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  fee: number,
): Promise<bigint> {
  const dex = getDex(chainId);
  if (amountIn <= 0n) return 0n;
  const quoter = dex.quoter;
  if (!quoter) throw new Error("No verified quoter for " + dex.name + " on chain " + chainId + "; quote by simulating the router instead.");
  // A revert here is the honest answer "this pool cannot fill that" -> 0. A transport failure is not an
  // answer at all, and must never be read as "no liquidity": that is how a fundable market looks empty.
  if (dex.kind === "algebra") {
    return readOr(
      async () => {
        const { result } = await client.simulateContract({ address: quoter, abi: algebraQuoterAbi, functionName: "quoteExactInputSingle", args: [tokenIn, tokenOut, amountIn, 0n] });
        return result[0];
      },
      0n,
      "quote",
    );
  }
  return readOr(
    async () => {
      const { result } = await client.simulateContract({
        address: quoter,
        abi: quoterV2Abi,
        functionName: "quoteExactInputSingle",
        args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }],
      });
      return result[0];
    },
    0n,
    "quote",
  );
}

/**
 * Exact-OUTPUT quote: how much `tokenIn` it costs to receive exactly `amountOut` of `tokenOut`. This is what an
 * unwind needs, because a merge wants a precise number of tokens (enough to complete the sets), not a precise
 * spend. Returns 0n when the pool cannot deliver that amount at all.
 */
export async function quoteExactOut(
  client: PublicClient,
  chainId: ChainId,
  tokenIn: Address,
  tokenOut: Address,
  amountOut: bigint,
  fee: number,
): Promise<bigint> {
  const dex = getDex(chainId);
  if (amountOut <= 0n) return 0n;
  const quoter = dex.quoter;
  if (!quoter) throw new Error("No verified quoter for " + dex.name + " on chain " + chainId + "; exact-output quotes are not available there.");
  if (dex.kind === "algebra") {
    return readOr(
      async () => {
        const { result } = await client.simulateContract({ address: quoter, abi: algebraQuoterAbi, functionName: "quoteExactOutputSingle", args: [tokenIn, tokenOut, amountOut, 0n] });
        return result[0];
      },
      0n,
      "quoteExactOut",
    );
  }
  return readOr(
    async () => {
      const { result } = await client.simulateContract({
        address: quoter,
        abi: quoterV2Abi,
        functionName: "quoteExactOutputSingle",
        args: [{ tokenIn, tokenOut, amount: amountOut, fee, sqrtPriceLimitX96: 0n }],
      });
      return result[0];
    },
    0n,
    "quoteExactOut",
  );
}
