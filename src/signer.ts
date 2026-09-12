/**
 * One MetaMask tab for the whole session.
 *   npm run signer                 start the signer page (opens ONE browser tab) and keep it running
 *   npm run signer -- --stop       stop the running signer page
 *   npm run signer -- --status     is one running? which wallet, how many items signed
 * Options: --port <n> (default SIGNER_PORT or 8571)  --chain <id>  --rpc <url>  --no-open (do not open the browser)
 *          --wallet rabby|metamask|<name> (which installed wallet the page uses; default SIGNER_WALLET, else the page offers a choice)
 *
 * While it runs, every liquidity command in MetaMask mode (add-liquidity, remove-liquidity, reprice) finds it through
 * `.signer.json` and sends its transactions and batches to this tab: no new tab, no new connection prompt, only the
 * MetaMask confirmations themselves. If a signer page is already running, `npm run signer` just reopens its tab.
 */
import "dotenv/config";
import { parseArgs } from "./args.js";
import { getRpcUrl } from "./clients.js";
import { parseChainId } from "./config.js";
import { DEFAULT_SIGNER_PORT, findRunningSigner, openInBrowser, signerFilePath, startSignerService, stopRunningSigner } from "./metamask-bridge.js";

const args = parseArgs(process.argv.slice(2));
const stamp = () => new Date().toLocaleTimeString();

// The short-lived paths (--stop, --status, "already running") end by themselves once their request is answered:
// no process.exit() there, which on Windows can trip over the socket that is still being closed.
async function main() {
  if (args.stop) {
    console.log((await stopRunningSigner()) ? "signer page stopped" : "no signer page is running");
    return;
  }
  const running = await findRunningSigner();
  if (args.status) {
    if (!running) {
      console.log("no signer page is running");
      return;
    }
    console.log(`running: ${running.url}\n  chain ${running.chainId}, wallet ${running.account ?? "not connected yet"}, batching ${running.atomic ? "available" : "not available"}, ${running.queued} waiting, ${running.signed} signed`);
    const pages = running.pages.filter((p) => p.seenAgo < 30);
    if (!pages.length) console.log("  no open page has reported in the last 30 s: is the tab open? (npm run signer reopens it)");
    for (const p of pages)
      console.log(
        `  page ${p.page}: ${p.hasWallet ? (p.wallet ? `${p.wallet} selected` : p.isMetaMask ? "MetaMask present" : "a wallet is present (not MetaMask)") : "NO wallet object in that browser"}; account ${p.account ?? "none"}; ${p.busy ? "busy" : "idle"}; reported ${p.seenAgo}s ago\n    shows: "${p.status}"${p.error ? `\n    last error: ${p.error}` : ""}`,
      );
    return;
  }
  if (running) {
    console.log(`A signer page is already running (${running.url}): chain ${running.chainId}, wallet ${running.account ?? "not connected yet"}.`);
    if (!args["no-open"]) {
      openInBrowser(running.url);
      console.log("Reopened it in your browser. Stop it with Ctrl+C in its own terminal or with: npm run signer -- --stop");
    }
    return;
  }

  const chainId = parseChainId(args.chain);
  const rpcUrl = getRpcUrl(chainId, args.rpc);
  const port = args.port ? Number(args.port) : DEFAULT_SIGNER_PORT;
  let service: Awaited<ReturnType<typeof startSignerService>> | undefined;
  let stopping = false;
  const stop = (why: string) => {
    if (stopping) return;
    stopping = true;
    service?.close();
    console.log(`\n${stamp()}  signer stopped (${why})`);
    setTimeout(() => process.exit(0), 100); // let the last reply and the closing sockets drain first
  };
  process.on("SIGINT", () => stop("Ctrl+C"));
  process.on("SIGTERM", () => stop("terminated"));
  try {
    const wallet = typeof args.wallet === "string" ? args.wallet : process.env.SIGNER_WALLET;
    service = await startSignerService(chainId, rpcUrl, { port, openBrowser: !args["no-open"], wallet, onEvent: (line) => console.log(`${stamp()}  ${line}`), onStop: () => stop("npm run signer -- --stop") });
    if (wallet) console.log(`Wallet preference: ${wallet} (the page picks it among the installed wallets)`);
  } catch (e) {
    console.error((e as NodeJS.ErrnoException).code === "EADDRINUSE" ? `port ${port} is busy: stop whatever uses it or pass --port <n>` : (e as Error).message);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Signer page: ${service.url}\n` +
      `Connect MetaMask in that tab once, then leave this running. Liquidity commands started while it runs (add-liquidity, ` +
      `remove-liquidity, reprice with LIQUIDITY_SIGNER=metamask) send their batches to this tab instead of opening their own.\n` +
      `Discovery file: ${signerFilePath()}\nStop with Ctrl+C or: npm run signer -- --stop\n`,
  );
  // the server keeps the process alive from here on
}

await main();
