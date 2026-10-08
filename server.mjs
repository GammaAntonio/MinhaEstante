import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { musicProxy } from "./music-proxy.mjs";
import { blankUser, seedUsers } from "./data.js";
import { hasMP3Signature } from "./mp3-validation.js";
import {
  authRecord,
  clearSessionCookie,
  cookieValue,
  createSessionToken,
  hashPassword,
  sanitizeUser,
  sessionCookie,
  verifyPassword,
  verifySessionToken,
} from "./auth.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(root, "data");
const usersFile = path.join(dataDir, "users.json");
const defaultUsersFile = path.join(dataDir, "default-users.json");
const authFile = path.join(dataDir, "auth.json");
const defaultAuthFile = path.join(dataDir, "default-auth.json");
const accountsFile = path.join(dataDir, "accounts.json");
const defaultAccountsFile = path.join(dataDir, "default-accounts.json");
const friendshipsFile = path.join(dataDir, "friendships.json");
const defaultFriendshipsFile = path.join(dataDir, "default-friendships.json");
const sessionSecretFile = path.join(dataDir, "session-secret");
const creatorIdentityFile = path.join(dataDir, "creator.json");
const audioDir = path.join(dataDir, "audio");
const pageAssetsDir = path.join(dataDir, "page-assets");

let creatorUserId = "";

const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".md": "text/plain",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
};

async function atomicWriteJson(file, value) {
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(temp, JSON.stringify(value, null, 2), "utf8");
  await fsp.rename(temp, file);
}

let dataMutationQueue = Promise.resolve();
function withDataMutation(task) {
  const run = dataMutationQueue.then(task, task);
  dataMutationQueue = run.catch(() => {});
  return run;
}

async function readJsonFile(file, fallback = null) {
  try {
    return JSON.parse(await fsp.readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function migrateCredentialFile(userFile, credentialFile) {
  const users = await readJsonFile(userFile, null);
  if (!Array.isArray(users)) return;
  const auth = await readJsonFile(credentialFile, []);
  const byUserId = new Map(
    (Array.isArray(auth) ? auth : [])
      .filter((record) => record?.userId && record?.passwordHash)
      .map((record) => [String(record.userId), record]),
  );
  let usersChanged = false;
  let authChanged = !Array.isArray(auth);

  for (const user of users) {
    if (!user?.id) continue;
    let record = byUserId.get(String(user.id));
    let passwordHash = record?.passwordHash || "";
    if (typeof user.password === "string" && user.password) {
      passwordHash = await hashPassword(user.password);
      usersChanged = true;
    } else if (typeof user.passwordHash === "string" && user.passwordHash) {
      passwordHash = user.passwordHash;
      usersChanged = true;
    }
    if (Object.hasOwn(user, "password")) {
      delete user.password;
      usersChanged = true;
    }
    if (Object.hasOwn(user, "passwordHash")) {
      delete user.passwordHash;
      usersChanged = true;
    }
    if (passwordHash) {
      const next = authRecord(user, passwordHash);
      if (JSON.stringify(record || null) !== JSON.stringify(next)) {
        byUserId.set(String(user.id), next);
        authChanged = true;
      }
    }
  }

  const validIds = new Set(users.map((user) => String(user.id)));
  const nextAuth = [...byUserId.values()].filter((record) => validIds.has(String(record.userId)));
  if (nextAuth.length !== byUserId.size) authChanged = true;
  if (usersChanged) await atomicWriteJson(userFile, users);
  if (authChanged || !(await fileExists(credentialFile)))
    await atomicWriteJson(credentialFile, nextAuth);
}

async function fileExists(file) {
  try {
    await fsp.access(file);
    return true;
  } catch {
    return false;
  }
}

let dataReadyPromise;
async function ensureDataDirs() {
  dataReadyPromise ??= (async () => {
    await fsp.mkdir(dataDir, { recursive: true });
    await fsp.mkdir(audioDir, { recursive: true });
    await fsp.mkdir(pageAssetsDir, { recursive: true });

    if (!(await fileExists(defaultUsersFile)))
      await atomicWriteJson(defaultUsersFile, seedUsers());

    if (!(await fileExists(usersFile))) {
      const defaults = await readJsonFile(defaultUsersFile, seedUsers());
      await atomicWriteJson(usersFile, defaults);
      if (await fileExists(defaultAuthFile))
        await fsp.copyFile(defaultAuthFile, authFile);
    }

    await migrateCredentialFile(defaultUsersFile, defaultAuthFile);
    await migrateCredentialFile(usersFile, authFile);

    const currentUsers = await readJsonFile(usersFile, []);
    const defaultUsers = await readJsonFile(defaultUsersFile, []);
    if (!(await fileExists(defaultAccountsFile)))
      await atomicWriteJson(
        defaultAccountsFile,
        (Array.isArray(defaultUsers) ? defaultUsers : []).map((user) => accountRecord(user)),
      );
    if (!(await fileExists(accountsFile)))
      await atomicWriteJson(
        accountsFile,
        (Array.isArray(currentUsers) ? currentUsers : []).map((user) => accountRecord(user)),
      );
    if (!(await fileExists(defaultFriendshipsFile)))
      await atomicWriteJson(defaultFriendshipsFile, []);
    if (!(await fileExists(friendshipsFile)))
      await atomicWriteJson(friendshipsFile, []);

    await reconcilePrivateData(currentUsers);

    const creatorIdentity = await readJsonFile(creatorIdentityFile, null);
    if (creatorIdentity?.userId) {
      creatorUserId = String(creatorIdentity.userId);
    } else {
      const users = await readJsonFile(usersFile, []);
      const creator = Array.isArray(users)
        ? users.find((user) => user?.username === "antonio")
        : null;
      if (creator?.id) {
        creatorUserId = String(creator.id);
        await atomicWriteJson(creatorIdentityFile, {
          userId: creatorUserId,
        });
      }
    }

    if (!(await fileExists(sessionSecretFile)))
      await fsp.writeFile(sessionSecretFile, randomBytes(32).toString("hex"), {
        encoding: "utf8",
        mode: 0o600,
      });
  })();
  return dataReadyPromise;
}

async function readUsersFile() {
  await ensureDataDirs();
  const value = await readJsonFile(usersFile, []);
  if (!Array.isArray(value)) throw new Error("users.json precisa conter uma lista.");
  return value;
}

async function readAuthFile() {
  await ensureDataDirs();
  const value = await readJsonFile(authFile, []);
  if (!Array.isArray(value)) throw new Error("auth.json precisa conter uma lista.");
  return value;
}

async function readAccountsFile() {
  await ensureDataDirs();
  const value = await readJsonFile(accountsFile, []);
  if (!Array.isArray(value)) throw new Error("accounts.json precisa conter uma lista.");
  return value;
}

async function readFriendshipsFile() {
  await ensureDataDirs();
  const value = await readJsonFile(friendshipsFile, []);
  if (!Array.isArray(value)) throw new Error("friendships.json precisa conter uma lista.");
  return value;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 15);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 160;
}

function ageFromBirthDate(value, today = new Date()) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  )
    return null;
  const nowYear = today.getUTCFullYear();
  const nowMonth = today.getUTCMonth() + 1;
  const nowDay = today.getUTCDate();
  let age = nowYear - year;
  if (nowMonth < month || (nowMonth === month && nowDay < day)) age -= 1;
  return age;
}

