/**
 * Which resolved markets a wallet still holds outcome tokens in, and what redeeming each would pay.
 *
 * Used by the queue executor (`npm run queue -- execute` and `npm run queue -- redeem`), so winnings are cashed in
 * on the next pass after a market resolves without anyone having to remember. Read-only: it finds, it never sends.
 *
 * Every resolved market on the chain is checked, not just the ones in scope: the scope moves on (the NU7 round
 * was over before its markets resolved), and the tokens stay in the wallet until someone redeems them.
 * A market whose held tokens all lost is left alone, since redeeming it pays nothing and costs gas.
 * Conditional markets come first: redeeming a child pays out its parent's outcome token, which the parent's own
 * redemption then turns into collateral.
 */
import { formatUnits, isAddressEqual, zeroAddress, type Address, type PublicClient } from "viem";
import type { ChainId } from "./config.js";
import { erc20FullAbi } from "./dex.js";
import { readMarket } from "./market-view.js";
import { searchSeerMarkets } from "./seer-api.js";

export interface Redeemable {
  market: Address;
  name: string;
  /** what redeeming pays, in the market's collateral (a parent outcome token for a conditional market) */
  expected: number;
  conditional: boolean;
}

export async function findRedeemable(client: PublicClient, chainId: ChainId, wallet: Address): Promise<{ found: Redeemable[]; worthless: string[] }> {
  const resolved = (await searchSeerMarkets(/./, { chainId })).filter((m) => m.payoutReported && m.wrappedTokens?.length);
  const tokens = resolved.flatMap((m) => m.wrappedTokens.map((t) => ({ market: m, token: t })));
  const balances = tokens.length
    ? await client.multicall({
        contracts: tokens.map((t) => ({ address: t.token, abi: erc20FullAbi, functionName: "balanceOf" as const, args: [wallet] as const })),
        allowFailure: true,
        batchSize: 8_192,
      })
    : [];
  const held = new Map<string, bigint[]>();
  tokens.forEach((t, i) => {
    const r = balances[i];
    const bal = r && r.status === "success" ? (r.result as bigint) : 0n;
    const list = held.get(t.market.id) ?? t.market.wrappedTokens.map(() => 0n);
    list[t.market.wrappedTokens.indexOf(t.token)] = bal;
    held.set(t.market.id, list);
  });

  const found: Redeemable[] = [];
  const worthless: string[] = [];
  for (const m of resolved) {
    const bals = held.get(m.id);
    if (!bals || bals.every((b) => b === 0n)) continue;
    // the payout as the chain holds it, not as the indexer last saw it
    const info = await readMarket(client, chainId, m.id);
    if (!info.payoutReported) continue;
    const nums = info.payoutNumerators.map((n) => BigInt(n));
    const denominator = nums.reduce((a, n) => a + n, 0n);
    if (denominator === 0n) continue;
    const pays = bals.reduce((a, b, i) => a + (b * (nums[i] ?? 0n)) / denominator, 0n);
    if (pays === 0n) {
      worthless.push(m.marketName);
      continue;
    }
    found.push({ market: m.id, name: m.marketName, expected: Number(formatUnits(pays, 18)), conditional: !isAddressEqual((info.parentMarket.id as Address) ?? zeroAddress, zeroAddress) });
  }
  found.sort((a, b) => Number(b.conditional) - Number(a.conditional));
  return { found, worthless };
}
