// Read-only: live quotes, oracle state, wallet inventory and sequential EVM simulation.
// This file has no wallet client, signing operation or transaction submission.
import { writeFileSync } from 'node:fs';
import { formatUnits, parseUnits } from 'viem';
import { getPublicClient } from '../src/clients.ts';
import { readMarket, estimateFees } from '../src/market-view.ts';
import { snapshot, blend, quoteDirect, quoteSplit, evaluate, DEFAULT_LIMITS } from '../src/trade.ts';
import { erc20FullAbi, getDex, univ3RouterAbi } from '../src/dex.ts';
const client = getPublicClient(10,'https://optimism-rpc.publicnode.com');
const account = '0x6156D8DEe1Cf1b8BC22261D5D98E5bBEC1eEA6fe';
const market = '0xc03bf1725b72ab5765b639c582853ede9afb26a6';
const refs = ['0xc38fa340cfdc9c758826dd4a8dc15b58728d0418','0x29bcd2cee8d413a2235f7970fcdde432dcaf10fc','0xd21eadcf5c30475244aea8a9cf7cb6759f0bdae6',market,'0xbfdf8ef15ab1ec4bd44bec7ee904270e6ad7ec9c'];
const infos = await Promise.all(refs.map(address=>readMarket(client,10,address)));
for (const info of infos) {
  if (info.payoutReported || info.questions.some(q=>q.is_pending_arbitration)) throw new Error('Payout or arbitration is a stop condition: '+info.marketName);
}
const snap = await snapshot(client,10,market);
if (!snap.tradeable || snap.pools[0].liquidity<=0n) throw new Error('Readiness target has no active liquidity');
const size = parseUnits('40',18);
const own = [.85,.10,.02,.03];
const q = blend(own,snap.implied,.5);
const limits = {...DEFAULT_LIMITS,bankroll:700,minEdge:.08};
const [direct,split] = await Promise.all([quoteDirect(client,snap,0,size),quoteSplit(client,snap,0,size)]);
if (!direct || direct.tokensOut<=0n) throw new Error('No direct live quote');
if (split && split.avgPrice<direct.avgPrice) throw new Error('Route changed; replan before presenting');
const trade = evaluate(direct,q,limits);
const minOut = direct.tokensOut*999n/1000n; // 0.1% execution tolerance.
const maxFill = 40/Number(formatUnits(minOut,18));
if (trade.winProb-maxFill<.08 || trade.slippage>.15 || 40>700*Math.min(trade.kelly*.25,.2)) throw new Error('Trade fails conservative limits at the protected fill');
const dex = getDex(10);
const [cash,eth,allowance,latest,pending,block] = await Promise.all([
  client.readContract({address:snap.collateral,abi:erc20FullAbi,functionName:'balanceOf',args:[account]}),
  client.getBalance({address:account}),
  client.readContract({address:snap.collateral,abi:erc20FullAbi,functionName:'allowance',args:[account,dex.router]}),
  client.getTransactionCount({address:account,blockTag:'latest'}),
  client.getTransactionCount({address:account,blockTag:'pending'}),client.getBlockNumber()
]);
if (cash<size || eth===0n || latest!==pending) throw new Error('Insufficient funds/gas or a pending transaction needs investigation');
const holdings = await Promise.all(infos.map(async info=>({market:info.id,balances:await Promise.all(info.wrappedTokens.map(async (token,i)=>({outcome:info.outcomes[i],balance:formatUnits(await client.readContract({address:token,abi:erc20FullAbi,functionName:'balanceOf',args:[account]}),18)})))})));
if (holdings.some(h=>h.balances.some(b=>Number(b.balance)>0))) throw new Error('Existing NU7 exposure requires a new incremental plan');
// Verify the V4 sibling question and pool state; do not inherit its wording.
const v4Siblings = [];
for (const address of ['0x9c003f4627d0563359664e8f0b208f354f7acdff','0x0226e074f4e79c898e9f8f4bcd3f79a0c3544acd']) {
  const info=await readMarket(client,10,address);
  const sibling=await snapshot(client,10,address);
  v4Siblings.push({market:address,encodedQuestions:info.encodedQuestions,tradeable:sibling.tradeable,pools:sibling.pools.map(p=>({outcome:p.outcome,liquidity:String(p.liquidity)}))});
}
const calls = [];
if (allowance<size) calls.push({to:snap.collateral,abi:erc20FullAbi,functionName:'approve',args:[dex.router,size]});
calls.push({to:dex.router,abi:univ3RouterAbi,functionName:'exactInputSingle',args:[{tokenIn:snap.collateral,tokenOut:snap.pools[0].token,fee:snap.pools[0].fee,recipient:account,amountIn:size,amountOutMinimum:minOut,sqrtPriceLimitX96:0n}]});
calls.push({to:snap.collateral,abi:erc20FullAbi,functionName:'balanceOf',args:[account]});
calls.push({to:snap.pools[0].token,abi:erc20FullAbi,functionName:'balanceOf',args:[account]});
const fees = await estimateFees(client,10);
// Explicit per-call gas avoids the RPC's default gas exceeding its block limit.
// simulateBlocks also avoids simulateCalls' extra zero-address probe.
const simulatedBlocks = await client.simulateBlocks({blocks:[{calls:calls.map((call,i)=>({...call,account,nonce:latest+i,gas:500000n,maxFeePerGas:fees.maxFeePerGas,maxPriorityFeePerGas:fees.maxPriorityFeePerGas}))}],validation:true});
const simulation = {block:simulatedBlocks[0],results:simulatedBlocks[0].calls};
if (simulation.results.some(r=>r.status!=='success')) throw new Error('Sequential approval/swap simulation failed: '+JSON.stringify(simulation.results,(_,v)=>typeof v==='bigint'?String(v):v));
const baseCommand = 'npm run trade -- '+market+' --chain 10 --rpc https://optimism-rpc.publicnode.com --outcome 0 --route direct --size 40 --slippage 0.001 --signer metamask --expect-account '+account;
const report={checkedAt:new Date().toISOString(),block:String(block),account,chain:10,balanceSUSDS:formatUnits(cash,18),ETH:formatUnits(eth,18),allowance:formatUnits(allowance,18),nonce:{latest,pending},own,weight:.5,blended:q,limits,trade,minimumTokens:formatUnits(minOut,18),maximumFill:maxFill,edgeAtMinimumTokens:trade.winProb-maxFill,questions:infos.map(info=>({market:info.id,encodedQuestions:info.encodedQuestions,payoutReported:info.payoutReported,questions:info.questions})),holdings,v4Siblings,simulation,dryRunCommand:baseCommand+' --account '+account+' --dry-run',humanExecutionCommand:baseCommand+' --yes',executionStatus:'Nothing submitted. Human approval and wallet confirmation required. Requote before human execution.'};
writeFileSync('research/nu7-readiness-6156-preflight.json',JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));
console.log(JSON.stringify({checkedAt:report.checkedAt,block,trade,minimumTokens:report.minimumTokens,maximumFill:maxFill,edgeAtMinimumTokens:report.edgeAtMinimumTokens,cash:report.balanceSUSDS,eth:report.ETH,nonce:report.nonce,v4Siblings,simulation:simulation.results.map(r=>({status:r.status,result:typeof r.result==='bigint'?String(r.result):r.result,gasUsed:String(r.gasUsed)})),dryRunCommand:report.dryRunCommand},(_,v)=>typeof v==='bigint'?String(v):v,2));
