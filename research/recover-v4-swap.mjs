// One unfinished swap after a confirmed approval. Default is read-only simulation.
// The submission marker is exclusive and is never deleted or retried automatically.
import {existsSync, writeFileSync} from 'node:fs';
import {createWalletClient, custom, decodeFunctionData, formatUnits, isAddressEqual, parseAbi, parseUnits} from 'viem';
import {getPublicClient} from '../src/clients.ts';
import {CHAINS} from '../src/config.ts';
import {erc20FullAbi, getDex, quoteExactIn, univ3RouterAbi} from '../src/dex.ts';
import {readMarket, estimateFees} from '../src/market-view.ts';
import {attachToSigner, findRunningSigner, setPendingLabel} from '../src/metamask-bridge.ts';
import {snapshot, blend} from '../src/trade.ts';

const account = '0x017859431458cEdac674344f6031d41c9A68a858';
const market = '0xd21eadcf5c30475244aea8a9cf7cb6759f0bdae6';
const approvalHash = '0x99eae0d92d58d46e05a6d4f6712d73be092f1e00785b06d5c1883b91cb245561';
const amount = parseUnits('23',18), originalQuote = 72743362535311010914n;
const collateral = '0xb5B2dc7fd34C249F4be7fB1fCea07950784229e0';
const token = '0xab30Cc3E515bf24fbFa47D0d0A54Ac3342e71d45';
const router = getDex(10).router;
const rpc = 'https://mainnet.optimism.io';
const client = getPublicClient(10,'https://optimism-rpc.publicnode.com');
const receipts = getPublicClient(10,rpc);
const stateFile = 'research/recover-v4-swap-state.json';
const serialize = value => JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v,2);
const fail = message => { throw new Error(message); };
const expectedAt = process.argv.indexOf('--expect-account');
if (expectedAt < 0 || process.argv[expectedAt+1]?.toLowerCase() !== account.toLowerCase()) fail('Pass the exact --expect-account.');
if (existsSync(stateFile)) fail('This recovery was already attempted. Inspect its saved state; do not submit again.');

const [receipt, approval, info, snap] = await Promise.all([
  receipts.getTransactionReceipt({hash:approvalHash}),
  receipts.getTransaction({hash:approvalHash}),
  readMarket(client,10,market),
  snapshot(client,10,market),
]);
const decoded = decodeFunctionData({abi:erc20FullAbi,data:approval.input});
if (receipt.status !== 'success' || !isAddressEqual(approval.from,account) || !isAddressEqual(approval.to,collateral)
    || decoded.functionName !== 'approve' || !isAddressEqual(decoded.args[0],router) || decoded.args[1] !== amount
    || approval.nonce !== 0) fail('The prerequisite approval does not match this recovery.');
if (info.payoutReported || info.questions.some(q=>q.is_pending_arbitration || BigInt(q.bond)>0n)) fail('Market resolution state changed; reassess.');
if (!isAddressEqual(info.collateralToken,collateral) || !isAddressEqual(info.wrappedTokens[0],token)) fail('Unexpected market tokens.');
const pool = snap.pools[0];
if (!pool.exists || pool.liquidity <= 0n) fail('No active outcome liquidity.');

