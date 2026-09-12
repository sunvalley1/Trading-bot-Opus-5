/**
 * MetaMask signer bridge: lets the liquidity commands sign with the user's own browser wallet.
 *
 * A tiny HTTP server on 127.0.0.1 (random token) serves a page that connects to MetaMask (window.ethereum), switches
 * it to the right chain, reports whether the wallet can execute atomic batches there (EIP-5792
 * `wallet_getCapabilities`), and then polls the server for work:
 *  - a single transaction -> MetaMask `eth_sendTransaction` (one prompt),
 *  - a batch of calls      -> MetaMask `wallet_sendCalls` (one prompt for the whole batch, executed atomically through
 *                             the EIP-7702 smart account; MetaMask offers the one-time upgrade itself),
 * and posts the resulting hash(es) back.
 *
 * Two ways to run it:
 *  - `npm run signer` starts the server ONCE for the session and opens ONE tab; every later liquidity command finds it
 *    through the discovery file `.signer.json` (project root) and sends its work there: no new tab, no new
 *    "connect" prompt, only the MetaMask confirmations themselves. Stop it with Ctrl+C or `npm run signer -- --stop`.
 *  - without a running signer, a command starts its own server, opens a tab and closes the server when it exits.
 * Both use the same fixed local port when it is free (SIGNER_PORT, default 8571), so MetaMask sees one site and
 * remembers the connection.
 *
 * On the Node side the bridge is an EIP-1193 provider (reads go to the RPC, `eth_sendTransaction` goes to the
 * browser) plus a `sendCalls` function for batches. No private key is ever handled by the tool in this mode.
 */
import { exec } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Address, EIP1193Provider, Hex } from "viem";
import { CHAIN_NAMES, DEFAULT_RPC, NATIVE_SYMBOL, type ChainId } from "./config.js";

export const DEFAULT_SIGNER_PORT = Number(process.env.SIGNER_PORT) || 8571;

type BridgeCall = { to: Address; data: Hex; value: Hex };
type ItemKind = "tx" | "batch";

interface PendingItem {
  id: string;
  label: string;
  kind: ItemKind;
  tx?: Record<string, unknown>;
  calls?: BridgeCall[];
  resolve: (hashes: Hex[]) => void;
  reject: (e: Error) => void;
  /** the page that took the item (one page signs it, even when several tabs are open) */
  page?: string;
  /** last time the attached command asked for this item's result (undefined for in-process items) */
  polledAt?: number;
}

/** What an open signer page reports about itself every couple of seconds (diagnostics for `npm run signer -- --status`). */
export interface PageReport {
  page: string;
  status: string;
  hasWallet: boolean;
  isMetaMask: boolean;
  /** name of the wallet the page selected (EIP-6963 discovery), once known */
  wallet?: string;
  account: string | null;
  error: string | null;
  busy: boolean;
  /** seconds since the page last reported */
  seenAgo: number;
}

interface ItemResult {
  status: "pending" | "done" | "failed";
  kind: ItemKind;
  label: string;
  hashes?: Hex[];
  error?: string;
}

let currentLabel = "transaction";
/** Called by sendAndWait so the page can show what the user is about to sign. */
export function setPendingLabel(label: string) {
  currentLabel = label;
}

export interface MetaMaskBridge {
  url: string;
  /** resolves when the page has connected a wallet on the right chain */
  account: Promise<Address>;
  /** resolves with the connection: true when the wallet can execute atomic batches on this chain */
  atomic: Promise<boolean>;
  provider: EIP1193Provider;
  /** one confirmation for the whole batch; returns the transaction hash(es) the wallet reports */
  sendCalls(calls: Array<{ to: Address; data: Hex; value: bigint; label?: string }>, label: string): Promise<Hex[]>;
  close(): void;
  /** true when the work goes to a signer page started by `npm run signer` (nothing to close here) */
  attached?: boolean;
}

/** What `npm run signer` writes so that later commands can find the running page. */
export interface SignerRecord {
  url: string;
  port: number;
  token: string;
  chainId: number;
  rpcUrl: string;
  pid: number;
  startedAt: string;
}

export interface SignerStatus extends SignerRecord {
  account?: Address;
  atomic: boolean;
  queued: number;
  signed: number;
  pages: PageReport[];
}

/** Discovery file of the running signer page: `.signer.json` in the project root (override with SIGNER_FILE). */
export function signerFilePath(): string {
  return process.env.SIGNER_FILE || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".signer.json");
}

