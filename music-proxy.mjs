// Adaptador local: MusicBrainz exige identificação da aplicação no User-Agent.
let queue = Promise.resolve(),
  last = 0;
const cache = new Map();
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
    const task = queue
      .catch(() => {})
      .then(async () => {
        const delay = 1100 - (Date.now() - last);
        if (delay > 0)
          await new Promise((resolve) => setTimeout(resolve, delay));
        last = Date.now();
        const response = await fetch(target, {
          headers: {
            "User-Agent":
              "MinhaEstante/1.0 (personal local catalog; http://127.0.0.1:4173)",
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(20000),
        });
        const body = await response.text();
        if (response.ok) {
          entry = { time: Date.now(), body, status: response.status };
          cache.set(key, entry);
          if (cache.size > 100) cache.delete(cache.keys().next().value);
        } else entry = { body, status: response.status };
      });
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
    "Cache-Control": "no-store",
  });
  res.end(entry.body);
  return true;
}