function accountRecord(user, values = {}) {
  return {
    userId: String(user?.id || values.userId || ""),
    fullName: String(values.fullName || user?.page?.displayName || "").trim().slice(0, 100),
    birthDate: String(values.birthDate || "").trim(),
    city: String(values.city || "").trim().slice(0, 100),
    email: normalizeEmail(values.email),
    phone: normalizePhone(values.phone),
    passwordHint: String(values.passwordHint || "").trim().slice(0, 160),
  };
}

function validateAccountInput(payload, { registration = false } = {}) {
  const fullName = String(payload?.fullName || payload?.name || "").trim();
  const birthDate = String(payload?.birthDate || "").trim();
  const city = String(payload?.city || "").trim();
  const email = normalizeEmail(payload?.email);
  const phone = normalizePhone(payload?.phone);
  const passwordHint = String(payload?.passwordHint || "").trim();
  const age = ageFromBirthDate(birthDate);
  if (fullName.length < 2 || fullName.length > 100)
    throw Object.assign(new Error("Informe seu nome completo (2 a 100 caracteres)."), { statusCode: 400 });
  if (age === null || age < 14)
    throw Object.assign(new Error("O MinhaEstante aceita cadastros a partir de 14 anos."), { statusCode: 400 });
  if (!city || city.length > 100)
    throw Object.assign(new Error("Informe sua cidade (até 100 caracteres)."), { statusCode: 400 });
  if (!validEmail(email))
    throw Object.assign(new Error("Informe um e-mail válido."), { statusCode: 400 });
  if (phone.length < 10 || phone.length > 15)
    throw Object.assign(new Error("Informe um telefone válido com DDD."), { statusCode: 400 });
  if (passwordHint.length > 160)
    throw Object.assign(new Error("A dica da senha deve ter no máximo 160 caracteres."), { statusCode: 400 });
  return { fullName, birthDate, city, email, phone, passwordHint, age, registration };
}