export function openInBrowser(url: string) {
  if (process.env.BRIDGE_NO_BROWSER) return;
  const cmd = process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/** Binds the first free port of the list (0 = any). */
function listen(server: http.Server, ports: number[]): Promise<number> {
  return ports.reduce<Promise<number>>(
    (prev, p) =>
      prev.catch(
        () =>
          new Promise<number>((resolve, reject) => {
            const onError = (e: NodeJS.ErrnoException) => {
              server.removeListener("listening", onListening);
              reject(e);
            };
            const onListening = () => {
              server.removeListener("error", onError);
              resolve((server.address() as { port: number }).port);
            };
            server.once("error", onError);
            server.once("listening", onListening);
            server.listen(p, "127.0.0.1");
          }),
      ),
    Promise.reject(new Error("no port")),
  );
}

interface CoreOptions {
  /** ports to try in order; 0 = any free port */
  ports: number[];
  persistent: boolean;
  /** fixed token (the signer service keeps one across restarts so its URL stays the same); random otherwise */
  token?: string;
  /** wallet the page should use when several are installed ("rabby", "metamask", ...; matched against the wallet's name / rdns) */
  wallet?: string;
  onEvent?: (line: string) => void;
  /** called when the page (or `npm run signer -- --stop`) asks the service to exit */
  onStop?: () => void;
}

interface BridgeCore {
  url: string;
  port: number;
  token: string;
  account: Promise<Address>;
  atomic: Promise<boolean>;
  status(): { account?: Address; atomic: boolean; queued: number; signed: number };
  enqueue(kind: ItemKind, payload: { tx?: Record<string, unknown>; calls?: BridgeCall[] }, label: string): Promise<Hex[]>;
  close(): void;
}

/** The HTTP server shared by the per-command bridge and the persistent signer service. */
async function createBridgeServer(chainId: ChainId, rpcUrl: string, opts: CoreOptions): Promise<BridgeCore> {
  const token = opts.token ?? randomBytes(16).toString("hex");
  const event = opts.onEvent ?? (() => {});
  let account: Address | undefined;
  let atomic = false;
  let signed = 0;
  let resolveAccount: (a: Address) => void = () => {};
  let resolveAtomic: (a: boolean) => void = () => {};
  const accountPromise = new Promise<Address>((r) => (resolveAccount = r));
  const atomicPromise = new Promise<boolean>((r) => (resolveAtomic = r));
  const queue: PendingItem[] = [];
  const results = new Map<string, ItemResult>();
  // every open page reports itself every ~2 s; an item is leased to one page and released if that page goes quiet
  const pages = new Map<string, Omit<PageReport, "seenAgo"> & { lastSeen: number }>();
  // long enough to survive a hidden tab whose timers Chrome slows to once a minute
  const LEASE_MS = 90_000;
  /** the first queued item this page may take (leases it), or undefined */
  const handOut = (pageId: string): PendingItem | undefined => {
    // an attached command polls its item every second; one that was killed must not leave a stale batch behind
    while (queue[0]?.polledAt && Date.now() - queue[0].polledAt! > 30_000) {
      const stale = queue.shift()!;
      stale.reject(new Error("the command that queued this item is gone"));
    }
    const p = queue[0];
    if (!p) return undefined;
    if (p.page && p.page !== pageId) {
      const holder = pages.get(p.page);
      if (!holder || Date.now() - holder.lastSeen > LEASE_MS) p.page = undefined; // that tab is gone: release
    }
    if (!p.page || p.page === pageId) {
      p.page = pageId;
      return p;
    }
    return undefined;
  };
  const publicItem = (p: PendingItem | undefined) => (p ? { id: p.id, label: p.label, kind: p.kind, tx: p.tx, calls: p.calls } : null);
  const pageReports = (): PageReport[] => {
    const now = Date.now();
    for (const [id, p] of pages) if (now - p.lastSeen > 60_000) pages.delete(id);
    return [...pages.values()].map(({ lastSeen, ...p }) => ({ ...p, seenAgo: Math.round((now - lastSeen) / 1000) }));
  };

  const enqueue =(kind: ItemKind, payload: { tx?: Record<string, unknown>; calls?: BridgeCall[] }, label: string) => {
    const id = randomBytes(8).toString("hex");
    results.set(id, { status: "pending", kind, label });
    const forget = () => setTimeout(() => results.delete(id), 30 * 60 * 1000).unref();
    event(`queued ${kind === "batch" ? `batch of ${payload.calls?.length ?? 0} calls` : "transaction"}: ${label}`);
    return new Promise<Hex[]>((resolve, reject) =>
      queue.push({
        id,
        label,
        kind,
        tx: payload.tx,
        calls: payload.calls,
        resolve: (hashes) => {
          results.set(id, { status: "done", kind, label, hashes });
          signed++;
          forget();
          event(`signed: ${label}\n    ${hashes.join(", ")}`);
          resolve(hashes);
        },
        reject: (e) => {
          results.set(id, { status: "failed", kind, label, error: e.message });
          forget();
          event(`rejected / failed: ${label}: ${e.message}`);
          reject(e);
        },
      }),
    );
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const json = (code: number, body: unknown) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(page(chainId, opts.persistent, (opts.wallet ?? process.env.SIGNER_WALLET ?? "").toLowerCase()));
      return;
    }
    if (url.searchParams.get("token") !== token) {
      json(403, { error: "bad token" });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/state") {
      // polled by a page; the first item is handed to one page only
      json(200, { chainId, account: account ?? null, pending: publicItem(handOut(url.searchParams.get("page") ?? "")) });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/wait") {
      // long poll: answers as soon as an item is available for this page, or empty after 25 s. A network reply wakes a
      // page even when Chrome has slowed its timers (hidden tab), which a setInterval poll does not.
      const pageId = url.searchParams.get("page") ?? "";
      const started = Date.now();
      const tick = () => {
        const p = handOut(pageId);
        if (p || Date.now() - started > 25_000 || req.destroyed) json(200, { chainId, account: account ?? null, pending: publicItem(p) });
        else setTimeout(tick, 300);
      };
      tick();
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/info") {
      // polled by attached commands and by `npm run signer`
      json(200, { chainId, rpcUrl, account: account ?? null, atomic, queued: queue.length, signed, persistent: opts.persistent, pid: process.pid, pages: pageReports() });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/item") {
      const id = url.searchParams.get("id") ?? "";
      const queued = queue.find((q) => q.id === id);
      if (queued) queued.polledAt = Date.now();
      const it = results.get(id);
      json(200, it ?? { status: "unknown" });
      return;
    }
    if (req.method === "POST") {
      let body: { account?: Address; atomic?: boolean; id?: string; hash?: Hex; hashes?: Hex[]; error?: string; kind?: ItemKind; tx?: Record<string, unknown>; calls?: BridgeCall[]; label?: string; page?: string; status?: string; hasWallet?: boolean; isMetaMask?: boolean; wallet?: string; busy?: boolean } = {};
      try {
        body = JSON.parse((await readBody(req)) || "{}");
      } catch {
        /* ignore */
      }
      if (url.pathname === "/api/hello" && body.page) {
        // heartbeat + self-report of an open page
        const prev = pages.get(body.page);
        const status = String(body.status ?? "").slice(0, 300);
        const wallet = body.wallet ? String(body.wallet).slice(0, 60) : undefined;
        if (!prev) event(`page ${body.page} open: ${body.hasWallet ? (wallet ? `${wallet} selected` : body.isMetaMask ? "MetaMask present" : "wallet present") : "NO wallet object"}; "${status}"`);
        else if (prev.status !== status) event(`page ${body.page}: "${status}"`);
        pages.set(body.page, { page: body.page, status, hasWallet: !!body.hasWallet, isMetaMask: !!body.isMetaMask, wallet, account: body.account ?? null, error: body.error ? String(body.error).slice(0, 300) : null, busy: !!body.busy, lastSeen: Date.now() });
        json(200, {});
        return;
      }
      if (url.pathname === "/api/connected" && body.account) {
        const changed = account && account.toLowerCase() !== body.account.toLowerCase();
        const first = !account;
        account = body.account;
        atomic = !!body.atomic;
        if (first) {
          resolveAccount(account);
          resolveAtomic(atomic);
          event(`wallet connected ${account}; batching ${atomic ? "available" : "not available"}`);
        } else if (changed) event(`wallet switched to ${account}; batching ${atomic ? "available" : "not available"}`);
        json(200, {});
        return;
      }
      if (url.pathname === "/api/result" && body.id) {
        const p = queue[0];
        if (p && p.id === body.id) {
          queue.shift();
          const hashes = body.hashes ?? (body.hash ? [body.hash] : []);
          if (hashes.length) p.resolve(hashes);
          else p.reject(new Error(body.error || "rejected in the wallet"));
        }
        json(200, {});
        return;
      }
      if (url.pathname === "/api/enqueue" && body.kind && body.label) {
        // from an attached command; the result is collected through /api/item
        const p = enqueue(body.kind, { tx: body.tx, calls: body.calls }, body.label);
        p.catch(() => {});
        // the id is the last queued item's id; the command polls it from now on
        const last = queue[queue.length - 1];
        last.polledAt = Date.now();
        json(200, { id: last.id });
        return;
      }
      if (url.pathname === "/api/stop") {
        json(200, {});
        setTimeout(() => opts.onStop?.(), 50);
        return;
      }
    }
    json(404, { error: "not found" });
  });
  const port = await listen(server, opts.ports);
  const url = `http://127.0.0.1:${port}/?token=${token}`;
  return {
    url,
    port,
    token,
    account: accountPromise,
    atomic: atomicPromise,
    status: () => ({ account, atomic, queued: queue.length, signed }),
    enqueue,
    close: () => {
      for (const p of queue.splice(0)) p.reject(new Error("signer closed"));
      server.close();
      server.closeAllConnections?.();
    },
  };
}

