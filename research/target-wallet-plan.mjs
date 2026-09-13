import {readFileSync,writeFileSync} from 'node:fs';
import {formatUnits} from 'viem';
import {getPublicClient} from '../src/clients.ts';
import {readMarket} from '../src/market-view.ts';
import {snapshot,blend,ladder,planTrade,DEFAULT_LIMITS} from '../src/trade.ts';
const client=getPublicClient(10,'https://optimism-rpc.publicnode.com');
const final=JSON.parse(readFileSync('research/nu7-final-check.json','utf8'));
const account='0x017859431458cEdac674344f6031d41c9A68a858';
if(final.account.toLowerCase()!==account.toLowerCase())throw new Error('Wallet mismatch');
const rate=Number(final.sUSDSinUSDS),bankroll=1000/rate;
const limits={...DEFAULT_LIMITS,bankroll,minEdge:.07};
const specs=[{name:'v4 immediate',address:'0xd21eadcf5c30475244aea8a9cf7cb6759f0bdae6',target:0,own:[.65,.10,.20,.05],sizes:[1,5,10,15,20,22,23,24,25,50]},
{name:'Reissuance February 2031',address:'0xbfdf8ef15ab1ec4bd44bec7ee904270e6ad7ec9c',target:2,own:[.20,.05,.70,.05],sizes:[1,5,10,15,20,25,28,29,30,50]}];
const rows=[];
for(const s of specs){
 const info=await readMarket(client,10,s.address);
 if(info.payoutReported||info.questions.some(q=>q.is_pending_arbitration))throw new Error('Ineligible market');
 const snap=await snapshot(client,10,s.address),q=blend(s.own,snap.implied,.25);
 const rungs=await ladder(client,snap,s.target,q,limits,s.sizes),result=planTrade(rungs,q,s.target,limits);
 rows.push({...s,info,snap,q,rungs,result});
}
const selected=rows.filter(r=>r.result.trade).map(r=>{
 const t=r.result.trade,cost=Number(formatUnits(t.collateralIn,18)),tokens=Number(formatUnits(t.tokensOut,18));
 return {name:r.name,address:r.address,outcome:r.target,route:t.kind,retained:t.retained,cost,tokens,fill:t.avgPrice,p:t.winProb,edge:t.winProb-t.avgPrice,EV:t.ev,costUSD:cost*rate,EVUSD:t.ev*rate};
});
const total=selected.reduce((a,t)=>a+t.cost,0);
if(total>bankroll*.5)throw new Error('Aggregate fleet cap exceeded');
const output={at:new Date().toISOString(),block:String(await client.getBlockNumber()),account,rate,bankroll,limits,commonFactor:{label:'No usable poll result, all positions resolve Invalid',probability:.02,note:'This is a stress scenario already included within own Invalid estimates, not added again; failed quorum with published results has ambiguous mapping.'},rows,selected,total,totalUSD:total*rate,EVUSD:selected.reduce((a,t)=>a+t.EVUSD,0),worstCaseUSD:total*rate,fundingStatus:'Current wallet has zero sUSDS and ETH; no execution authorized or possible yet.'};
writeFileSync('research/target-wallet-plan.json',JSON.stringify(output,(_,v)=>typeof v==='bigint'?String(v):v,2));
console.log(JSON.stringify({at:output.at,account,bankroll,selected,total,totalUSD:output.totalUSD,EVUSD:output.EVUSD,worstCaseUSD:output.worstCaseUSD},null,2));
