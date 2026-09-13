import { readFileSync, writeFileSync } from 'node:fs';
import { getPublicClient } from '../src/clients.ts';
import { readMarket } from '../src/market-view.ts';
import { snapshot, describeSnapshot, completeSetArb, blend, DEFAULT_LIMITS, ladder, fadeLadder, planTrade } from '../src/trade.ts';
const market = '0xbfdf8ef15ab1ec4bd44bec7ee904270e6ad7ec9c';
const client = getPublicClient(10, 'https://optimism-rpc.publicnode.com');
const [snap, info, block] = await Promise.all([snapshot(client, 10, market), readMarket(client, 10, market), client.getBlockNumber()]);
const json = (data: unknown) => JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
console.log(describeSnapshot(snap));
const arb = await completeSetArb(client, snap, 10);
const out: any = {checkedAt:new Date().toISOString(),block,snap,info,arb};
writeFileSync('research/reissuance-live-2026-09-13.json', json(out));
console.log(json({checkedAt:out.checkedAt,block,info,arb}));
if (process.argv.includes('--siblings')) {
  const siblings = await Promise.all(['0x1cddeaed87aea58bcee8053efe413a12537f881a','0xe00a21ce58f37524a690df0a06d94883c590525f'].map(async (address:any) => ({snap:await snapshot(client,10,address),info:await readMarket(client,10,address)})));
  writeFileSync('research/reissuance-siblings-2026-09-13.json',json({checkedAt:new Date().toISOString(),siblings}));
  console.log(json(siblings.map(s=>({question:s.info.encodedQuestions,market:s.snap.market,tradeable:s.snap.tradeable,pools:s.snap.pools.map(p=>({outcome:p.outcome,liquidity:p.liquidity}))}))));
}
if (process.argv.includes('--plan')) {
  const estimate = JSON.parse(readFileSync('research/reissuance-estimate-2026-09-13.json','utf8'));
  const blended = blend(estimate.own, snap.implied, estimate.weight);
  const limits = {...DEFAULT_LIMITS, bankroll:180.2813};
  const sizes = process.argv.includes('--refine') ? [5,6,7,7.25,7.3,8,10] : [1,2,5,10,15,20,25,30,40,50,75,100,150,180];
  out.plan = {own:estimate.own,weight:estimate.weight,blended,limits,candidates:[]};
  for (const p of snap.pools) {
    if (!p.exists) continue;
    if (blended[p.index] > (snap.spot[p.index] ?? 0)) {
      const rungs = await ladder(client,snap,p.index,blended,limits,sizes);
      out.plan.candidates.push({target:p.index,kind:'long',rungs,...planTrade(rungs,blended,p.index,limits)});
    }
    if ((snap.spot[p.index] ?? 0)-blended[p.index] >= limits.minEdge/2) {
      const rungs = await fadeLadder(client,snap,p.index,blended,limits,sizes);
      out.plan.candidates.push({target:p.index,kind:'fade',rungs,...planTrade(rungs,blended,p.index,limits)});
    }
  }
  writeFileSync(process.argv.includes('--refine') ? 'research/reissuance-plan-refined-2026-09-13.json' : 'research/reissuance-plan-2026-09-13.json',json(out));
  console.log(json(out.plan));
}