async function reconcilePrivateData(users) {
  const safeUsers = Array.isArray(users) ? users : [];
  const validIds = new Set(safeUsers.map((user) => String(user.id)));
  const storedAccounts = await readJsonFile(accountsFile, []);
  const byId = new Map(
    (Array.isArray(storedAccounts) ? storedAccounts : [])
      .filter((account) => validIds.has(String(account?.userId || "")))
      .map((account) => [String(account.userId), account]),
  );
  let accountsChanged = !Array.isArray(storedAccounts) || byId.size !== (storedAccounts || []).length;
  for (const user of safeUsers) {
    if (!byId.has(String(user.id))) {
      byId.set(String(user.id), accountRecord(user));
      accountsChanged = true;
    }
  }
  if (accountsChanged) await atomicWriteJson(accountsFile, [...byId.values()]);

  const storedFriendships = await readJsonFile(friendshipsFile, []);
  const cleanFriendships = (Array.isArray(storedFriendships) ? storedFriendships : []).filter(
    (item) =>
      item?.id &&
      validIds.has(String(item.requesterId)) &&
      validIds.has(String(item.receiverId)) &&
      String(item.requesterId) !== String(item.receiverId) &&
      ["pending", "accepted"].includes(item.status),
  );
  if (!Array.isArray(storedFriendships) || cleanFriendships.length !== storedFriendships.length)
    await atomicWriteJson(friendshipsFile, cleanFriendships);
}

async function sessionSecret() {
  await ensureDataDirs();
  return (await fsp.readFile(sessionSecretFile, "utf8")).trim();
}

async function readBody(req, maxBytes = 8 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error("Corpo da requisição excede o limite.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req, maxBytes = 8 * 1024 * 1024) {
  const body = await readBody(req, maxBytes);
  try {
    return JSON.parse(body.toString("utf8") || "null");
  } catch {
    const error = new Error("JSON inválido.");
    error.statusCode = 400;
    throw error;
  }
}

function json(res, status, value, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(JSON.stringify(value));
}

async function requestUser(req, all = null) {
  const token = cookieValue(req, "booksite_session");
  if (!token) return null;
  const payload = verifySessionToken(token, await sessionSecret());
  if (!payload) return null;
  const users = all || (await readUsersFile());
  return users.find((user) => String(user.id) === payload.userId) || null;
}

function socialSummary(userId, friendships = []) {
  const id = String(userId || "");
  const friendIds = (Array.isArray(friendships) ? friendships : [])
    .filter(
      (item) =>
        item?.status === "accepted" &&
        (String(item.requesterId) === id || String(item.receiverId) === id),
    )
    .map((item) =>
      String(item.requesterId) === id ? String(item.receiverId) : String(item.requesterId),
    );
  return { friendCount: friendIds.length, friendIds };
}

function publicUser(user, friendships = []) {
  if (!user) return null;
  const clean = sanitizeUser(user);
  return {
    ...clean,
    isCreator: !!creatorUserId && String(user.id) === creatorUserId,
    social: socialSummary(user.id, friendships),
  };
}

function publicUsers(users, friendships = []) {
  return (Array.isArray(users) ? users : []).map((user) => publicUser(user, friendships));
}

function mergeUserData(existing, incoming) {
  const clean = sanitizeUser(incoming);
  delete clean.isCreator;
  delete clean.creator;
  delete clean.creatorBadge;
  return {
    ...clean,
    id: existing.id,
    username: existing.username,
    role: existing.role,
    createdAt: existing.createdAt,
  };
}

async function sendWelcomeEmail(account, user) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = String(process.env.WELCOME_FROM_EMAIL || "").trim();
  if (!apiKey || !from || !account?.email) return false;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [account.email],
        subject: "Bem-vindo ao MinhaEstante",
        text: `Olá, ${account.fullName}! Sua conta @${user.username} foi criada no MinhaEstante. Bem-vindo à sua pequena internet.`,
      }),
    });
    if (!response.ok) console.warn("MinhaEstante: e-mail de boas-vindas não enviado.", response.status);
    return response.ok;
  } catch (error) {
    console.warn("MinhaEstante: falha no e-mail de boas-vindas.", error?.message || error);
    return false;
  }
}

