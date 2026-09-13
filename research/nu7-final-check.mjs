import {readFileSync,writeFileSync} from 'node:fs';
import {formatUnits,parseAbi,zeroAddress} from 'viem';
import {getPublicClient} from '../src/clients.ts';
import {marketViewAbi} from '../src/abis.ts';
import {SEER_ADDRESSES} from '../src/config.ts';
import {getDex,univ3FactoryAbi,univ3PoolAbi,erc20FullAbi} from '../src/dex.ts';

// Immutable market addresses discovered earlier; all status, pool state, and balances below are live.
const cached=JSON.parse(readFileSync('research/nu7-inventory.json','utf8'));
const client=getPublicClient(10,'https://optimism-rpc.publicnode.com');
const account=process.argv[2]??cached.account, dex=getDex(10), cfg=SEER_ADDRESSES[10];
const info=await client.multicall({allowFailure:false,contracts:cached.markets.map(m=>({address:cfg.MarketView,abi:marketViewAbi,functionName:'getMarket',args:[cfg.MarketFactory,m.id]}))});
const requests=info.flatMap((m,mi)=>m.wrappedTokens.flatMap((token,i)=>dex.feeTiers.map(fee=>({mi,i,token,collateral:m.collateralToken,fee}))));
const addresses=await client.multicall({allowFailure:false,contracts:requests.map(r=>({address:dex.factory,abi:univ3FactoryAbi,functionName:'getPool',args:[r.token,r.collateral,r.fee]}))});
const pools=requests.map((r,i)=>({...r,address:addresses[i]})).filter(p=>p.address.toLowerCase()!==zeroAddress);
const liquidity=await client.multicall({allowFailure:false,contracts:pools.map(p=>({address:p.address,abi:univ3PoolAbi,functionName:'liquidity'}))});
const states=await client.multicall({allowFailure:false,contracts:pools.map(p=>({address:p.address,abi:univ3PoolAbi,functionName:'slot0'}))});
const tokens=[...new Set(info.flatMap(m=>[m.collateralToken,...m.wrappedTokens]))];
const balances=await client.multicall({allowFailure:false,contracts:tokens.map(address=>({address,abi:erc20FullAbi,functionName:'balanceOf',args:[account]}))});
const byToken=Object.fromEntries(tokens.map((t,i)=>[t.toLowerCase(),formatUnits(balances[i],18)]));
const rate=await client.readContract({address:'0xe1e4953C93Da52b95eDD0ffd910565D3369aCd6b',abi:parseAbi(['function getRate() view returns (uint256)']),functionName:'getRate'});
const markets=info.map((m,mi)=>({id:m.id,url:cached.markets[mi].url,name:m.marketName,encodedQuestions:m.encodedQuestions,payoutReported:m.payoutReported,questions:m.questions,pools:pools.flatMap((p,i)=>{
  if(p.mi!==mi)return [];
  const p0=(Number(states[i][0])/2**96)**2;
  return [{outcome:m.outcomes[p.i],fee:p.fee,pool:p.address,liquidity:String(liquidity[i]),spot:p.token.toLowerCase()<p.collateral.toLowerCase()?p0:1/p0}];
}),holdings:m.wrappedTokens.map((t,i)=>({outcome:m.outcomes[i],tokens:byToken[t.toLowerCase()]}))}));
const out={at:new Date().toISOString(),block:String(await client.getBlockNumber()),account,collateralBalance:byToken[info[0].collateralToken.toLowerCase()],sUSDSinUSDS:formatUnits(rate,18),ethBalance:formatUnits(await client.getBalance({address:account}),18),markets};
writeFileSync('research/nu7-final-check.json',JSON.stringify(out,(_,v)=>typeof v==='bigint'?String(v):v,2));
console.log(JSON.stringify({...out,markets:markets.map(m=>({name:m.name,id:m.id,live:m.pools.some(p=>BigInt(p.liquidity)>0n),payout:m.payoutReported,arbitration:m.questions.some(q=>q.is_pending_arbitration),answers:m.questions.some(q=>BigInt(q.bond)>0n),pools:m.pools,holdings:m.holdings.filter(h=>Number(h.tokens)>0)}))},null,2));
