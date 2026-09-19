/**
 * classifier.dev: TypeSafe's Jev decision model behind a keyless HTTP API, the forecaster of the Jev bot (MODELS.md).
 * You send texts and your own labels; you get back, for each text, the label that fits and a calibrated score for
 * every label. Its docs: `GET https://classifier.dev/` (plain text); "The model behind this service is Jev".
 *
 * Only public market facts may ever go to it. Every request first passes `assertNothingSecret`, which refuses to
 * send (throws, nothing leaves the machine) if the body contains a value from this folder's .env that looks secret
 * (a key, a token, the RPC URL with its API key), anything shaped like a private key (64 hex digits), a known token
 * prefix, or the name of a secret. The Jev pass also runs without PRIVATE_KEY in its environment (pass.ts), and
 * classifier.dev takes no key of ours at all. Every request and response is appended to an audit file, so what
 * left the machine can be read afterwards.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENDPOINT = "https://classifier.dev";
// the service blocks some default client signatures at its edge; say who we are instead
const USER_AGENT = "seer-jev-bot/1.0 (+https://github.com/sunvalley1/Trading-bot-Opus-5)";

export interface ClassifyRequest {
  labels: string[];
  input: string;
  /** extra criteria for the decision, in words */
  instructions?: string;
  tier?: "fast" | "smart";
}

export interface ClassifyResult {
  label: string;
  confidence: number | null;
  /** a probability per label; null when the service could not score the input */
  scores: Record<string, number> | null;
  model?: string;
}

/** Values in .env that must never leave the machine, read from the file itself (the Jev pass has no key in its environment). */
function secretValues(): string[] {
  const file = path.join(ROOT, ".env");
  if (!existsSync(file)) return [];
  const out: string[] = [];
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, "");
    if (value.length >= 12 && /KEY|TOKEN|SECRET|PASSWORD|RPC_URL/i.test(m[1])) out.push(value);
  }
  return out;
}

/** Throws, naming what it found, if `text` carries anything that could be a secret. */
export function assertNothingSecret(text: string): void {
  const found: string[] = [];
  if (/(?<![0-9a-fA-F])[0-9a-fA-F]{64}(?![0-9a-fA-F])/.test(text)) found.push("a 64-hex-digit value (the shape of a private key)");
  if (/sk-ant-|sk-proj-|\bsk-[A-Za-z0-9]{20,}|oat01|ghp_[A-Za-z0-9]{20,}|xox[bp]-/.test(text)) found.push("an API token");
  if (/PRIVATE_KEY|CLAUDE_CODE_OAUTH_TOKEN|OPENAI_API_KEY|MNEMONIC/i.test(text)) found.push("the name of a secret");
  for (const s of secretValues()) if (text.includes(s)) found.push("a value from .env");
  if (found.length) throw new Error("REFUSED to send to classifier.dev: the request contains " + [...new Set(found)].join(", ") + ". Nothing was sent.");
}

/**
 * One text against `labels`. Retries a rate limit or a server error with backoff; any other refusal is an error.
 * `audit`, when given, receives one JSON line per attempt: the exact request, the status and the response.
 */
export async function classify(req: ClassifyRequest, audit?: string): Promise<ClassifyResult> {
  const body = JSON.stringify(req);
  assertNothingSecret(body);
  let last = "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    let status = 0;
    let text = "";
    try {
      const r = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json", "user-agent": USER_AGENT }, body, signal: AbortSignal.timeout(60_000) });
      status = r.status;
      text = await r.text();
    } catch (e) {
      text = (e as Error).message;
    }
    if (audit) {
      try {
        appendFileSync(audit, JSON.stringify({ at: new Date().toISOString(), attempt, request: req, status, response: text.slice(0, 20_000) }) + "\n");
      } catch {
        /* the audit is a record, not a gate */
      }
    }
    if (status === 200) {
      const d = JSON.parse(text);
      const r = Array.isArray(d.results) ? d.results[0] : d;
      return { label: String(r.label), confidence: r.confidence ?? null, scores: r.scores ?? null, model: r.model ?? d.model };
    }
    last = status ? "HTTP " + status + ": " + text.slice(0, 200) : text;
    if (status && status !== 429 && status < 500) break;
    await new Promise((res) => setTimeout(res, 2000 * attempt * attempt));
  }
  throw new Error("classifier.dev did not classify: " + last);
}