async function authApi(req, res, url) {
  if (!url.pathname.startsWith("/api/auth/")) return false;
  await ensureDataDirs();

  if (req.method === "GET" && url.pathname === "/api/auth/session") {
    const user = await requestUser(req);
    const friendships = await readFriendshipsFile();
    json(res, 200, { user: publicUser(user, friendships) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const payload = await readJsonBody(req, 32 * 1024);
    const identifier = String(payload?.identifier || payload?.username || "").trim().toLowerCase();
    const password = String(payload?.password || "");
    const users = await readUsersFile();
    const accounts = await readAccountsFile();
    const accountByEmail = accounts.find((item) => item.email && item.email === identifier);
    const user = accountByEmail
      ? users.find((item) => String(item.id) === String(accountByEmail.userId))
      : users.find((item) => item.username === identifier);
    const account = user && accounts.find((item) => String(item.userId) === String(user.id));
    const auth = await readAuthFile();
    const record = user && auth.find((item) => String(item.userId) === String(user.id));
    if (!user || !record) {
      json(res, 401, { error: "Conta não encontrada." });
      return true;
    }
    if (!(await verifyPassword(password, record.passwordHash))) {
      json(res, 401, {
        error: "Senha incorreta.",
        hint: String(account?.passwordHint || ""),
      });
      return true;
    }
    const token = createSessionToken(user.id, await sessionSecret());
    const friendships = await readFriendshipsFile();
    json(
      res,
      200,
      { user: publicUser(user, friendships) },
      { "Set-Cookie": sessionCookie(token) },
    );
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const payload = await readJsonBody(req, 64 * 1024);
    const username = String(payload?.username || "").trim().toLowerCase();
    const password = String(payload?.password || "");
    const confirmPassword = String(payload?.confirmPassword || "");
    if (!/^[a-z0-9_-]{3,30}$/.test(username)) {
      json(res, 400, { error: "Use de 3 a 30 letras sem acentos, números, _ ou - no nome de usuário." });
      return true;
    }
    if (password.length < 6 || password.length > 200) {
      json(res, 400, { error: "A senha deve ter entre 6 e 200 caracteres." });
      return true;
    }
    if (password !== confirmPassword) {
      json(res, 400, { error: "A confirmação da senha não confere." });
      return true;
    }
    let accountData;
    try {
      accountData = validateAccountInput(payload, { registration: true });
    } catch (error) {
      json(res, error.statusCode || 400, { error: error.message });
      return true;
    }

    const result = await withDataMutation(async () => {
      const users = await readUsersFile();
      const accounts = await readAccountsFile();
      if (users.some((item) => item.username === username)) {
        const error = new Error("Esse nome de usuário já existe. Tente outro.");
        error.statusCode = 409;
        throw error;
      }
      if (accounts.some((item) => item.email === accountData.email)) {
        const error = new Error("Já existe uma conta com este e-mail.");
        error.statusCode = 409;
        throw error;
      }
      const created = blankUser(username, accountData.fullName);
      const auth = await readAuthFile();
      const passwordHash = await hashPassword(password);
      const createdAccount = accountRecord(created, accountData);
      auth.push(authRecord(created, passwordHash));
      users.push(created);
      accounts.push(createdAccount);
      await atomicWriteJson(authFile, auth);
      await atomicWriteJson(usersFile, users);
      await atomicWriteJson(accountsFile, accounts);
      return { user: created, account: createdAccount };
    });

    void sendWelcomeEmail(result.account, result.user);
    const token = createSessionToken(result.user.id, await sessionSecret());
    const friendships = await readFriendshipsFile();
    json(
      res,
      201,
      { user: publicUser(result.user, friendships) },
      { "Set-Cookie": sessionCookie(token) },
    );
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    json(res, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
    return true;
  }

  json(res, 404, { error: "Endpoint de autenticação não encontrado." });
  return true;
}

async function accountApi(req, res, url) {
  if (!url.pathname.startsWith("/api/account")) return false;
  await ensureDataDirs();
  const users = await readUsersFile();
  const user = await requestUser(req, users);
  if (!user) {
    json(res, 401, { error: "Entre na sua conta para acessar estes dados." });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/account") {
    const accounts = await readAccountsFile();
    const account = accounts.find((item) => String(item.userId) === String(user.id)) || accountRecord(user);
    json(res, 200, {
      account: { ...account, username: user.username },
    });
    return true;
  }

  if (req.method === "PUT" && url.pathname === "/api/account") {
    const payload = await readJsonBody(req, 64 * 1024);
    let nextData;
    try {
      nextData = validateAccountInput(payload);
    } catch (error) {
      json(res, error.statusCode || 400, { error: error.message });
      return true;
    }
    const account = await withDataMutation(async () => {
      const accounts = await readAccountsFile();
      if (
        accounts.some(
          (item) =>
            String(item.userId) !== String(user.id) &&
            normalizeEmail(item.email) === nextData.email,
        )
      ) {
        const error = new Error("Já existe uma conta com este e-mail.");
        error.statusCode = 409;
        throw error;
      }
      const index = accounts.findIndex((item) => String(item.userId) === String(user.id));
      const next = accountRecord(user, nextData);
      if (index >= 0) accounts[index] = next;
      else accounts.push(next);
      await atomicWriteJson(accountsFile, accounts);
      return next;
    });
    json(res, 200, { ok: true, account: { ...account, username: user.username } });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/account/password") {
    const payload = await readJsonBody(req, 16 * 1024);
    const newPassword = String(payload?.newPassword || "");
    const confirmPassword = String(payload?.confirmPassword || "");
    if (newPassword.length < 6 || newPassword.length > 200) {
      json(res, 400, { error: "A nova senha deve ter entre 6 e 200 caracteres." });
      return true;
    }
    if (newPassword !== confirmPassword) {
      json(res, 400, { error: "A confirmação da nova senha não confere." });
      return true;
    }
    await withDataMutation(async () => {
      const auth = await readAuthFile();
      const index = auth.findIndex((item) => String(item.userId) === String(user.id));
      if (index < 0) {
        const error = new Error("Credencial da conta não encontrada.");
        error.statusCode = 404;
        throw error;
      }
      auth[index] = authRecord(user, await hashPassword(newPassword));
      await atomicWriteJson(authFile, auth);
    });
    json(res, 200, { ok: true });
    return true;
  }

  json(res, 404, { error: "Endpoint da conta não encontrado." });
  return true;
}

function friendshipBetween(friendships, firstId, secondId) {
  const a = String(firstId);
  const b = String(secondId);
  return (Array.isArray(friendships) ? friendships : []).find(
    (item) =>
      (String(item.requesterId) === a && String(item.receiverId) === b) ||
      (String(item.requesterId) === b && String(item.receiverId) === a),
  );
}

async function socialApi(req, res, url) {
  if (!url.pathname.startsWith("/api/social/")) return false;
  await ensureDataDirs();
  const users = await readUsersFile();
  const friendships = await readFriendshipsFile();
  const actor = await requestUser(req, users);

  if (req.method === "GET" && url.pathname === "/api/social/friends") {
    const targetId = String(url.searchParams.get("userId") || actor?.id || "");
    const target = users.find((item) => String(item.id) === targetId);
    if (!target) {
      json(res, 404, { error: "Conta não encontrada." });
      return true;
    }
    const ids = socialSummary(target.id, friendships).friendIds;
    json(res, 200, {
      user: publicUser(target, friendships),
      friends: publicUsers(
        ids.map((id) => users.find((item) => String(item.id) === id)).filter(Boolean),
        friendships,
      ),
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/social/state") {
    const targetId = String(url.searchParams.get("userId") || "");
    if (!actor) {
      json(res, 200, { state: "guest", friendshipId: "" });
      return true;
    }
    if (String(actor.id) === targetId) {
      json(res, 200, { state: "self", friendshipId: "" });
      return true;
    }
    const relation = friendshipBetween(friendships, actor.id, targetId);
    if (!relation) {
      json(res, 200, { state: "none", friendshipId: "" });
      return true;
    }
    const state = relation.status === "accepted"
      ? "friends"
      : String(relation.requesterId) === String(actor.id)
        ? "outgoing"
        : "incoming";
    json(res, 200, { state, friendshipId: relation.id });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/social/requests") {
    if (!actor) {
      json(res, 401, { error: "Entre para ver solicitações de amizade." });
      return true;
    }
    const incoming = friendships
      .filter((item) => item.status === "pending" && String(item.receiverId) === String(actor.id))
      .map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        user: publicUser(users.find((user) => String(user.id) === String(item.requesterId)), friendships),
      }))
      .filter((item) => item.user);
    const outgoing = friendships
      .filter((item) => item.status === "pending" && String(item.requesterId) === String(actor.id))
      .map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        user: publicUser(users.find((user) => String(user.id) === String(item.receiverId)), friendships),
      }))
      .filter((item) => item.user);
    json(res, 200, { incoming, outgoing });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/social/request") {
    if (!actor) {
      json(res, 401, { error: "Entre para enviar uma solicitação de amizade." });
      return true;
    }
    const payload = await readJsonBody(req, 16 * 1024);
    const targetId = String(payload?.userId || "");
    if (!targetId || targetId === String(actor.id)) {
      json(res, 400, { error: "Escolha outra pessoa para adicionar." });
      return true;
    }
    if (!users.some((item) => String(item.id) === targetId)) {
      json(res, 404, { error: "Conta não encontrada." });
      return true;
    }
    const relation = await withDataMutation(async () => {
      const all = await readFriendshipsFile();
      const existing = friendshipBetween(all, actor.id, targetId);
      if (existing) {
        const error = new Error(
          existing.status === "accepted"
            ? "Vocês já são amigos."
            : String(existing.requesterId) === String(actor.id)
              ? "A solicitação já foi enviada."
              : "Essa pessoa já enviou uma solicitação para você.",
        );
        error.statusCode = 409;
        throw error;
      }
      const created = {
        id: randomUUID(),
        requesterId: String(actor.id),
        receiverId: targetId,
        status: "pending",
        createdAt: new Date().toISOString(),
        acceptedAt: null,
      };
      all.push(created);
      await atomicWriteJson(friendshipsFile, all);
      return created;
    });
    json(res, 201, { ok: true, friendship: relation });
    return true;
  }

  if (req.method === "POST" && ["/api/social/accept", "/api/social/reject"].includes(url.pathname)) {
    if (!actor) {
      json(res, 401, { error: "Entre para responder à solicitação." });
      return true;
    }
    const payload = await readJsonBody(req, 16 * 1024);
    const friendshipId = String(payload?.friendshipId || "");
    const accepting = url.pathname.endsWith("/accept");
    await withDataMutation(async () => {
      const all = await readFriendshipsFile();
      const index = all.findIndex((item) => item.id === friendshipId);
      const relation = index >= 0 ? all[index] : null;
      if (!relation || relation.status !== "pending") {
        const error = new Error("Solicitação não encontrada.");
        error.statusCode = 404;
        throw error;
      }
      if (String(relation.receiverId) !== String(actor.id)) {
        const error = new Error("Só quem recebeu a solicitação pode respondê-la.");
        error.statusCode = 403;
        throw error;
      }
      if (accepting) {
        all[index] = {
          ...relation,
          status: "accepted",
          acceptedAt: new Date().toISOString(),
        };
      } else {
        all.splice(index, 1);
      }
      await atomicWriteJson(friendshipsFile, all);
    });
    json(res, 200, { ok: true });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/social/remove") {
    if (!actor) {
      json(res, 401, { error: "Entre para remover uma amizade." });
      return true;
    }
    const payload = await readJsonBody(req, 16 * 1024);
    const targetId = String(payload?.userId || "");
    await withDataMutation(async () => {
      const all = await readFriendshipsFile();
      const index = all.findIndex(
        (item) => item.status === "accepted" && (
          (String(item.requesterId) === String(actor.id) && String(item.receiverId) === targetId) ||
          (String(item.receiverId) === String(actor.id) && String(item.requesterId) === targetId)
        ),
      );
      if (index < 0) {
        const error = new Error("Amizade não encontrada.");
        error.statusCode = 404;
        throw error;
      }
      all.splice(index, 1);
      await atomicWriteJson(friendshipsFile, all);
    });
    json(res, 200, { ok: true });
    return true;
  }

  json(res, 404, { error: "Endpoint social não encontrado." });
  return true;
}

