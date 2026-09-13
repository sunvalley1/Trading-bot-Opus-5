import { mkdirSync, writeFileSync } from 'node:fs';
import { formatUnits, parseAbi } from 'viem';
import { getPublicClient } from '../src/clients.ts';
import { searchSeerMarkets } from '../src/seer-api.ts';

// Read-only inventory. Public addresses only; no signer or transaction submission.
const client = getPublicClient(10, 'https://optimism-rpc.publicnode.com');
const account = process.env.LIQUIDITY_WALLET;
if (!account) throw new Error('No configured public wallet address');
const markets = await searchSeerMarkets(/Zcash NU7|NU7 coinholder/i, {chainId: 10});
const abi = parseAbi(['function balanceOf(address) view returns (uint256)', 'function convertToAssets(uint256) view returns (uint256)', 'function asset() view returns (address)']);
const tokens = [...new Set(markets.flatMap(m => [m.collateralToken, ...m.wrappedTokens]))];
const reads = await client.multicall({ contracts: tokens.map(address => ({address, abi, functionName:'balanceOf', args:[account]})) });
const balances = Object.fromEntries(reads.map((r,i) => [tokens[i], r.status === 'success' ? formatUnits(r.result,18) : {error:r.error.shortMessage}]));
const collateral = markets[0].collateralToken;
const conversion = {};
for (const [name,args] of [['asset',[]],['convertToAssets',[10n**18n]]]) {
  try { conversion[name] = String(await client.readContract({address:collateral, abi, functionName:name, args})); }
  catch(e) { conversion[name] = {error:e.shortMessage}; }
}
const output = {checkedAt:new Date().toISOString(), block:String(await client.getBlockNumber()), account, ethBalance:formatUnits(await client.getBalance({address:account}),18), collateral, conversion, balances, markets};
mkdirSync('research',{recursive:true});
writeFileSync('research/nu7-inventory.json',JSON.stringify(output,null,2));
console.log(JSON.stringify({checkedAt:output.checkedAt,block:output.block,account,ethBalance:output.ethBalance,collateral,conversion,collateralBalance:balances[collateral], markets:markets.map(m=>({id:m.id,url:m.url,question:m.encodedQuestions,reported:m.payoutReported,holdings:m.wrappedTokens.map((t,i)=>({outcome:m.outcomes[i],balance:balances[t]}))}))},null,2));
