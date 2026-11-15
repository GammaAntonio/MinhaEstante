import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Adaptador local: MusicBrainz exige identificação da aplicação no User-Agent.
let queue = Promise.resolve(),
  last = 0;
const cache = new Map();
const inFlight = new Map();
const ttl = 3_600_000;
let pending = 0;

async function readCached(file) {
  if (!file) return null;
  try {
    const info = await stat(file);
    if (Date.now() - info.mtimeMs >= ttl || info.size > 524288) return null;
    return { body: JSON.stringify(JSON.parse(await readFile(file, "utf8"))), status: 200, time: info.mtimeMs };
  } catch { return null; }
}

async function persist(dir, file, body) {
  const temporary = file + "." + randomUUID() + ".tmp";
  try {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeFile(temporary, body, { mode: 0o600, flag: "wx" });
    await rename(temporary, file);
    const names = (await readdir(dir)).filter(name => /^[a-f0-9]{64}\.json$/.test(name));
    const entries = await Promise.all(names.map(async name => {
      const item = join(dir, name);
      return [item, (await stat(item)).mtimeMs];
    }));
    entries.sort((a, b) => b[1] - a[1]);
    await Promise.all(entries.slice(48).map(([item]) => unlink(item)));
  } catch { await unlink(temporary).catch(() => {}); }
}

async function boundedJson(response) {
  if (!response.ok || !response.headers.get("content-type")?.startsWith("application/json")) {
    await response.body?.cancel();
    throw new Error("Resposta inválida do catálogo");
  }
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 512 * 1024) throw new Error("Resposta do catálogo excede o limite");
      chunks.push(value);
    }
    return JSON.stringify(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export async function musicProxy(req, res, url, cacheDir) {
  if (url.pathname !== "/catalog-api/musicbrainz") return false;
  const resource = url.searchParams.get("resource") || "";
  if (
    req.method !== "GET" ||
    !/^(release-group|release)(\/[a-f0-9-]{36})?$/.test(resource)
  ) {
    res.writeHead(400);
    res.end("Consulta musical inválida");
    return true;
  }
  const target = new URL(`https://musicbrainz.org/ws/2/${resource}`);
  for (const key of ["query", "limit", "offset", "inc", "release-group"]) {
    const value = url.searchParams.get(key);
    if (value) target.searchParams.set(key, value.slice(0, 500));
  }
  target.searchParams.set("fmt", "json");
  const key = target.href;
  const file = cacheDir && join(cacheDir, createHash("sha256").update(key).digest("hex") + ".json");
  let entry = cache.get(key);
  if (!entry || Date.now() - entry.time >= ttl) {
    entry = await readCached(file);
  }
  if (!entry) {
    let task = inFlight.get(key);
    if (!task && pending >= 8) {
      res.writeHead(503, { "Retry-After": "5" });
      res.end("Catálogo musical ocupado");
      return true;
    }
    if (!task) {
      pending++;
      task = queue
        .catch(() => {})
        .then(async () => {
          const delay = 1100 - (Date.now() - last);
          if (delay > 0)
            await new Promise((resolve) => setTimeout(resolve, delay));
          last = Date.now();
          const response = await fetch(target, {
            redirect: "error",
            headers: {
              "User-Agent":
                "MinhaEstante/1.0 (personal local catalog; http://127.0.0.1:4173)",
              Accept: "application/json",
            },
            signal: AbortSignal.timeout(20000),
          });
          if (!response.ok) {
            await response.body?.cancel();
            return { body: JSON.stringify({ error: "Consulta musical indisponível." }), status: response.status };
          }
          const body = await boundedJson(response);
          const result = { time: Date.now(), body, status: response.status };
          cache.set(key, result);
          if (cache.size > 20) cache.delete(cache.keys().next().value);
          if (file && Buffer.byteLength(body) <= 524288) await persist(cacheDir, file, body);
          return result;
        }).finally(() => { pending--; inFlight.delete(key); });
      queue = task;
      inFlight.set(key, task);
    }
    try {
      entry = await task;
    } catch {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ error: "MusicBrainz indisponível. Tente novamente." }),
      );
      return true;
    }
  }
  res.writeHead(entry.status, {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  });
  res.end(entry.body);
  return true;
}
