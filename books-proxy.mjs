import { createHash } from "node:crypto";
import { join } from "node:path";
import { boundedJson, persist, readCached } from "./music-proxy.mjs";

const origin = "https://openlibrary.org";
const fields = "key,title,subtitle,author_name,first_publish_year,cover_i,edition_key,edition_count,isbn,language,subject,publisher,number_of_pages_median";
const inFlight = new Map();
let queue = Promise.resolve();
let lastRequest = 0;

function targetFor(params) {
  const resource = params.get("resource");
  if (/^\/(?:works\/OL\d+W(?:\/editions)?|authors\/OL\d+A)\.json$/.test(resource || "")) {
    const target = new URL(resource, origin);
    if (resource.endsWith("/editions.json")) target.searchParams.set("limit", "8");
    return target;
  }
  const type = params.get("type");
  const query = params.get("query")?.trim();
  const page = Number(params.get("page") || 1);
  const limit = Number(params.get("limit") || 20);
  if (resource !== "/search.json" || !["q", "title", "author", "isbn"].includes(type) ||
      !query || query.length > 200 || !Number.isInteger(page) || page < 1 || page > 1000 ||
      !Number.isInteger(limit) || limit < 1 || limit > 30) return null;
  const target = new URL(resource, origin);
  target.search = new URLSearchParams({ [type]: query, limit, page, lang: "pt", fields });
  return target;
}

export async function booksProxy(req, res, url, cacheDir) {
  if (url.pathname !== "/catalog-api/openlibrary") return false;
  const reply = (status, body, state) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Catalog-Cache": state });
    res.end(body);
  };
  const target = req.method === "GET" && targetFor(url.searchParams);
  if (!target) {
    reply(400, JSON.stringify({ error: "Consulta de livros inválida." }), "invalid");
    return true;
  }
  const key = target.href;
  const file = join(cacheDir, createHash("sha256").update(key).digest("hex") + ".json");
  const cached = await readCached(file);
  if (cached) {
    reply(200, cached.body, "hit");
    return true;
  }
  let task = inFlight.get(key);
  if (!task && inFlight.size >= 4) {
    reply(503, JSON.stringify({ error: "A busca está ocupada. Tente de novo em instantes." }), "busy");
    return true;
  }
  if (!task) {
    task = queue.catch(() => {}).then(async () => {
      const delay = 1100 - (Date.now() - lastRequest);
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
      lastRequest = Date.now();
      const contact = process.env.OPENLIBRARY_CONTACT;
      const response = await fetch(target, { redirect: "error", signal: AbortSignal.timeout(8500),
        headers: { Accept: "application/json", "User-Agent": `MinhaEstante/1.0 (${contact || "https://147-15-126-191.sslip.io/"})` } });
      const body = await boundedJson(response);
      await persist(cacheDir, file, body);
      return body;
    }).finally(() => inFlight.delete(key));
    inFlight.set(key, task);
    queue = task;
  }
  try { reply(200, await task, "miss"); }
  catch { reply(502, JSON.stringify({ error: "A Open Library está indisponível no momento." }), "error"); }
  return true;
}
