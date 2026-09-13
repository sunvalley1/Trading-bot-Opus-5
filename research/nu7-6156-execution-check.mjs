// Read-only execution verification. Never signs or sends.
import { writeFileSync } from 'node:fs';
import { formatUnits, isAddressEqual, parseAbi } from 'viem';
import { getPublicClient } from '../src/clients.ts';
import { readMarket } from '../src/market-view.ts';
import { erc20FullAbi, getDex } from '../src/dex.ts';
const client=getPublicClient(10,'https://mainnet.optimism.io');
const account='0x6156D8DEe1Cf1b8BC22261D5D98E5bBEC1eEA6fe';
const market='0xc03bf1725b72ab5765b639c582853ede9afb26a6';
const approvalHash='0x707eadcb187df40c3ed37cc83f49fd7f3473c44425ed1cda15019252bcceff6c';
const tradeHash='0x922e3728474779e9b1d95f8586f1eee48ceaf53b311b3a5b33c3b0840f0f952a';
const [info,approval,swap]=await Promise.all([readMarket(client,10,market),client.getTransactionReceipt({hash:approvalHash}),client.getTransactionReceipt({hash:tradeHash})]);
if (approval.status!=='success'||swap.status!=='success'||!isAddressEqual(swap.from,account)||!isAddressEqual(approval.from,account)) throw new Error('Receipt/wallet verification failed');
const balances=await Promise.all(info.wrappedTokens.map(async(token,i)=>({outcome:info.outcomes[i],balance:formatUnits(await client.readContract({address:token,abi:erc20FullAbi,functionName:'balanceOf',args:[account]}),18)})));
const [cash,eth,allowance,latest,pending,rate]=await Promise.all([
client.readContract({address:info.collateralToken,abi:erc20FullAbi,functionName:'balanceOf',args:[account]}),client.getBalance({address:account}),
client.readContract({address:info.collateralToken,abi:erc20FullAbi,functionName:'allowance',args:[account,getDex(10).router]}),
client.getTransactionCount({address:account,blockTag:'latest'}),client.getTransactionCount({address:account,blockTag:'pending'}),
client.readContract({address:'0xe1e4953C93Da52b95eDD0ffd910565D3369aCd6b',abi:parseAbi(['function getRate() view returns (uint256)']),functionName:'getRate'})]);
const received=Number(balances[0].balance);
const spent=700-Number(formatUnits(cash,18));
if (spent!==40||Math.abs(received-55.86671781598941)>1e-10||balances.slice(1).some(b=>Number(b.balance)>0)) throw new Error('Actual balances differ from the approved position');
const usdRate=Number(formatUnits(rate,18));
const report={checkedAt:new Date().toISOString(),chain:10,account,market,status:'confirmed',approvalHash,tradeHash,receipts:{approval,swap},spentSUSDS:spent,receivedTokens:balances[0].balance,averageFill:spent/received,quoteDifferenceTokens:received-55.86671781598941,remainingSUSDS:formatUnits(cash,18),ETH:formatUnits(eth,18),allowance:formatUnits(allowance,18),nonce:{latest,pending},balances,USDSperSUSDS:usdRate,pegAssumption:'USDS approximately $1',spentUSD:spent*usdRate,remainingUSD:Number(formatUnits(cash,18))*usdRate,executionFeesETHFromBalance:formatUnits(800000000000000n-eth,18),repeatCommand:false};
writeFileSync('research/nu7-6156-execution.json',JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));
console.log(JSON.stringify({...report,receipts:{approval:{status:approval.status,block:String(approval.blockNumber)},swap:{status:swap.status,block:String(swap.blockNumber)}}},(_,v)=>typeof v==='bigint'?String(v):v,2));
