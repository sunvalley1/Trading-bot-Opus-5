// Read-only wallet and collateral check; no signer or transaction client.
import { writeFileSync } from 'node:fs';
import { formatUnits, parseAbi } from 'viem';
import { getPublicClient } from '../src/clients.ts';
const client = getPublicClient(10);
const account = '0x6156D8DEe1Cf1b8BC22261D5D98E5bBEC1eEA6fe';
// Spark's official Optimism.sol registry, read this session.
const susds = '0xb5B2dc7fd34C249F4be7fB1fCea07950784229e0';
const rateProvider = '0xe1e4953C93Da52b95eDD0ffd910565D3369aCd6b';
const [eth, cash, rate, rateCode, block] = await Promise.all([
  client.getBalance({address:account}),
  client.readContract({address:susds,abi:parseAbi(['function balanceOf(address) view returns (uint256)']),functionName:'balanceOf',args:[account]}),
  client.readContract({address:rateProvider,abi:parseAbi(['function getRate() view returns (uint256)']),functionName:'getRate'}),
  client.getBytecode({address:rateProvider}),client.getBlockNumber()
]);
if (!rateCode || rateCode === '0x') throw new Error('Rate provider has no code');
const usdPerShare = Number(formatUnits(rate,18));
const report = {checkedAt:new Date().toISOString(),block:String(block),chain:10,account,ETH:formatUnits(eth,18),sUSDS:formatUnits(cash,18),USDSperSUSDS:usdPerShare,budgetUSD:1000,budgetSUSDS:1000/usdPerShare,liquidUSD:Number(formatUnits(cash,18))*usdPerShare,pegAssumption:'USDS equals approximately $1',rateSource:'https://github.com/sparkdotfi/spark-address-registry/blob/master/src/Optimism.sol'};
writeFileSync('research/nu7-wallet-6156.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
