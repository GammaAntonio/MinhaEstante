import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  newSessionToken,
  hashPassword,
  sanitizeUser,
  sanitizePublicProfile,
  verifyPassword,
  sessionTokenDigest,
} from "../auth.mjs";

test("senha vira scrypt com salt e nunca reaparece em texto puro", async () => {
  const secret = randomUUID() + randomUUID();
  const hashA = await hashPassword(secret);
  const hashB = await hashPassword(secret);
  assert.notEqual(hashA, hashB);
  assert.equal(hashA.includes(secret), false);
  assert.equal(await verifyPassword(secret, hashA), true);
  assert.equal(await verifyPassword(secret + "x", hashA), false);
});

test("perfil público oculta históricos de edição e dados de cadastro", () => {
  const profile = {
    fullName: "Nome civil",
    email: "conta@example.invalid",
    page: {
      displayName: "Apelido",
      customCode: { html: "<p>Público</p>", previousVersion: { html: "privado" } },
      mediaPages: { albums: { customCode: { previousVersion: { html: "privado" } } } },
    },
  };
  const output = sanitizePublicProfile(profile);
  assert.equal(output.fullName, undefined);
  assert.equal(output.email, undefined);
  assert.equal(output.page.displayName, "Apelido");
  assert.equal(output.page.customCode.html, "<p>Público</p>");
  assert.equal(output.page.customCode.previousVersion, undefined);
  assert.equal(output.page.mediaPages.albums.customCode.previousVersion, undefined);
  assert.ok(profile.page.customCode.previousVersion);
});

test("sessões recebem tokens opacos distintos e só persistem o digest", () => {
  const token = newSessionToken();
  assert.notEqual(token, newSessionToken());
  assert.equal(sessionTokenDigest(token).length, 32);
  assert.equal(sessionTokenDigest(token + "x"), null);
  assert.notEqual(sessionTokenDigest(token).toString("base64url"), token);
});

test("usuário enviado ao navegador não contém material de autenticação", () => {
  const publicUser = sanitizeUser({
    id: "1",
    username: "teste",
    password: "legacy",
    passwordHash: "hash",
    auth: { anything: true },
    salt: "salt",
    page: { displayName: "Teste" },
  });
  assert.equal(publicUser.password, undefined);
  assert.equal(publicUser.passwordHash, undefined);
  assert.equal(publicUser.auth, undefined);
  assert.equal(publicUser.salt, undefined);
  assert.equal(publicUser.username, "teste");
});
