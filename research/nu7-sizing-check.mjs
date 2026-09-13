import {readFileSync,writeFileSync} from 'node:fs';
import {parseUnits,formatUnits} from 'viem';
import {getPublicClient} from '../src/clients.ts';
import {quoteExactIn} from '../src/dex.ts';
import {blend,DEFAULT_LIMITS} from '../src/trade.ts';
const inv=JSON.parse(readFileSync('research/nu7-inventory.json','utf8'));
const live=JSON.parse(readFileSync('research/nu7-final-check.json','utf8'));
const client=getPublicClient(10,'https://optimism-rpc.publicnode.com');
const rate=Number(live.sUSDSinUSDS), bankroll=1000/rate;
const specs=[
 {name:'ZIP-218',id:'0xc38fa340cfdc9c758826dd4a8dc15b58728d0418',own:[.92,.05,.03],weight:.5,target:0,sizes:[1]},
 {name:'Smoothing',id:'0x29bcd2cee8d413a2235f7970fcdde432dcaf10fc',own:[.10,.75,.12,.03],weight:.5,target:1,sizes:[1]},
 {name:'v4 immediate',id:'0xd21eadcf5c30475244aea8a9cf7cb6759f0bdae6',own:[.65,.10,.20,.05],weight:.25,target:0,sizes:[1,15,180]},
 {name:'Readiness ship',id:'0xc03bf1725b72ab5765b639c582853ede9afb26a6',own:[.85,.09,.02,.04],weight:.25,target:0,sizes:[1,25,180]},
 {name:'Reissuance 2031',id:'0xbfdf8ef15ab1ec4bd44bec7ee904270e6ad7ec9c',own:[.20,.05,.70,.05],weight:.25,target:2,sizes:[1,25,180]},
];
const rows=[];
for(const s of specs){
 const m=live.markets.find(m=>m.id.toLowerCase()===s.id),api=inv.markets.find(m=>m.id===s.id);
 if(m.payoutReported||m.questions.some(q=>q.is_pending_arbitration))throw new Error('Ineligible market');
 const spots=m.holdings.map(h=>m.pools.find(p=>p.outcome===h.outcome)?.spot??0),sum=spots.reduce((a,b)=>a+b,0);
 const q=blend(s.own,spots.map(p=>p/sum),s.weight),spot=spots[s.target];
 const upperSpend=Math.max(0,Math.min(bankroll*.2,bankroll*.25*(q[s.target]-spot)/(1-spot)));
 const pool=m.pools.find(p=>p.outcome===m.holdings[s.target].outcome);
 const quotes=[];
 for(const size of s.sizes){
  const out=await quoteExactIn(client,10,api.collateralToken,api.wrappedTokens[s.target],parseUnits(String(size),18),pool.fee);
  const tokens=Number(formatUnits(out,18)),fill=size/tokens;
  quotes.push({size,tokens,fill,edge:q[s.target]-fill,EV:q[s.target]*tokens-size});
 }
 rows.push({...s,spot,blended:q,existingTargetTokens:Number(m.holdings[s.target].tokens),optimisticStandaloneSpendCap:upperSpend,optimisticStandaloneTokenCap:upperSpend/spot,quotes});
}
const output={at:new Date().toISOString(),block:String(await client.getBlockNumber()),rate,bankroll,limits:DEFAULT_LIMITS,note:'Caps are generous new-position upper bounds before slippage, not an exact optimization of existing mixed positions. Conservative portfolio decision: do not add when already holding more preferred-outcome tokens than the full-budget standalone limit.',rows};
writeFileSync('research/nu7-sizing-check.json',JSON.stringify(output,null,2));
console.log(JSON.stringify(output,null,2));
