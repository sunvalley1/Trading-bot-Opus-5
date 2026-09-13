import { writeFileSync } from 'node:fs';
import { getPublicClient } from '../src/clients.js';
import { snapshot, blend, ladder, fadeLadder, planTrade, completeSetArb, DEFAULT_LIMITS } from '../src/trade.js';

// Read-only research helper: uses verified market addresses without the unavailable Seer HTTP API.
// No wallet client, transaction command, approvals, or sending operations are imported.
const client = getPublicClient(10, 'https://optimism-rpc.publicnode.com');
const snap = await snapshot(client, 10, '0xd21eadcf5c30475244aea8a9cf7cb6759f0bdae6');
const own = [0.65, 0.10, 0.20, 0.05];
const q = blend(own, snap.implied, 0.25);
const limits = { ...DEFAULT_LIMITS, bankroll: 180 };
const sizes = [1, 5, 6, 7, 8, 10, 15, 25, 50, 75, 100, 150, 200];
const output: Record<string, unknown> = {
  checkedAt: new Date().toISOString(), block: await client.getBlockNumber(),
  note: 'Planning only. Existing position makes standalone new-position Kelly sizing insufficient for approving an addition.',
  own, weight: 0.25, blended: q, limits, snapshot: snap,
};
if (!snap.payoutReported && snap.tradeable) {
  output.arb10 = await completeSetArb(client, snap, 10);
  const longs = await ladder(client, snap, 0, q, limits, sizes);
  output.longImmediate = {rungs: longs, standalonePlan: planTrade(longs, q, 0, limits)};
  const fades = await fadeLadder(client, snap, 2, q, limits, sizes);
  output.fadeNoDate = {rungs: fades, standalonePlan: planTrade(fades, q, 2, limits)};
}
output.siblings = [];
for (const address of ['0x9c003f4627d0563359664e8f0b208f354f7acdff', '0x0226e074f4e79c898e9f8f4bcd3f79a0c3544acd'] as const) {
  const sibling = await snapshot(client, 10, address);
  (output.siblings as unknown[]).push({address, name:sibling.name, outcomes:sibling.outcomes, tradeable:sibling.tradeable, pools:sibling.pools.map(p=>({exists:p.exists, liquidity:p.liquidity}))});
}
const json = JSON.stringify(output, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
writeFileSync('research/v4-disable-2026-09-13-live-quotes.json', json);
console.log(JSON.stringify({checkedAt:output.checkedAt,block:output.block,blended:q,payoutReported:snap.payoutReported,tradeable:snap.tradeable,spot:snap.spot,arb:output.arb10,long:(output.longImmediate as any)?.standalonePlan,fade:(output.fadeNoDate as any)?.standalonePlan,siblings:output.siblings},(_,v)=>typeof v==='bigint'?v.toString():v,2));
