// Adaptador local: MusicBrainz exige identificação da aplicação no User-Agent.
let queue = Promise.resolve(),
  last = 0;
const cache = new Map();
let pending = 0;

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
export async function musicProxy(req, res, url) {
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
  let entry = cache.get(key);
  if (!entry || Date.now() - entry.time > 3600000) {
    if (pending >= 8) {
      res.writeHead(503, { "Retry-After": "5" });
      res.end("Catálogo musical ocupado");
      return true;
    }
    pending++;
    const task = queue
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
          entry = { body: JSON.stringify({ error: "Consulta musical indisponível." }), status: response.status };
          return;
        }
        const body = await boundedJson(response);
        if (response.ok) {
          entry = { time: Date.now(), body, status: response.status };
          cache.set(key, entry);
          if (cache.size > 100) cache.delete(cache.keys().next().value);
        } else entry = { body, status: response.status };
      }).finally(() => { pending--; });
    queue = task;
    try {
      await task;
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
