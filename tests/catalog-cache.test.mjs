import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { booksProxy } from "../books-proxy.mjs";

test("MusicBrainz compartilha buscas simultâneas e lê cache depois do reinício", async t => {
  const dir = await mkdtemp(join(tmpdir(), "minhaestante-catalog-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { musicProxy } = await import("../music-proxy.mjs?first");
  const upstream = t.mock.method(globalThis, "fetch", async (target, options) => {
    assert.equal(target.origin, "https://musicbrainz.org");
    assert.equal(options.redirect, "error");
    return Response.json({ releases: [{ title: "Álbum de teste" }] });
  });
  async function request(proxy) {
    const url = new URL("http://localhost/catalog-api/musicbrainz?resource=release&query=teste");
    const response = { writeHead(status) { this.status = status; }, end(body) { this.body = body; } };
    await proxy({ method: "GET" }, response, url, dir);
    assert.equal(response.status, 200);
    return JSON.parse(response.body);
  }
  const results = await Promise.all([request(musicProxy), request(musicProxy)]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(upstream.mock.callCount(), 1);
  assert.equal((await readdir(dir)).length, 1);
  const { musicProxy: restarted } = await import("../music-proxy.mjs?restart");
  assert.deepEqual(await request(restarted), results[0]);
  assert.equal(upstream.mock.callCount(), 1);
});

test("Open Library valida destino, compartilha a consulta e lê o cache persistente", async t => {
  const dir = await mkdtemp(join(tmpdir(), "minhaestante-books-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const upstream = t.mock.method(globalThis, "fetch", async (target, options) => {
    assert.equal(target.origin, "https://openlibrary.org");
    assert.equal(target.pathname, "/search.json");
    assert.equal(target.searchParams.get("title"), "Duna");
    assert.equal(options.redirect, "error");
    return Response.json({ docs: [{ title: "Duna" }] });
  });
  async function request(query) {
    const url = new URL("http://localhost/catalog-api/openlibrary?" + query);
    const result = { writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = body; } };
    await booksProxy({ method: "GET" }, result, url, dir);
    return result;
  }
  assert.equal((await request("resource=https://127.0.0.1")).status, 400);
  const query = "resource=/search.json&type=title&query=Duna";
  const results = await Promise.all([request(query), request(query)]);
  assert.equal(results[0].status, 200);
  assert.equal(results[0].body, results[1].body);
  assert.equal(upstream.mock.callCount(), 1);
  assert.equal((await request(query)).headers["X-Catalog-Cache"], "hit");
});
