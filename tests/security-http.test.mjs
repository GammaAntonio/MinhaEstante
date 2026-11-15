import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { newSessionToken, sessionTokenDigest } from "../auth.mjs";
import { createRepository } from "../database/repositories/persistence.mjs";

test("servidor entrega os assets públicos e protege arquivos internos e mutações de outra origem", {
  skip: process.env.MINHAESTANTE_TEST_DB !== "1",
  timeout: 60_000,
}, async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "minhaestante-http-"));
  const server = spawn(process.execPath, ["server.mjs"], {
    env: { ...process.env, PORT: "0", RESEND_API_KEY: "", MINHAESTANTE_DATA_DIR: dataDir },
  });
  t.after(async () => {
    server.kill();
    await rm(dataDir, { recursive: true, force: true, maxRetries: 3 });
  });
  const [output] = await Promise.race([
    once(server.stdout, "data"),
    once(server, "exit").then(([code]) => { throw new Error("Servidor encerrou: " + code); }),
  ]);
  const base = String(output).trim().match(/http:\/\/127\.0\.0\.1:\d+/)[0];

  await t.test("assets públicos continuam acessíveis", async () => {
    for (const name of ["/", "/app.js?v=1", "/collection.css", "/favicon.svg"]) {
      assert.equal((await fetch(base + name)).status, 200, name);
    }
  });

  await t.test("ETag responde 304 e APIs continuam fora do cache", async () => {
    const first = await fetch(base + "/styles.css");
    assert.match(first.headers.get("etag"), /^W\//);
    const etag = first.headers.get("etag");
    await first.text();
    const same = await fetch(base + "/styles.css", { headers: { "If-None-Match": etag } });
    assert.equal(same.status, 304);
    assert.equal(await same.text(), "");
    const account = await fetch(base + "/api/account", { headers: { "If-None-Match": etag } });
    assert.equal(account.status, 401);
    assert.equal(account.headers.get("cache-control"), "no-store");
  });

  await t.test("código do servidor e lockfile não são publicados", async () => {
    for (const name of ["/server.mjs", "/package-lock.json", "/tests/auth.test.mjs"]) {
      assert.equal((await fetch(base + name)).status, 404, name);
    }
  });

  await t.test("diretório inicial publica somente informações usadas na home", async () => {
    const response = await fetch(base + "/api/persistence/home-directory");
    assert.equal(response.status, 200);
    const { users } = await response.json();
    assert.ok(users.length > 0);
    for (const user of users) {
      assert.deepEqual(Object.keys(user).sort(), ["id", "isCreator", "page", "posts", "role", "username"]);
      assert.deepEqual(Object.keys(user.page).sort(), ["displayName", "title"]);
      assert.ok(user.posts.length <= 1);
    }
  });

  await t.test("logout cross-origin é recusado antes de emitir cookie", async () => {
    const response = await fetch(base + "/api/auth/logout", {
      method: "POST",
      headers: { Origin: "https://other.example", "Sec-Fetch-Site": "cross-site" },
    });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("set-cookie"), null);
  });

  await t.test("logout HTTPS usa cookie Secure e HTTP local continua suportado", async () => {
    for (const proto of ["https", "http"]) {
      const response = await fetch(base + "/api/auth/logout", {
        method: "POST",
        headers: { "X-Forwarded-Proto": proto },
      });
      assert.equal(response.status, 200);
      assert.equal(/; Secure\b/.test(response.headers.get("set-cookie")), proto === "https");
    }
  });

  await t.test("exportação é privada e troca de senha exige a senha atual", async (accountTest) => {
    const username = "reg-" + randomUUID().slice(0, 12);
    const second = username + "-b";
    const repository = createRepository();
    try {
      const json = (route, body, cookie = "") => fetch(base + route, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify(body),
      });
      const anonymous = await fetch(base + "/api/account/export");
      assert.equal(anonymous.status, 401);
      await anonymous.text();
      const created = await json("/api/auth/register", {
        username, fullName: "Conta Teste", birthDate: "1990-04-01",
        email: username + "@example.invalid", password: "senha-teste", confirmPassword: "senha-teste",
      });
      const { user } = await created.json();
      assert.equal(created.status, 201);
      assert.equal(user.page.displayName, username);
      const cookie = created.headers.get("set-cookie").split(";")[0];
      const secondRegistration = await json("/api/auth/register", {
        username: second, fullName: "Outra Conta", birthDate: "1990-04-01",
        email: second + "@example.invalid", password: "senha-teste", confirmPassword: "senha-teste",
      });
      assert.equal(secondRegistration.status, 201);
      const secondUser = (await secondRegistration.json()).user;
      const otherCookie = secondRegistration.headers.get("set-cookie").split(";")[0];
      await accountTest.test("outra conta não pode editar perfil ou adulterar configurações de segurança", async () => {
        const overwrite = await fetch(base + "/api/persistence/users/" + user.id, {
          method: "PUT", headers: { Cookie: otherCookie, "Content-Type": "application/json" },
          body: JSON.stringify({ ...user, role: "admin" }),
        });
        assert.equal(overwrite.status, 403);
        const email = await fetch(base + "/api/account", {
          method: "PUT", headers: { Cookie: cookie, "Content-Type": "application/json" },
          body: JSON.stringify({ fullName: "Conta Teste", birthDate: "1990-04-01", email: "other@example.invalid" }),
        });
        assert.equal(email.status, 403);
        assert.equal((await json("/api/account/deletion-request", { password: "incorreta" }, cookie)).status, 403);
        assert.equal((await json("/api/account/deletion-request", { password: "senha-teste" }, cookie)).status, 202);
        const otherPrivacy = await fetch(base + "/api/account/privacy", { headers: { Cookie: otherCookie } });
        assert.equal((await otherPrivacy.json()).deletionRequestedAt, null);
        await repository.query("INSERT INTO friendships VALUES ($1,$2,$3,'accepted',999,'{}')",
          [randomUUID(), user.id, secondUser.id]);
        const update = await fetch(base + "/api/account/privacy", {
          method: "PUT", headers: { Cookie: cookie, "Content-Type": "application/json" },
          body: JSON.stringify({ hideFriends: true, userId: secondUser.id }),
        });
        assert.equal((await update.json()).hideFriends, true);
        const publicList = await fetch(base + "/api/social/friends?userId=" + secondUser.id);
        assert.equal((await publicList.json()).friends.length, 0);
        const ownList = await fetch(base + "/api/social/friends?userId=" + user.id, { headers: { Cookie: cookie } });
        assert.equal((await ownList.json()).friends[0].id, secondUser.id);
      });
      await accountTest.test("uploads validam bytes, aplicam quotas e impedem exclusão por outro usuário", async () => {
        const image = await sharp({ create: { width: 5, height: 5, channels: 3, background: "red" } }).png().toBuffer();
        const sendImage = (body, type = "image/png") => fetch(base + "/api/persistence/page-assets", {
          method: "POST", headers: { Cookie: cookie, "Content-Type": type }, body,
        });
        assert.equal((await sendImage(image.subarray(0, 12))).status, 400);
        assert.equal((await sendImage(image, "image/gif")).status, 400);
        assert.equal((await sendImage(Buffer.alloc(5 * 1024 * 1024 + 1))).status, 413);
        const fakeAudio = await fetch(base + "/api/persistence/audio", {
          method: "POST", headers: { Cookie: cookie, "Content-Type": "audio/mpeg", "X-File-Name": "falso.mp3" },
          body: Buffer.from("ID3falso"),
        });
        assert.equal(fakeAudio.status, 400);
        const uploads = await Promise.all([sendImage(image), sendImage(image), sendImage(image)]);
        assert.ok(uploads.some(item => item.status === 429));
        const created = uploads.find(item => item.status === 201);
        assert.ok(created);
        const asset = await created.json();
        const attack = await fetch(base + "/api/persistence/page-assets/" + asset.id, {
          method: "DELETE", headers: { Cookie: otherCookie },
        });
        assert.equal(attack.status, 404);
        const served = await fetch(base + asset.url);
        assert.equal(served.status, 200);
        assert.equal(served.headers.get("content-type"), "image/png");
        await repository.query("INSERT INTO media_files(path,kind,size_bytes,owner_id) VALUES ($1,'image',104857600,$2)",
          ["test-quota/" + user.id, user.id]);
        assert.equal((await sendImage(image)).status, 409);
      });
      const exported = await fetch(base + "/api/account/export", { headers: { Cookie: cookie } });
      assert.equal(exported.status, 200);
      assert.match(exported.headers.get("content-disposition"), /^attachment/);
      const data = await exported.json();
      assert.equal(data.account.fullName, "Conta Teste");
      assert.equal(data.profile.id, user.id);
      assert.equal(data.profile.passwordHash, undefined);
      const session = async token => {
        const result = await fetch(base + "/api/auth/session", { headers: { Cookie: token } });
        return (await result.json()).user;
      };
      const change = { newPassword: "senha-teste-nova", confirmPassword: "senha-teste-nova" };
      assert.equal((await json("/api/account/password", change, cookie)).status, 403);
      const changed = await json("/api/account/password", { ...change, currentPassword: "senha-teste" }, cookie);
      assert.equal(changed.status, 200);
      assert.equal(await session(cookie), null);
      const changedCookie = changed.headers.get("set-cookie").split(";")[0];
      assert.equal((await session(changedCookie)).id, user.id);
      const newLogin = await json("/api/auth/login", { identifier: username, password: "senha-teste-nova" });
      assert.equal(newLogin.status, 200);
      const newCookie = newLogin.headers.get("set-cookie").split(";")[0];
      assert.notEqual(newCookie, changedCookie);
      assert.equal((await json("/api/auth/logout", {}, newCookie)).status, 200);
      assert.equal(await session(newCookie), null);
      assert.equal((await session(changedCookie)).id, user.id);
      await repository.query("UPDATE auth_sessions SET expires_at = now() - interval '1 second' WHERE user_id = $1", [user.id]);
      assert.equal(await session(changedCookie), null);
      const reset = newSessionToken();
      await repository.query("INSERT INTO password_resets(user_id,token_digest,expires_at) VALUES ($1,$2,now()+interval '1 minute')",
        [user.id, sessionTokenDigest(reset)]);
      const results = await Promise.all([1, 2].map(() =>
        json("/api/auth/password-reset/confirm", { token: reset, password: "outra-senha-teste" })));
      assert.deepEqual(results.map(item => item.status).sort(), [200, 400]);
    } finally {
      try {
        await repository.transaction(async () => {
          const names = [username, second];
          await repository.query("DELETE FROM friendships WHERE requester_id IN (SELECT id FROM users WHERE username = ANY($1))", [names]);
          for (const table of ["accounts", "credentials", "media_files"]) {
            await repository.query(`DELETE FROM ${table} WHERE ${table === "media_files" ? "owner_id" : "user_id"}
              IN (SELECT id FROM users WHERE username = ANY($1))`, [names]);
          }
          await repository.query("DELETE FROM users WHERE username = ANY($1)", [names]);
        });
      } finally { await repository.close(); }
    }
  });

  await t.test("login não revela se a conta existe e limita tentativas", async () => {
    let limited = false;
    for (let i = 0; i < 21; i++) {
      const response = await fetch(base + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https", "X-Forwarded-For": "192.0.2.10" },
        body: JSON.stringify({ identifier: "ausente@example.invalid", password: "senha inválida" }),
      });
      if (response.status === 429) {
        assert.ok(i >= 10);
        assert.ok(Number(response.headers.get("retry-after")) > 0);
        limited = true;
        break;
      }
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: "E-mail, nome de usuário ou senha inválidos." });
    }
    assert.ok(limited);
  });

  await t.test("atualização do cadastro tem limite próprio de tentativas", async () => {
    let limited = false;
    for (let i = 0; i < 21; i++) {
      const response = await fetch(base + "/api/account", {
        method: "PUT",
        headers: { "X-Forwarded-Proto": "https", "X-Forwarded-For": "192.0.2.11" },
      });
      if (response.status === 429) {
        assert.ok(i >= 10);
        assert.ok(Number(response.headers.get("retry-after")) > 0);
        limited = true;
        break;
      }
      assert.equal(response.status, 401);
    }
    assert.ok(limited);
  });
});
