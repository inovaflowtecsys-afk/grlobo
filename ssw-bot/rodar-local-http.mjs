import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("./.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] ??= m[2];
}
process.env.PORT ??= "3101";
process.env.BOT_TOKEN ??= "local";
await import("./server-http.mjs");