/** Node-side EIP-1193 provider: reads go to the RPC, eth_sendTransaction goes to the browser wallet. */
function makeProvider(chainId: ChainId, rpcUrl: string, accountPromise: Promise<Address>, sendTx: (tx: Record<string, unknown>) => Promise<Hex>): EIP1193Provider {
  const rpc = async (method: string, params: unknown[]) => {
    const r = await fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    const j = (await r.json()) as { result?: unknown; error?: { code: number; message: string; data?: unknown } };
    if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code, data: j.error.data });
    return j.result;
  };
  return {
    request: async ({ method, params }: { method: string; params?: unknown }) => {
      if (method === "eth_chainId") return `0x${chainId.toString(16)}`;
      if (method === "eth_accounts" || method === "eth_requestAccounts") return [await accountPromise];
      if (method === "wallet_switchEthereumChain") return null;
      if (method === "eth_sendTransaction") return sendTx((params as Record<string, unknown>[])[0]);
      return rpc(method, (params as unknown[]) ?? []);
    },
    on: () => {},
    removeListener: () => {},
  } as unknown as EIP1193Provider;
}

const toBridgeCalls = (calls: Array<{ to: Address; data: Hex; value: bigint }>): BridgeCall[] => calls.map((c) => ({ to: c.to, data: c.data, value: `0x${c.value.toString(16)}` as Hex }));

/** Per-command bridge: own server and tab, closed when the command exits. */
export async function startMetaMaskBridge(chainId: ChainId, rpcUrl: string, opts: { openBrowser?: boolean; port?: number } = {}): Promise<MetaMaskBridge> {
  const core = await createBridgeServer(chainId, rpcUrl, { ports: opts.port ? [opts.port] : [DEFAULT_SIGNER_PORT, 0], persistent: false });
  if (opts.openBrowser !== false) openInBrowser(core.url);
  return {
    url: core.url,
    account: core.account,
    atomic: core.atomic,
    provider: makeProvider(chainId, rpcUrl, core.account, (tx) => core.enqueue("tx", { tx }, currentLabel).then((h) => h[0])),
    sendCalls: (calls, label) => core.enqueue("batch", { calls: toBridgeCalls(calls) }, label),
    close: () => core.close(),
  };
}

export interface SignerService {
  url: string;
  port: number;
  account: Promise<Address>;
  atomic: Promise<boolean>;
  status(): { account?: Address; atomic: boolean; queued: number; signed: number };
  close(): void;
}

/** Persistent signer page (`npm run signer`): one server, one tab, discovery file for the commands. */
export async function startSignerService(chainId: ChainId, rpcUrl: string, opts: { port?: number; openBrowser?: boolean; wallet?: string; onEvent?: (line: string) => void; onStop?: () => void } = {}): Promise<SignerService> {
  // one token per installation (next to the discovery file): the page URL stays the same across restarts, so an
  // open tab can reload itself and MetaMask keeps seeing one site
  const tokenFile = signerFilePath().replace(/\.json$/, "") + "-token";
  let token: string | undefined;
  try {
    const t = fs.readFileSync(tokenFile, "utf8").trim();
    if (/^[0-9a-f]{32}$/.test(t)) token = t;
  } catch {
    /* none yet */
  }
  if (!token) {
    token = randomBytes(16).toString("hex");
    fs.writeFileSync(tokenFile, token);
  }
  const core = await createBridgeServer(chainId, rpcUrl, { ports: [opts.port ?? DEFAULT_SIGNER_PORT], persistent: true, token, wallet: opts.wallet, onEvent: opts.onEvent, onStop: opts.onStop });
  const record: SignerRecord = { url: core.url, port: core.port, token: core.token, chainId, rpcUrl, pid: process.pid, startedAt: new Date().toISOString() };
  fs.writeFileSync(signerFilePath(), JSON.stringify(record, null, 2));
  if (opts.openBrowser !== false) openInBrowser(core.url);
  return {
    url: core.url,
    port: core.port,
    account: core.account,
    atomic: core.atomic,
    status: core.status,
    close: () => {
      core.close();
      try {
        const f = signerFilePath();
        if (fs.existsSync(f) && (JSON.parse(fs.readFileSync(f, "utf8")) as SignerRecord).token === core.token) fs.rmSync(f);
      } catch {
        /* ignore */
      }
    },
  };
}

