import {readFileSync,writeFileSync} from 'node:fs';
import {encodeFunctionData,parseAbi,parseUnits} from 'viem';
import {simulateCalls} from 'viem/actions';
import {getPublicClient} from '../src/clients.ts';
import {quoteExactIn,univ3RouterAbi} from '../src/dex.ts';
const client=getPublicClient(10,'https://optimism-rpc.publicnode.com');
const account='0x017859431458cEdac674344f6031d41c9A68a858';
const plan=JSON.parse(readFileSync('research/target-wallet-plan.json','utf8'));
const collateral='0xb5B2dc7fd34C249F4be7fB1fCea07950784229e0',router='0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45';
const approvalAbi=parseAbi(['function approve(address spender,uint256 value) returns(bool)']);
const calls=[];
for(const t of plan.selected){
 const row=plan.rows.find(r=>r.address===t.address),pool=row.snap.pools[t.outcome],amount=parseUnits(String(t.cost),18);
 const quoted=await quoteExactIn(client,10,collateral,pool.token,amount,pool.fee);
 calls.push({to:collateral,data:encodeFunctionData({abi:approvalAbi,functionName:'approve',args:[router,amount]})});
 calls.push({to:router,data:encodeFunctionData({abi:univ3RouterAbi,functionName:'exactInputSingle',args:[{tokenIn:collateral,tokenOut:pool.token,fee:pool.fee,recipient:account,amountIn:amount,amountOutMinimum:quoted*9950n/10000n,sqrtPriceLimitX96:0n}]})});
}
// eth_simulateV1 only: no signing, no eth_sendTransaction, no persisted approvals or trades.
try {
 const result=await simulateCalls(client,{account,calls,validation:false});
 const output={at:new Date().toISOString(),account,method:'eth_simulateV1',result};
 writeFileSync('research/target-wallet-simulation.json',JSON.stringify(output,(_,v)=>typeof v==='bigint'?String(v):v,2));
 console.log(JSON.stringify({at:output.at,results:result.results.map((r,i)=>({i,status:r.status,gasUsed:String(r.gasUsed),result:r.result,error:r.error?.message}))},(_,v)=>typeof v==='bigint'?String(v):v));
 if(result.results.some(r=>r.status!=='success'))process.exitCode=1;
}catch(e){
 const output={at:new Date().toISOString(),method:'eth_simulateV1',error:e.shortMessage??e.message};
 writeFileSync('research/target-wallet-simulation.json',JSON.stringify(output,null,2));
 console.log(JSON.stringify(output));process.exitCode=1;
}