async function balances() {
  const [cash, held, allowance, latestNonce, pendingNonce] = await Promise.all([
    client.readContract({address:collateral,abi:erc20FullAbi,functionName:'balanceOf',args:[account]}),
    client.readContract({address:token,abi:erc20FullAbi,functionName:'balanceOf',args:[account]}),
    client.readContract({address:collateral,abi:erc20FullAbi,functionName:'allowance',args:[account,router]}),
    receipts.getTransactionCount({address:account,blockTag:'latest'}),
    receipts.getTransactionCount({address:account,blockTag:'pending'}),
  ]);
  return {cash,held,allowance,latestNonce,pendingNonce};
}
function requireUnsent(b) {
  if (b.cash < amount || b.held !== 0n || b.allowance !== amount || b.latestNonce !== 1 || b.pendingNonce !== 1)
    fail('Wallet state changed or another transaction exists. Refusing a duplicate or altered trade.');
}
const before = await balances();
requireUnsent(before);
const rate = await client.readContract({address:'0xe1e4953C93Da52b95eDD0ffd910565D3369aCd6b',abi:parseAbi(['function getRate() view returns(uint256)']),functionName:'getRate'});
const q = blend([.65,.10,.20,.05],snap.implied,.25)[0];
const quote = await quoteExactIn(client,10,collateral,token,amount,pool.fee);
const originalMinimum = originalQuote*9950n/10000n;
const freshMinimum = quote*9950n/10000n;
const minimum = freshMinimum > originalMinimum ? freshMinimum : originalMinimum;
const fill = 23/Number(formatUnits(quote,18));
const bankroll = 1000/Number(formatUnits(rate,18));
const maxStake = bankroll*Math.min(.25*(q-fill)/(1-fill),.2);
if (quote < minimum || q-fill < .07 || q-23/Number(formatUnits(minimum,18)) < .07
    || fill/pool.price-1 > .15 || 23 > maxStake) fail('Fresh quote no longer meets the approved price or sizing limits.');
const fees = await estimateFees(receipts,10);
const call = {address:router,abi:univ3RouterAbi,functionName:'exactInputSingle',args:[{
  tokenIn:collateral,tokenOut:token,fee:pool.fee,recipient:account,
  amountIn:amount,amountOutMinimum:minimum,sqrtPriceLimitX96:0n,
}],account,nonce:1,...fees};
const {request} = await client.simulateContract(call);
const estimate = await client.estimateContractGas(call);
const gas = estimate+estimate*30n/100n+100000n;
const plan = {at:new Date().toISOString(),account,market,approvalHash,approvalBlock:receipt.blockNumber,
  before,nonce:1,spend:formatUnits(amount,18),quote:formatUnits(quote,18),minimum:formatUnits(minimum,18),
  fill,blendedProbability:q,edge:q-fill,maxStake,liquidity:pool.liquidity,gas,simulation:'passed'};
writeFileSync('research/recover-v4-swap-preflight.json',serialize(plan));
console.log(serialize(plan));
if (!process.argv.includes('--submit')) {
  console.log('Read-only simulation complete. No transaction queued.');
} else {
  const status = await findRunningSigner();
  if (!status || status.chainId !== 10 || !status.account || !isAddressEqual(status.account,account) || status.queued !== 0)
    fail('The existing signer must have the expected wallet, chain 10, and no queued transactions.');
  const bridge = await attachToSigner(10,rpc);
  if (!bridge || !isAddressEqual(await bridge.account,account)) fail('Unexpected signer account.');
  try {
    const wallet = createWalletClient({chain:CHAINS[10],account,transport:custom(bridge.provider,{retryCount:0})});
    if (await wallet.getChainId() !== 10) fail('Wrong chain.');
    requireUnsent(await balances());
    if (Date.now()-Date.parse(plan.at)>60000) fail('Quote is too old; nothing submitted.');
    const state = {...plan,status:'awaiting-human-swap-signature'};
    writeFileSync(stateFile,serialize(state),{flag:'wx'});
    setPendingLabel('Complete approved v4 trade: swap exactly 23 sUSDS, no new approval');
    console.log('Queued only the unfinished swap. Confirm 23 sUSDS in Rabby.');
    try {
      const hash = await wallet.writeContract({...request,account,chain:CHAINS[10],nonce:1,gas});
      Object.assign(state,{status:'broadcast',hash});
      writeFileSync(stateFile,serialize(state));
      console.log('Swap broadcast: '+hash);
      const swapReceipt = await receipts.waitForTransactionReceipt({hash,timeout:120000,retryCount:12,retryDelay:2000});
      Object.assign(state,{status:swapReceipt.status,receipt:swapReceipt,after:await balances()});
      writeFileSync(stateFile,serialize(state));
      console.log(serialize({status:state.status,hash,after:state.after,gasUsed:swapReceipt.gasUsed}));
      if (swapReceipt.status !== 'success') fail('The swap reverted. Do not retry automatically.');
    } catch(e) {
      Object.assign(state,{error:e.shortMessage??e.message});
      writeFileSync(stateFile,serialize(state));
      throw e;
    }
  } finally { bridge.close(); }
}
