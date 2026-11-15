import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