/** The running signer page, if there is one (discovery file present and the server answers with its token). */
export async function findRunningSigner(): Promise<SignerStatus | undefined> {
  const file = signerFilePath();
  if (!fs.existsSync(file)) return undefined;
  let rec: SignerRecord;
  try {
    rec = JSON.parse(fs.readFileSync(file, "utf8")) as SignerRecord;
  } catch {
    return undefined;
  }
  try {
    // `connection: close`: no keep-alive socket left behind, so a short-lived command exits cleanly afterwards
    const r = await fetch(`http://127.0.0.1:${rec.port}/api/info?token=${rec.token}`, { signal: AbortSignal.timeout(2000), headers: { connection: "close" } });
    if (!r.ok) return undefined;
    const j = (await r.json()) as { account: Address | null; atomic: boolean; queued: number; signed: number; chainId: number; pages?: PageReport[] };
    return { ...rec, chainId: j.chainId, account: j.account ?? undefined, atomic: j.atomic, queued: j.queued, signed: j.signed, pages: j.pages ?? [] };
  } catch {
    return undefined;
  }
}

/** Asks the running signer page to exit. Returns false when none is running. */
export async function stopRunningSigner(): Promise<boolean> {
  const s = await findRunningSigner();
  if (!s) return false;
  const r = await fetch(`http://127.0.0.1:${s.port}/api/stop?token=${s.token}`, { method: "POST", headers: { connection: "close" } });
  await r.text(); // consume the reply so the socket is fully closed before the caller ends
  return true;
}

/**
 * Attaches a command to the signer page started by `npm run signer`: its transactions and batches are queued there and
 * confirmed in that one tab. Returns undefined when no page is running (or it serves another chain).
 */
