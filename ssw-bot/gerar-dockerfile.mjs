// Gera Dockerfile.inline (node:20-alpine + bot em base64) para colar no EasyPanel > Source > Dockerfile.
// Uso: node gerar-dockerfile.mjs
import { readFileSync, writeFileSync } from "node:fs";
const src = readFileSync(new URL("./server-http.mjs", import.meta.url), "utf8")
  .split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join("\n");
const b64 = Buffer.from(src, "utf8").toString("base64");
const df = `FROM node:20-alpine
WORKDIR /app
RUN echo '${b64}' | base64 -d > server-http.mjs
ENV NODE_ENV=production PORT=80
EXPOSE 80
CMD ["node", "server-http.mjs"]
`;
writeFileSync(new URL("./Dockerfile.inline", import.meta.url), df);
console.log("Dockerfile.inline gerado:", df.length, "caracteres");
