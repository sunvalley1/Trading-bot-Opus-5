/** Tiny argv parser: `--key value`, `--flag`, and positional args. */
export interface Args {
  _: string[];
  [key: string]: string | boolean | string[] | undefined;
}

export function parseArgs(argv: string[]): Args & { chain?: string; rpc?: string } {
  const out: Args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out as Args & { chain?: string; rpc?: string };
}
