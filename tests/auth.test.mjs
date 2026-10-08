import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  createSessionToken,
  hashPassword,
  sanitizeUser,
  verifyPassword,
  verifySessionToken,
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

test("token de sessão assinado rejeita adulteração e expiração", () => {
  const key = randomBytes(32).toString("hex");
  const now = Date.now();
  const token = createSessionToken("user-123", key, now);
  assert.equal(verifySessionToken(token, key, now)?.userId, "user-123");
  assert.equal(verifySessionToken(token + "x", key, now), null);
  assert.equal(verifySessionToken(token, key + "x", now), null);
  assert.equal(verifySessionToken(token, key, now + 31 * 24 * 60 * 60 * 1000), null);
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