export async function attachToSigner(chainId: ChainId, rpcUrl: string): Promise<MetaMaskBridge | undefined> {
  const s = await findRunningSigner();
  if (!s) return undefined;
  if (s.chainId !== chainId) {
    console.log(`(the signer page serves chain ${s.chainId}, this command uses chain ${chainId}: opening a separate tab)`);
    return undefined;
  }
  const api = (p: string, q = "") => `http://127.0.0.1:${s.port}${p}?token=${s.token}${q}`;
  const getJson = async <T,>(u: string, init?: RequestInit): Promise<T> => {
    const r = await fetch(u, init);
    if (!r.ok) throw new Error(`signer page answered HTTP ${r.status}`);
    return (await r.json()) as T;
  };
  const info = () => getJson<{ account: Address | null; atomic: boolean; pages?: PageReport[] }>(api("/api/info"));
  // what the open signer tab(s) currently show, printed whenever it changes: the human (and the agent reading the
  // terminal) then sees "MetaMask is locked" or "not answering" instead of a silent wait
  let lastShown = "";
  const showPages = (pages?: PageReport[]) => {
    const line = (pages ?? [])
      .filter((p) => p.seenAgo < 60)
      .map((p) => `  signer tab: ${p.status.replace(/\s+/g, " ").slice(0, 220)}`)
      .join("\n");
    if (line && line !== lastShown) {
      console.log(line);
      lastShown = line;
    } else if (!line && lastShown !== "(no tab)") {
      console.log("  signer tab: no open tab is reporting (closed, or the browser is not running)");
      lastShown = "(no tab)";
    }
  };
  const accountPromise = (async () => {
    let i = await info();
    if (!i.account) console.log("Waiting for the wallet to connect in the signer tab...");
    let n = 0;
    while (!i.account) {
      await sleep(1000);
      i = await info();
      if (++n % 5 === 0) showPages(i.pages);
    }
    return i.account;
  })();
  const atomicPromise = accountPromise.then(async () => (await info()).atomic);
  const submit = async (body: { kind: ItemKind; label: string; tx?: Record<string, unknown>; calls?: BridgeCall[] }): Promise<Hex[]> => {
    const { id } = await getJson<{ id: string }>(api("/api/enqueue"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    for (let n = 0; ; n++) {
      await sleep(1000);
      let it: ItemResult | { status: "unknown" };
      try {
        it = await getJson(api("/api/item", `&id=${id}`));
        if (n % 10 === 9) showPages((await info()).pages);
      } catch (e) {
        throw new Error(`the signer page stopped while waiting for "${body.label}" (${(e as Error).message}); start it again with npm run signer`);
      }
      if (it.status === "done") return (it as ItemResult).hashes ?? [];
      if (it.status === "failed") throw new Error((it as ItemResult).error || "rejected in the wallet");
      if (it.status === "unknown") throw new Error(`the signer page was restarted; "${body.label}" was lost`);
    }
  };
  return {
    url: s.url,
    account: accountPromise,
    atomic: atomicPromise,
    provider: makeProvider(chainId, rpcUrl, accountPromise, (tx) => submit({ kind: "tx", tx, label: currentLabel }).then((h) => h[0])),
    sendCalls: (calls, label) => submit({ kind: "batch", calls: toBridgeCalls(calls), label }),
    close: () => {},
    attached: true,
  };
}

function page(chainId: ChainId, persistent: boolean, wallet = ""): string {
  const hexChain = `0x${chainId.toString(16)}`;
  const chainName = CHAIN_NAMES[chainId];
  const preferredWallet = wallet.replace(/[^a-z0-9 ._-]/g, "");
  return `<!doctype html><meta charset="utf-8"><title>Seer liquidity signer</title>
<style>body{font:14px system-ui;margin:2rem;max-width:56rem}#status{padding:.6rem .8rem;border-radius:6px;background:#f4f4f4}#log div{padding:.3rem 0;border-bottom:1px solid #eee}code{font-size:12px;word-break:break-all}.ok{color:#0a7}.err{color:#c33}.wait{color:#a60}#status.wait{background:#fff4e0}#status.err{background:#fde8e8}</style>
<h2>Seer liquidity signer (${chainName})</h2>
<p id="status">Looking for your wallet...</p>
<p><button id="connect" hidden>Connect wallet</button> <button id="notify" hidden>Enable desktop notifications</button></p>
<p id="wallets"></p>
<p>${persistent ? "This tab serves every liquidity command you run while <code>npm run signer</code> is running: each transaction or batch appears here and in your wallet, confirm or reject it there. Keep the tab open; close it after you stop the signer." : "Each transaction or batch the command prepares appears here and in your wallet. Confirm or reject there. Keep this tab open until the command finishes."}</p>
<div id="log"></div>
<script>
const PERSISTENT=${persistent ? "true" : "false"};
const HEX='${hexChain}';
// which installed wallet to use: --wallet / SIGNER_WALLET, else the choice remembered in this browser, else a menu
const WALLET='${preferredWallet}';
let walletName=null;
const W=()=>walletName||(WALLET?WALLET.charAt(0).toUpperCase()+WALLET.slice(1):'your wallet');
// the page keeps its identity across reloads, so an item it took stays with this tab after a reconnect reload
let PAGE=null; try{ PAGE=sessionStorage.getItem('seer-signer-page') }catch(e){}
if(!PAGE){ PAGE=Math.random().toString(16).slice(2,10); try{ sessionStorage.setItem('seer-signer-page',PAGE) }catch(e){} }
const token=new URL(location.href).searchParams.get('token');
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const log=(m,c)=>{const d=document.createElement('div');d.className=c||'';d.innerHTML=m;$('log').prepend(d)};
const setStatus=(m,c)=>{const s=$('status');s.className=c||'';s.innerHTML=m};
const post=(p,b)=>fetch(p+'?token='+token,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const withTimeout=(p,ms,what)=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error(what+' gave no answer within '+Math.round(ms/1000)+' s')),ms))]);
let eth=null, busy=false, account=null, atomic=false, misses=0, signed=0, gone=false, connecting=false, requesting=false, armed=false, polling=false, lastError=null;
// --- getting the human's attention: '+W()+''s own window can open behind other windows
const TITLE=document.title;
function alertUser(text){
  document.title='(!) '+text;
  try{ if(window.Notification&&Notification.permission==='granted'){ const n=new Notification('Seer liquidity signer',{body:text}); n.onclick=()=>{ window.focus(); n.close() } } }catch(e){}
}
function calm(){ document.title=TITLE }
function setupNotify(){
  const b=$('notify');
  if(!window.Notification||Notification.permission!=='default')return;
  b.hidden=false; b.onclick=()=>Notification.requestPermission().then(()=>{ b.hidden=true });
}
// heartbeat: tells the service what this page sees (shown by "npm run signer -- --status") and detects a stopped service
setInterval(async()=>{
  if(gone)return;
  try{
    const r=await post('/api/hello',{page:PAGE,status:$('status').textContent,hasWallet:!!(window.ethereum||discovered.length),isMetaMask:!!(window.ethereum&&window.ethereum.isMetaMask),wallet:walletName,account,error:lastError,busy});
    if(!r.ok)throw new Error('http '+r.status);
    misses=0;
  }catch(e){
    if(++misses>=4){
      gone=true;
      setStatus(PERSISTENT?'The signer service stopped (npm run signer is no longer running). This tab reloads by itself when it is started again.':'The command finished, or the tool was closed. You can close this tab.','err');
      if(PERSISTENT) waitForRestart();
    }
  }
},2000);
function waitForRestart(){
  const iv=setInterval(async()=>{ try{ const r=await fetch('/api/info?token='+token); if(r.ok){ clearInterval(iv); location.reload() } }catch(e){} },3000);
}
// Wallet discovery (EIP-6963): every installed wallet announces itself with a name and an rdns such as io.metamask
// or io.rabby. The preferred one is taken as soon as it announces; with several installed and no preference, the
// page offers a choice (remembered in this browser). A tab opened while the browser or an extension is still
// starting may get nothing at all until reloaded, so: keep looking, reload once after 8 s, explain after 20 s.
const discovered=[];
const walletLabel=d=>(d.info&&d.info.name)||'wallet';
const matchesPref=(d,pref)=>!!pref&&(((d.info&&((d.info.rdns||'')+' '+(d.info.name||'')))||'').toLowerCase().includes(pref));
function renderWallets(current){
  const box=$('wallets'); if(!box)return;
  if(!discovered.length||(discovered.length===1&&current)){ box.innerHTML=''; return }
  box.innerHTML='Wallets in this browser: '+discovered.map(d=>'<button data-w="'+esc((d.info&&(d.info.rdns||d.info.name))||'')+'">'+(current&&d.provider===current?'&#10003; ':'use ')+esc(walletLabel(d))+'</button>').join(' ');
  box.querySelectorAll('button').forEach(b=>b.onclick=()=>{ try{ localStorage.setItem('seer-signer-wallet',b.dataset.w.toLowerCase()) }catch(e){} location.reload() });
}
function findProvider(){
  return new Promise(resolve=>{
    let done=false, asked=false; const b=$('connect');
    let pref=WALLET; if(!pref){ try{ pref=(localStorage.getItem('seer-signer-wallet')||'').toLowerCase() }catch(e){} }
    const finish=(p,d)=>{ if(done||!p)return; done=true; b.hidden=true; walletName=d?walletLabel(d):(p.isRabby?'Rabby Wallet':p.isMetaMask?'MetaMask':'injected wallet'); renderWallets(p); resolve(p) };
    window.addEventListener('eip6963:announceProvider',e=>{
      const d=e.detail; if(!d||!d.provider)return;
      if(discovered.some(x=>x.info&&d.info&&x.info.uuid===d.info.uuid))return;
      discovered.push(d);
      if(pref&&matchesPref(d,pref)) finish(d.provider,d); else renderWallets(done?eth:null);
    });
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    const t0=Date.now();
    let reloaded=false; try{ reloaded=sessionStorage.getItem('seer-signer-reloaded')==='1' }catch(e){}
    const iv=setInterval(()=>{
      if(done){clearInterval(iv);return}
      const waited=Date.now()-t0;
      if(pref){
        const m=discovered.find(d=>matchesPref(d,pref)); if(m){ finish(m.provider,m); return }
        const w=window.ethereum;
        if(w&&((pref==='rabby'&&w.isRabby)||(pref==='metamask'&&w.isMetaMask&&!w.isRabby))){ finish(w,null); return }
      } else {
        if(discovered.length===1){ finish(discovered[0].provider,discovered[0]); return }
        if(discovered.length>1){ if(!asked){ asked=true; setStatus('Several wallets are installed: pick the one to sign with (remembered for next time).','wait'); renderWallets(null) } return }
        if(window.ethereum&&waited>1500){ finish(window.ethereum,null); return }
      }
      if(waited>8000&&!reloaded&&!window.ethereum&&!discovered.length){ reloaded=true; try{ sessionStorage.setItem('seer-signer-reloaded','1') }catch(e){} setStatus('No wallet in this tab yet, reloading once...','wait'); location.reload(); return }
      if(waited>20000&&b.hidden){
        setStatus(pref?('The wallet "'+esc(pref)+'" is not active in this browser (found: '+(discovered.map(walletLabel).join(', ')||'none')+'). Install or enable it, or pick another one below; click its icon in the toolbar to wake it up, then press Reload.'):'No browser wallet is active in this tab. Click the wallet icon in the browser toolbar (that wakes the extension; unlock it if it asks), then press Reload here.','err');
        b.textContent='Reload'; b.onclick=()=>location.reload(); b.hidden=false;
        renderWallets(null);
      }
    },250);
  });
}
async function ensureChain(){
  try{await eth.request({method:'wallet_switchEthereumChain',params:[{chainId:HEX}]})}
  catch(e){ if(e&&e.code===4902){await eth.request({method:'wallet_addEthereumChain',params:[{chainId:HEX,chainName:'${chainName}',nativeCurrency:{name:'${NATIVE_SYMBOL[chainId]}',symbol:'${NATIVE_SYMBOL[chainId].toUpperCase()}',decimals:18},rpcUrls:['${DEFAULT_RPC[chainId]}'],blockExplorerUrls:['https://gnosisscan.io']}]})} else throw e }
}
// atomic: the wallet executes a batch as one transaction (MetaMask smart account). batchable: the wallet at least
// accepts call batches (EIP-5792) and runs them in order, e.g. Rabby; then a batch is sent with atomicRequired:false.
let batchable=false;
async function checkAtomic(){
  try{
    const caps=await eth.request({method:'wallet_getCapabilities',params:[account,[HEX]]});
    const st=caps&&caps[HEX]&&caps[HEX].atomic&&caps[HEX].atomic.status;
    atomic=(st==='supported'||st==='ready');
    batchable=atomic||!!(caps&&caps[HEX]&&typeof caps[HEX]==='object');
  }catch(e){ atomic=false; batchable=false }
}
function idle(){
  if(gone)return;
  calm();
  setStatus('Connected <code>'+account+'</code> with <b>'+esc(W())+'</b> on ${chainName}. Batching: <b>'+(atomic?'atomic (one confirmation per batch)':batchable?'call batches in order (the wallet decides how many confirmations)':'not available (one confirmation per transaction, position-manager calls bundled)')+'</b>.<br>'+(PERSISTENT?'Idle, waiting for the next command ('+signed+' signed in this session). Keep this tab open.':'Waiting for the command...'),'ok');
}
// --- '+W()+' not answering: it is asleep (background process stopped) or locked and holding our requests until the
// unlock. A page cannot open the extension, but it can send the one request that opens '+W()+''s unlock window,
// alert the human, and reconnect by reloading (a reload gives the tab a fresh link to the extension).
let noAnswerSince=0, wakeAsked=false;
function reloadCount(){ try{ return Number(sessionStorage.getItem('seer-signer-reconnects')||'0') }catch(e){ return 0 } }
function unresponsive(){
  const now=Date.now(); if(!noAnswerSince) noAnswerSince=now;
  const secs=Math.round((now-noAnswerSince)/1000);
  lastError=''+W()+' did not answer for '+secs+' s';
  if(!wakeAsked){
    wakeAsked=true;
    try{ eth.request({method:'eth_requestAccounts'}).then(a=>{ if(a&&a.length&&!account) connected(a).catch(()=>{}) }).catch(()=>{}) }catch(e){}
    alertUser('Open '+W()+' (click its icon) and unlock it');
  }
  const n=reloadCount();
  if(secs>45&&n<2){
    try{ sessionStorage.setItem('seer-signer-reconnects',String(n+1)) }catch(e){}
    setStatus(''+W()+' is still not answering. Reloading this tab to reconnect ('+(n+1)+'/2)...','wait');
    setTimeout(()=>location.reload(),800);
    return;
  }
  setStatus('<span class="err">'+W()+' is not answering this tab</span> ('+secs+' s): it is asleep or locked. <b>Click the '+W()+' icon in the browser toolbar and enter your password if it asks.</b> This page continues by itself as soon as '+W()+' answers.'+(n>=2?' If nothing changes, press Reload.':''),'err');
  if(n>=2){ const b=$('connect'); b.textContent='Reload'; b.onclick=()=>{ try{ sessionStorage.removeItem('seer-signer-reconnects') }catch(e){} location.reload() }; b.hidden=false }
}
function answered(){ noAnswerSince=0; wakeAsked=false }
// A wallet's background process can take several seconds to wake after the browser suspends it (Rabby on Chrome
// does this about 30 s after its last request). A short probe timeout reads that slow wake-up as a dead link and
// sends nothing; 15 s covers a cold start, and a link that is really dead still ends in a reload.
async function metamaskAlive(){
  try{ await withTimeout(eth.request({method:'eth_chainId'}),15000,''+W()+''); answered(); return true }
  catch(e){ if(e&&/no answer/.test(e.message)) return false; return true }
}
// no prompt: answers with the account as soon as '+W()+' is unlocked and this page is allowed
async function silentAccounts(){
  try{ const a=(await withTimeout(eth.request({method:'eth_accounts'}),15000,''+W()+''))||[]; answered(); return a }
  catch(e){ if(e&&/no answer/.test(e.message)) unresponsive(); else lastError=(e&&e.message)||String(e); return [] }
}
function showConnect(msg){ setStatus(msg,'wait'); $('connect').hidden=false }
async function connected(accs){
  if(account)return;
  account=accs[0]; // claims the connection, so a parallel attempt stops here
  try{ sessionStorage.removeItem('seer-signer-reloaded'); sessionStorage.removeItem('seer-signer-reconnects') }catch(e){}
  try{
    await ensureChain();
    await checkAtomic();
    await post('/api/connected',{account,atomic:batchable});
  }catch(e){ account=null; throw e }
  $('connect').hidden=true;
  answered();
  idle();
  startPolling();
}
const describe=e=>{ const code=e&&e.code, msg=(e&&e.message)||String(e); lastError=(code!==undefined?code+': ':'')+msg; return code===4001?'Connection refused in '+W()+'. Press Connect to try again.':code===-32002?''+W()+' already shows a pending request: open '+W()+' (its icon in the browser) and approve it there.':''+W()+' did not connect ('+esc(msg)+'). Unlock '+W()+', then press Connect. (This page also retries by itself every few seconds.)' };
// A silent check (eth_accounts, no prompt) runs first and keeps running every few seconds, even while an interactive
// request hangs in a locked or still-starting '+W()+': once the wallet is unlocked, the silent check connects.
async function tryConnect(interactive){
  if(account||!eth)return;
  if(!connecting){
    connecting=true;
    try{ const accs=await silentAccounts(); if(accs.length){ await connected(accs); return } }
    catch(e){ if(!account) showConnect(describe(e)) }
    finally{ connecting=false }
  }
  if(!interactive||requesting||account||noAnswerSince)return;
  requesting=true;
  setStatus('Waiting for '+W()+': unlock it with your password if it asks, then approve the connection...','wait');
  try{
    const accs=await withTimeout(eth.request({method:'eth_requestAccounts'}),90000,''+W()+'');
    if(account)return;
    if(accs&&accs.length) await connected(accs);
    else showConnect(''+W()+' is locked or not connected to this page. Click the '+W()+' icon in your browser, enter your password, then press Connect. (This page also retries by itself every few seconds.)');
  }catch(e){ if(!account) showConnect(describe(e)) }
  finally{ requesting=false }
}
// after an unlock '+W()+' answers eth_accounts without any prompt: retry on wallet events, on focus, and every few seconds
function armAutoRetry(){
  if(armed)return; armed=true;
  if(eth.on){
    eth.on('accountsChanged',async a=>{
      if(!account){ if(a&&a.length) tryConnect(false); return }
      if(!a||!a.length)return;
      account=a[0]; await checkAtomic(); try{await post('/api/connected',{account,atomic:batchable})}catch(e){}
      log('Wallet switched to <code>'+account+'</code>'); if(!busy)idle();
    });
  }
  document.addEventListener('visibilitychange',()=>{ if(!account&&document.visibilityState==='visible') tryConnect(false) });
  window.addEventListener('focus',()=>{ if(!account) tryConnect(false) });
  setInterval(()=>{ if(!account) tryConnect(false) },3000);
}
// A locked '+W()+' rejects a batch request at once without opening any window ("controller is locked"). So before
// sending: if '+W()+' says it is locked, ask for accounts, which opens the unlock window, and wait for the unlock.
const isLockedError=e=>/locked/i.test((e&&e.message)||String(e));
// '+W()+' still lists the connected account while locked, so ask its own isUnlocked() where available
// true = unlocked, false = the wallet SAID it is locked, null = the wallet gave no answer in time. Only a definite
// "locked" holds the transaction back. A wallet that merely does not answer is not known to be locked, and sending
// anyway is safe: a locked wallet either opens its own unlock window in front of the request, or rejects it with a
// "locked" error that work() catches and retries after the unlock. Waiting here instead meant a slow wallet was
// shown as locked and the transaction was never sent at all.
async function isUnlocked(){
  if(eth._metamask&&eth._metamask.isUnlocked){
    try{ return !!(await withTimeout(eth._metamask.isUnlocked(),15000,''+W()+'')) }
    catch(e){ if(e&&/no answer/.test(e.message)) return null }
  }
  try{ const a=(await withTimeout(eth.request({method:'eth_accounts'}),15000,''+W()+''))||[]; answered(); return a.length>0 }
  catch(e){ if(e&&/no answer/.test(e.message)) return null; lastError=(e&&e.message)||String(e); return false }
}
async function ensureUnlocked(){
  if((await isUnlocked())!==false) return true;
  setStatus('<span class="wait">'+W()+' is locked: enter your password in the '+W()+' window</span> (no window? click the '+W()+' icon in the toolbar)...','wait');
  alertUser('Unlock '+W()+'');
  try{ eth.request({method:'eth_requestAccounts'}).catch(()=>{}) }catch(e){} // opens the unlock screen
  for(let i=0;i<200;i++){ await sleep(3000); if((await isUnlocked())!==false) return true }
  return false;
}
async function work(p){
  busy=true;
  setStatus('<span class="wait">Confirm in '+W()+':</span> '+esc(p.label),'wait');
  if(!(await metamaskAlive())){
    // nothing sent yet: wake / reconnect first, the item stays with this tab and is retried
    unresponsive();
    for(let i=0;i<20&&!(await metamaskAlive());i++){ unresponsive(); await sleep(3000) }
    if(!(await metamaskAlive())){ busy=false; return }
    answered();
  }
  if(!(await ensureUnlocked())){ busy=false; idle(); return } // still locked: the item stays queued for a later try
  setStatus('<span class="wait">Confirm in '+W()+':</span> '+esc(p.label),'wait');
  alertUser('Confirm in '+W()+': '+p.label.slice(0,60));
  const hint=setTimeout(()=>{ if(busy) setStatus('<span class="wait">Waiting for your confirmation in '+W()+':</span> '+esc(p.label)+'<br><b>No '+W()+' window?</b> Click the '+W()+' icon in the browser toolbar (it shows a badge): the request is waiting there.','wait') },5000);
  // '+W()+' refuses a new batch while it still holds an earlier unapproved one from this page ("Batch ID already
  // exists"): tell the human to confirm or reject that one in '+W()+', and retry until this one is accepted.
  for(let attempt=0;;attempt++){
    try{
      await ensureChain();
      if(p.kind==='batch'){
        if(!attempt) log('<span class="wait">Waiting for your confirmation of a batch of '+p.calls.length+' calls:</span> '+esc(p.label),'wait');
        // a fresh id per attempt: a retry must not be refused as a duplicate of an earlier copy
        const batchId='0x'+Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join('');
        const sent=await eth.request({method:'wallet_sendCalls',params:[{version:'2.0.0',id:batchId,from:account,chainId:HEX,atomicRequired:atomic,calls:p.calls}]});
        const id=(typeof sent==='string')?sent:sent.id;
        let st;
        for(let i=0;i<300;i++){ st=await eth.request({method:'wallet_getCallsStatus',params:[id]}); if(st&&st.status>=200)break; await sleep(2000) }
        // A wallet sometimes reports a non-200 status for a batch that did land (a replaced or sped-up transaction,
        // for instance). Trust the receipts: only fail when none of them succeeded.
        const ok=(st&&st.receipts||[]).filter(r=>r&&(r.status==='1'||r.status===1||r.status==='0x1'));
        if((!st||st.status!==200)&&!ok.length) throw new Error('batch failed with status '+(st&&st.status));
        if(st&&st.status!==200) log('<span class="wait">The wallet reported status '+st.status+' but the transaction succeeded on chain.</span>','wait');
        const hashes=(st.status===200?(st.receipts||[]):ok).map(r=>r.transactionHash);
        await post('/api/result',{id:p.id,hashes});
        log('<span class="ok">Batch executed</span> '+esc(p.label)+'<br><code>'+hashes.join(', ')+'</code>','ok');
      } else {
        if(!attempt) log('<span class="wait">Waiting for your confirmation:</span> '+esc(p.label)+'<br><code>to '+esc(p.tx.to)+'</code>','wait');
        const hash=await eth.request({method:'eth_sendTransaction',params:[p.tx]});
        await post('/api/result',{id:p.id,hash});
        log('<span class="ok">Sent</span> '+esc(p.label)+'<br><code>'+hash+'</code>','ok');
      }
      signed++;
      break;
    } catch(e){
      const msg=(e&&e.message)||String(e); lastError=msg;
      if(isLockedError(e)){
        // locked after all ('+W()+' auto-locked meanwhile): keep the item, wait for the unlock, then retry it
        log('<span class="wait">'+W()+' was locked</span> when "'+esc(p.label)+'" was sent; unlock it, the request is retried.','wait');
        if(await ensureUnlocked()) continue;
      } else if(/already exists/i.test(msg)&&attempt<120){
        if(!attempt) log('<span class="wait">'+W()+' still holds an earlier request</span> and refuses a new one until it is dealt with.','wait');
        setStatus('<span class="err">'+W()+' still holds an earlier request from this page.</span> <b>Open '+W()+' (its icon in the toolbar) and confirm or reject the request it shows.</b> This one ("'+esc(p.label.slice(0,80))+'...") is retried by itself every 6 s.','err');
        alertUser('Open '+W()+': confirm or reject the earlier request');
        await sleep(6000);
        continue;
      }
      try{await post('/api/result',{id:p.id,error:msg})}catch(x){}
      log('<span class="err">Rejected / failed</span> '+esc(p.label)+': '+esc(msg),'err');
      break;
    }
  }
  clearTimeout(hint);
  busy=false; idle();
}
// Items arrive through a long poll (the server answers when there is work): a network reply wakes this tab even
// when Chrome slows the timers of a hidden tab to once a minute.
async function startPolling(){
  if(polling)return; polling=true;
  while(!gone){
    let s=null;
    try{ const r=await fetch('/api/wait?token='+token+'&page='+PAGE); if(!r.ok)throw new Error('http '+r.status); s=await r.json() }
    catch(e){ await sleep(2000); continue }
    if(s&&s.pending&&!busy) await work(s.pending);
  }
}
// keep '+W()+''s background worker warm while idle and notice early when it stops answering
setInterval(async()=>{ if(eth&&account&&!busy&&!gone){ if(await metamaskAlive()){ if(noAnswerSince){ answered(); idle() } } else unresponsive() } },20000);
async function main(){
  setupNotify();
  eth=await findProvider();
  const b=$('connect'); b.textContent='Connect '+W()+''; b.hidden=true; b.onclick=()=>tryConnect(true);
  armAutoRetry();
  await tryConnect(true);
}
main().catch(e=>setStatus('Error: '+esc((e&&e.message)||e),'err'));
</script>`;
}
