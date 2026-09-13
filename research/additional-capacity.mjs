// Read-only incremental quote review. Never queues transactions or changes the approved risk limits.
import {readFileSync,writeFileSync} from 'node:fs';
import {formatUnits,parseUnits,parseAbi} from 'viem';
import {getPublicClient} from '../src/clients.ts';
import {readMarket} from '../src/market-view.ts';
import {snapshot,blend,quoteDirect,quoteSplit,quoteFade,evaluate,completeSetArb} from '../src/trade.ts';
import {erc20FullAbi} from '../src/dex.ts';
const c=getPublicClient(10,'https://optimism-rpc.publicnode.com');
const account='0x017859431458cEdac674344f6031d41c9A68a858';
const plan=JSON.parse(readFileSync('research/target-wallet-plan.json','utf8'));
const specs=[
 {label:'ZIP-218',market:'0xc38fa340cfdc9c758826dd4a8dc15b58728d0418',own:[.92,.05,.03],weight:.5},
 {label:'Issuance smoothing',market:'0x29bcd2cee8d413a2235f7970fcdde432dcaf10fc',own:[.10,.75,.12,.03],weight:.5},
 {label:'v4 Immediate',market:'0xd21eadcf5c30475244aea8a9cf7cb6759f0bdae6',own:[.65,.10,.20,.05],weight:.25,heldTarget:0,cost:23},
 {label:'Readiness',market:'0xc03bf1725b72ab5765b639c582853ede9afb26a6',own:[.85,.09,.02,.04],weight:.25},
 {label:'NSM February 2031',market:'0xbfdf8ef15ab1ec4bd44bec7ee904270e6ad7ec9c',own:[.20,.05,.70,.05],weight:.25,heldTarget:2,cost:29},
];
const sizes=[.1,1,10,50,100];
const start=new Date().toISOString(),rows=[];
for(const spec of specs){
 const [info,snap]=await Promise.all([readMarket(c,10,spec.market),snapshot(c,10,spec.market)]);
 if(info.payoutReported||info.questions.some(q=>q.is_pending_arbitration||BigInt(q.bond)>0n))throw new Error(spec.label+': resolution changed');
 // Our own fills moved these prices. Keep the pre-trade blended forecast; do not treat our buys as evidence.
 const q=spec.heldTarget===undefined?blend(spec.own,snap.implied,spec.weight):plan.rows.find(r=>r.address===spec.market).q;
 const holdings=await c.multicall({allowFailure:false,contracts:info.wrappedTokens.map(address=>({address,abi:erc20FullAbi,functionName:'balanceOf',args:[account]}))});
 const memo=new Map();
 const quoting={...c,simulateContract(args){const key=JSON.stringify(args,(_,v)=>typeof v==='bigint'?String(v):v);if(!memo.has(key))memo.set(key,c.simulateContract(args));return memo.get(key);}};
 const quotes=[];
 for(const size of sizes){
  const amount=parseUnits(String(size),18);
  const requests=snap.outcomes.flatMap((_,i)=>[
   quoteDirect(quoting,snap,i,amount),quoteSplit(quoting,snap,i,amount),quoteFade(quoting,snap,i,amount),
  ]);
  const results=await Promise.all(requests);
  for(const quote of results){
   if(!quote||quote.tokensOut<=0n||!Number.isFinite(quote.avgPrice))continue;
   const t=evaluate(quote,q,plan.limits);
   quotes.push({size,route:t.kind,target:t.targetIndex,outcome:snap.outcomes[t.targetIndex],retained:t.retained.map(i=>snap.outcomes[i]),cost:Number(formatUnits(t.collateralIn,18)),tokens:Number(formatUnits(t.tokensOut,18)),fill:t.avgPrice,winProbability:t.winProb,edge:t.winProb-t.avgPrice,slippage:t.slippage,EV:t.ev});
  }
 }
 const arb=await completeSetArb(quoting,snap,1);
 const best=[...quotes].sort((a,b)=>b.edge-a.edge)[0];
 const row={...spec,question:info.encodedQuestions,q,forecastFrozen:spec.heldTarget!==undefined,holdings:holdings.map((n,i)=>({outcome:snap.outcomes[i],tokens:formatUnits(n,18)})),pools:snap.pools.map(p=>({outcome:p.outcome,liquidity:String(p.liquidity),spot:p.price})),best,eligibleOnEdge:quotes.filter(t=>t.edge>=plan.limits.minEdge),arb,quotes};
 rows.push(row);
 console.log(JSON.stringify({market:spec.label,best,edgePassCount:row.eligibleOnEdge.length,arb,additionalDirect:spec.heldTarget===undefined?undefined:quotes.filter(t=>t.route==='direct'&&t.target===spec.heldTarget)}));
}
const [cash,rate]=await Promise.all([c.readContract({address:'0xb5B2dc7fd34C249F4be7fB1fCea07950784229e0',abi:erc20FullAbi,functionName:'balanceOf',args:[account]}),c.readContract({address:'0xe1e4953C93Da52b95eDD0ffd910565D3369aCd6b',abi:parseAbi(['function getRate() view returns(uint256)']),functionName:'getRate'})]);
const output={start,at:new Date().toISOString(),account,cash:formatUnits(cash,18),cashUSD:Number(formatUnits(cash,18))*Number(formatUnits(rate,18)),alreadySpent:52,totalBudgetUSD:1000,minEdge:plan.limits.minEdge,sizes,rows};
writeFileSync('research/additional-capacity.json',JSON.stringify(output,null,2));
console.log(JSON.stringify({at:output.at,cash:output.cash,cashUSD:output.cashUSD,edgePassCount:rows.reduce((n,r)=>n+r.eligibleOnEdge.length,0)}));