function safeAudioId(value) {
  return /^[0-9a-f-]{36}$/i.test(value || "") ? value : "";
}

function safePageAssetId(value) {
  return /^[0-9a-f-]{36}\.(?:png|jpg|webp|gif)$/i.test(value || "")
    ? value
    : "";
}

function safeOwnerId(value) {
  return /^[a-z0-9_-]{1,100}$/i.test(value || "") ? value : "";
}

function pageAssetKind(body) {
  if (!Buffer.isBuffer(body) || !body.length) return null;
  if (
    body.length >= 8 &&
    body[0] === 0x89 &&
    body[1] === 0x50 &&
    body[2] === 0x4e &&
    body[3] === 0x47 &&
    body[4] === 0x0d &&
    body[5] === 0x0a &&
    body[6] === 0x1a &&
    body[7] === 0x0a
  )
    return { ext: "png", type: "image/png" };
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff)
    return { ext: "jpg", type: "image/jpeg" };
  if (
    body.length >= 6 &&
    (body.subarray(0, 6).toString("ascii") === "GIF87a" ||
      body.subarray(0, 6).toString("ascii") === "GIF89a")
  )
    return { ext: "gif", type: "image/gif" };
  if (
    body.length >= 12 &&
    body.subarray(0, 4).toString("ascii") === "RIFF" &&
    body.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return { ext: "webp", type: "image/webp" };
  return null;
}

function decodeHeader(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

async function listPageAssetsFor(user) {
  const ownerId = safeOwnerId(String(user?.id || ""));
  if (!ownerId) return [];
  const dir = path.join(pageAssetsDir, ownerId);
  await fsp.mkdir(dir, { recursive: true });
  const names = await fsp.readdir(dir);
  const assets = [];
  for (const name of names) {
    const assetId = safePageAssetId(name);
    if (!assetId) continue;
    const file = path.join(dir, assetId);
    const stat = await fsp.stat(file);
    if (!stat.isFile()) continue;
    assets.push({
      id: assetId,
      url: `/api/persistence/page-assets/file/${encodeURIComponent(ownerId)}/${encodeURIComponent(assetId)}`,
      size: stat.size,
      createdAt: (stat.birthtimeMs || stat.mtimeMs)
        ? new Date(stat.birthtimeMs || stat.mtimeMs).toISOString()
        : null,
    });
  }
  assets.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return assets;
}

async function persistenceApi(req, res, url) {
  if (!url.pathname.startsWith("/api/persistence/")) return false;
  await ensureDataDirs();

  const assetFileMatch = url.pathname.match(
    /^\/api\/persistence\/page-assets\/file\/([^/]+)\/([^/]+)$/,
  );
  if (req.method === "GET" && assetFileMatch) {
    const ownerId = safeOwnerId(decodeURIComponent(assetFileMatch[1]));
    const assetId = safePageAssetId(decodeURIComponent(assetFileMatch[2]));
    if (!ownerId || !assetId) {
      json(res, 400, { error: "Imagem inválida." });
      return true;
    }
    const file = path.join(pageAssetsDir, ownerId, assetId);
    if (!(await fileExists(file))) {
      json(res, 404, { error: "Imagem não encontrada." });
      return true;
    }
    const ext = path.extname(assetId).slice(1).toLowerCase();
    const contentType =
      ext === "png"
        ? "image/png"
        : ext === "jpg"
          ? "image/jpeg"
          : ext === "webp"
            ? "image/webp"
            : "image/gif";
    const stat = await fsp.stat(file);
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stat.size,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    });
    fs.createReadStream(file).pipe(res);
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/persistence/page-assets") {
    const user = await requestUser(req);
    if (!user) {
      json(res, 401, { error: "Entre para ver as imagens da página." });
      return true;
    }
    json(res, 200, { assets: await listPageAssetsFor(user) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/persistence/page-assets") {
    const user = await requestUser(req);
    if (!user) {
      json(res, 401, { error: "Entre para enviar imagens." });
      return true;
    }
    const body = await readBody(req, 8 * 1024 * 1024);
    const kind = pageAssetKind(body);
    if (!kind) {
      json(res, 400, { error: "Use uma imagem PNG, JPG, WEBP ou GIF válida. SVG não é aceito." });
      return true;
    }
    const ownerId = safeOwnerId(String(user.id));
    if (!ownerId) {
      json(res, 400, { error: "Conta inválida para upload de imagem." });
      return true;
    }
    const dir = path.join(pageAssetsDir, ownerId);
    await fsp.mkdir(dir, { recursive: true });
    const assetId = `${randomUUID()}.${kind.ext}`;
    await fsp.writeFile(path.join(dir, assetId), body);
    const originalName = path.basename(decodeHeader(req.headers["x-file-name"])).slice(0, 180);
    json(res, 201, {
      id: assetId,
      fileName: originalName || `imagem.${kind.ext}`,
      url: `/api/persistence/page-assets/file/${encodeURIComponent(ownerId)}/${encodeURIComponent(assetId)}`,
      size: body.length,
      type: kind.type,
    });
    return true;
  }

  const pageAssetMatch = url.pathname.match(/^\/api\/persistence\/page-assets\/([^/]+)$/);
  if (req.method === "DELETE" && pageAssetMatch) {
    const user = await requestUser(req);
    if (!user) {
      json(res, 401, { error: "Entre para apagar imagens." });
      return true;
    }
    const ownerId = safeOwnerId(String(user.id));
    const assetId = safePageAssetId(decodeURIComponent(pageAssetMatch[1]));
    if (!ownerId || !assetId) {
      json(res, 400, { error: "Imagem inválida." });
      return true;
    }
    const file = path.join(pageAssetsDir, ownerId, assetId);
    if (!(await fileExists(file))) {
      json(res, 404, { error: "Imagem não encontrada." });
      return true;
    }
    await fsp.unlink(file);
    json(res, 200, { ok: true });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/persistence/users") {
    const users = await readUsersFile();
    const friendships = await readFriendshipsFile();
    json(res, 200, { users: publicUsers(users, friendships) });
    return true;
  }

  if (req.method === "PUT" && url.pathname === "/api/persistence/users") {
    const payload = await readJsonBody(req);
    if (!Array.isArray(payload?.users)) {
      json(res, 400, { error: "Formato de usuários inválido." });
      return true;
    }
    const count = await withDataMutation(async () => {
      const all = await readUsersFile();
      const actor = await requestUser(req, all);
      if (!actor || actor.role !== "admin") {
        const error = new Error("Apenas o administrador pode substituir a lista de usuários.");
        error.statusCode = 403;
        throw error;
      }
      const incomingById = new Map(payload.users.map((user) => [String(user?.id || ""), user]));
      const next = all.map((existing) => {
        const incoming = incomingById.get(String(existing.id));
        return incoming ? mergeUserData(existing, incoming) : existing;
      });
      await atomicWriteJson(usersFile, next);
      return next.length;
    });
    json(res, 200, { ok: true, count });
    return true;
  }

  const userMatch = url.pathname.match(/^\/api\/persistence\/users\/([^/]+)$/);
  if (req.method === "PUT" && userMatch) {
    const id = decodeURIComponent(userMatch[1]);
    const incoming = await readJsonBody(req);
    if (!incoming || typeof incoming !== "object" || incoming.id !== id) {
      json(res, 400, { error: "Usuário inválido." });
      return true;
    }
    const savedUser = await withDataMutation(async () => {
      const all = await readUsersFile();
      const actor = await requestUser(req, all);
      if (!actor) {
        const error = new Error("Sua sessão expirou. Entre novamente.");
        error.statusCode = 401;
        throw error;
      }
      const index = all.findIndex((item) => String(item.id) === String(id));
      if (index < 0) {
        const error = new Error("Conta não encontrada.");
        error.statusCode = 404;
        throw error;
      }
      if (String(actor.id) !== String(id) && actor.role !== "admin") {
        const error = new Error("Você só pode editar sua própria página.");
        error.statusCode = 403;
        throw error;
      }
      all[index] = mergeUserData(all[index], incoming);
      await atomicWriteJson(usersFile, all);
      return all[index];
    });
    json(res, 200, { ok: true, user: publicUser(savedUser, await readFriendshipsFile()) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/persistence/audio") {
    if (!(await requestUser(req))) {
      json(res, 401, { error: "Entre para enviar MP3." });
      return true;
    }
    const requestedName = decodeURIComponent(req.headers["x-file-name"] || "");
    if (!/\.mp3$/i.test(requestedName)) {
      json(res, 400, { error: "Escolha um arquivo MP3." });
      return true;
    }
    const body = await readBody(req, 55 * 1024 * 1024);
    if (!hasMP3Signature(body)) {
      json(res, 400, { error: "O arquivo enviado não parece ser um MP3 válido." });
      return true;
    }
    const id = randomUUID();
    await fsp.writeFile(path.join(audioDir, `${id}.mp3`), body);
    const fileName = path.basename(requestedName).slice(0, 180) || "musica.mp3";
    json(res, 201, { fileId: `server:${id}`, fileName });
    return true;
  }

  const audioMatch = url.pathname.match(/^\/api\/persistence\/audio\/([^/]+)$/);
  if (req.method === "GET" && audioMatch) {
    const id = safeAudioId(decodeURIComponent(audioMatch[1]));
    if (!id) {
      json(res, 400, { error: "Identificador de áudio inválido." });
      return true;
    }
    const file = path.join(audioDir, `${id}.mp3`);
    if (!fs.existsSync(file)) {
      json(res, 404, { error: "MP3 não encontrado." });
      return true;
    }
    res.writeHead(200, {
      "Content-Type": "audio/mpeg",
      "Content-Length": fs.statSync(file).size,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    });
    fs.createReadStream(file).pipe(res);
    return true;
  }

  json(res, 404, { error: "Endpoint de persistência não encontrado." });
  return true;
}

await ensureDataDirs();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (await authApi(req, res, url)) return;
    if (await accountApi(req, res, url)) return;
    if (await socialApi(req, res, url)) return;
    if (await persistenceApi(req, res, url)) return;
    if (await musicProxy(req, res, url)) return;

    const pathname = decodeURIComponent(url.pathname);
    if (pathname === "/data" || pathname.startsWith("/data/")) {
      res.writeHead(403);
      res.end("Acesso negado");
      return;
    }
    const file = path.resolve(
      root,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);
      res.end("Arquivo não encontrado");
      return;
    }
    res.writeHead(200, {
      "Content-Type":
        (types[path.extname(file)] || "application/octet-stream") +
        "; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    fs.createReadStream(file).pipe(res);
  } catch (error) {
    console.error(error);
    const status = Number(error?.statusCode) || 400;
    if (!res.headersSent)
      json(res, status, { error: error?.message || "Pedido inválido" });
    else res.end();
  }
});

server.listen(Number(process.env.PORT || 4183), "127.0.0.1", () =>
  console.log("MinhaEstante: http://127.0.0.1:" + server.address().port),
);
