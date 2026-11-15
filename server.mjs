import { createRepository } from "./database/repositories/persistence.mjs";
import { MAX_CREATOR_TRACKS } from "./creator-playlist.js";
import { cleanStickers } from "./sticker-data.js";
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import { musicProxy } from "./music-proxy.mjs";
import { blankUser } from "./data.js";
import { normalizeImage, validateMp3 } from "./media-validation.mjs";
import {
  authRecord,
  clearSessionCookie,
  cookieValue,
  hashPassword,
  newSessionToken,
  sanitizePublicProfile,
  sanitizeUser,
  sessionCookie,
  sessionTokenDigest,
  SESSION_TTL_SECONDS,
  verifyPassword,
} from "./auth.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.MINHAESTANTE_DATA_DIR ? path.resolve(process.env.MINHAESTANTE_DATA_DIR) : path.join(root, "data");
const usersFile = "users";
const authFile = "auth";
const accountsFile = "accounts";
const friendshipsFile = "friendships";
const audioDir = path.join(dataDir, "audio");
const pageAssetsDir = path.join(dataDir, "page-assets");

let creatorUserId = "";

const publicFiles = new Set([
  "index.html", "favicon.svg", "Album-MP3.png", "styles.css", "collection.css",
  "advanced.js", "album-pages.js", "album-store.js", "api.js", "app.js", "config.js",
  "creator-playlist-editor.js", "creator-playlist.js", "data.js", "editor.js",
  "identity.js", "media-hub.js", "media-stage.js", "mp3-validation.js", "music-api.js",
  "music.js", "navigation-motion.js", "page-assets.js", "page-media.js", "personal.js",
  "player-visualizer.js", "router.js", "sticker-data.js", "stickers.js", "storage.js",
  "ui.js", "webmcp.js",
]);

const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

// Node only listens on loopback. Caddy replaces X-Forwarded-Proto.
const isHttps = (req) => req.headers["x-forwarded-proto"] === "https";

function isCrossOriginMutation(req, url) {
  if (!url.pathname.startsWith("/api/") || ["GET", "HEAD", "OPTIONS"].includes(req.method)) return false;
  const site = req.headers["sec-fetch-site"];
  if (site === "cross-site" || site === "same-site") return true;
  const origin = req.headers.origin;
  return origin !== undefined && origin !== `${isHttps(req) ? "https" : "http"}://${req.headers.host}`;
}

const authLimits = new Map([
  ["/api/auth/login", 10],
  ["/api/auth/register", 5],
  ["/api/account/password", 10],
  ["/api/auth/password-reset/request", 4],
  ["/api/auth/password-reset/confirm", 10],
  ["/api/account/deletion-request", 5],
]);
const authAttempts = new Map();
const authWindowMs = 60_000;
let authWindow = -1;

function authRetryAfter(req, url) {
  const limit = req.method === "POST" ? authLimits.get(url.pathname) :
    req.method === "PUT" && url.pathname === "/api/account" ? 10 : 0;
  if (!limit) return 0;
  const now = Date.now();
  const window = Math.floor(now / authWindowMs);
  if (window !== authWindow) {
    authAttempts.clear();
    authWindow = window;
  }
  // Caddy supplies this address after removing untrusted forwarded headers.
  const forwarded = req.headers["x-forwarded-for"];
  const client = isHttps(req) && typeof forwarded === "string" && isIP(forwarded)
    ? forwarded : req.socket.remoteAddress;
  const key = `${req.method}:${url.pathname}:${client}`;
  const attempts = authAttempts.get(key) || 0;
  if (attempts >= limit || (!attempts && authAttempts.size >= 4096))
    return Math.ceil(((window + 1) * authWindowMs - now) / 1000);
  authAttempts.set(key, attempts + 1);
  return 0;
}

const repository = createRepository();
const withDataMutation = repository.transaction;
const writeRecords = repository.write;

const MiB = 1024 * 1024;
function storageLimit(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

const mediaLimits = {
  audioFile: 50 * MiB, imageFile: 5 * MiB,
  audioCount: storageLimit("MEDIA_AUDIO_COUNT", 20),
  imageCount: storageLimit("MEDIA_IMAGE_COUNT", 300),
  imageBytes: storageLimit("MEDIA_IMAGES_MIB", 100) * MiB,
  totalBytes: storageLimit("MEDIA_ACCOUNT_MIB", 500) * MiB,
  instanceBytes: storageLimit("MEDIA_INSTANCE_MIB", 512) * MiB,
};
let uploadActive = false;

async function guardedUpload(task) {
  if (uploadActive) {
    throw Object.assign(new Error("Aguarde o término do envio em andamento."), { statusCode: 429 });
  }
  uploadActive = true;
  try { return await task(); }
  finally { uploadActive = false; }
}

async function saveMedia(req, user, file, kind, body) {
  let created = false;
  try {
    await withDataMutation(async () => {
      if (!(await requestUser(req, [user]))) {
        throw Object.assign(new Error("Sua sessão expirou. Entre novamente."), { statusCode: 401 });
      }
      const { rows: [used] } = await repository.query(`SELECT
        count(*) FILTER (WHERE owner_id = $1 AND kind = $2)::int AS kind_count,
        coalesce(sum(size_bytes) FILTER (WHERE owner_id = $1 AND kind = $2), 0)::bigint AS kind_bytes,
        coalesce(sum(size_bytes) FILTER (WHERE owner_id = $1), 0)::bigint AS owner_bytes,
        coalesce(sum(size_bytes), 0)::bigint AS instance_bytes
        FROM media_files`, [user.id, kind]);
      if (used.kind_count >= (kind === "audio" ? mediaLimits.audioCount : mediaLimits.imageCount) ||
          Number(used.owner_bytes) + body.length > mediaLimits.totalBytes ||
          (kind === "image" && Number(used.kind_bytes) + body.length > mediaLimits.imageBytes)) {
        throw Object.assign(new Error("Limite de armazenamento da sua conta atingido."), { statusCode: 409 });
      }
      const disk = await fsp.statfs(dataDir);
      if (Number(used.instance_bytes) + body.length > mediaLimits.instanceBytes ||
          disk.bavail * disk.bsize - body.length < 3 * 1024 * MiB) {
        throw Object.assign(new Error("Armazenamento de mídia temporariamente indisponível."), { statusCode: 409 });
      }
      await fsp.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      const handle = await fsp.open(file, "wx", 0o600);
      created = true;
      try { await handle.writeFile(body); await handle.sync(); }
      finally { await handle.close(); }
      await repository.query("INSERT INTO media_files(path, kind, size_bytes, owner_id) VALUES ($1,$2,$3,$4)",
        [path.relative(dataDir,file).split(path.sep).join("/"),kind,body.length,user.id]);
    });
  } catch (error) {
    if (created) await fsp.unlink(file).catch(() => {});
    throw error;
  }
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
const dummyPasswordHash = hashPassword(randomUUID());
async function ensureDataDirs() {
  dataReadyPromise ??= (async () => {
    const { rows } = await repository.query("SELECT creator_id FROM app_state");
    if (!rows.length) throw Error("Banco não inicializado. Execute a migração.");
    await repository.query("SELECT 1 FROM catalog_snapshots LIMIT 0");
    await repository.query("SELECT 1 FROM auth_sessions LIMIT 0");
    await repository.query("SELECT 1 FROM password_resets LIMIT 0");
    await repository.query("SELECT 1 FROM account_privacy LIMIT 0");
    await repository.query("SELECT 1 FROM account_deletion_requests LIMIT 0");
    await repository.query("SELECT owner_id FROM media_files LIMIT 0");
    creatorUserId = rows[0].creator_id;
    await fsp.mkdir(audioDir, {recursive:true});
    await fsp.mkdir(pageAssetsDir, {recursive:true});
  })();
  return dataReadyPromise;
}
const readUsersFile = () => repository.read(usersFile);
const readAuthFile = () => repository.read(authFile);
const readAccountsFile = () => repository.read(accountsFile);
const readFriendshipsFile = () => repository.read(friendshipsFile);

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

function validateAccountInput(payload) {
  const fullName = String(payload?.fullName || payload?.name || "").trim();
  const birthDate = String(payload?.birthDate || "").trim();
  const city = String(payload?.city || "").trim();
  const email = normalizeEmail(payload?.email);
  const phone = normalizePhone(payload?.phone);
  const age = ageFromBirthDate(birthDate);
  if (fullName.length < 2 || fullName.length > 100)
    throw Object.assign(new Error("Informe seu nome completo (2 a 100 caracteres)."), { statusCode: 400 });
  if (age === null || age < 14)
    throw Object.assign(new Error("O MinhaEstante aceita cadastros a partir de 14 anos."), { statusCode: 400 });
  if (city.length > 100)
    throw Object.assign(new Error("A cidade deve ter até 100 caracteres."), { statusCode: 400 });
  if (!validEmail(email))
    throw Object.assign(new Error("Informe um e-mail válido."), { statusCode: 400 });
  if (phone && (phone.length < 10 || phone.length > 15))
    throw Object.assign(new Error("Informe um telefone válido com DDD."), { statusCode: 400 });
  return { fullName, birthDate, city, email, phone };
}

async function readBody(req, maxBytes = 8 * 1024 * 1024) {
  if (Number(req.headers["content-length"]) > maxBytes)
    throw Object.assign(new Error("Corpo da requisição excede o limite."), { statusCode: 413 });
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
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
  const digest = sessionTokenDigest(cookieValue(req, "booksite_session"));
  if (!digest) return null;
  const { rows: [session] } = await repository.query(
    "SELECT user_id FROM auth_sessions WHERE token_digest = $1 AND expires_at > now()", [digest],
  );
  if (!session) return null;
  const users = all || await repository.readUsers({ userId: session.user_id });
  return users.find(user => String(user.id) === session.user_id) || null;
}

async function issueSession(userId) {
  const token = newSessionToken();
  await repository.query("DELETE FROM auth_sessions WHERE expires_at <= now()");
  await repository.query(
    "INSERT INTO auth_sessions(token_digest, user_id, expires_at) VALUES ($1, $2, now() + make_interval(secs => $3))",
    [sessionTokenDigest(token), userId, SESSION_TTL_SECONDS],
  );
  return token;
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

function publicUser(user, friendships = [], viewerId = null) {
  if (!user) return null;
  const clean = String(user.id) === viewerId ? sanitizeUser(user) : sanitizePublicProfile(user);
  return {
    ...clean,
    isCreator: !!creatorUserId && String(user.id) === creatorUserId,
    social: socialSummary(user.id, friendships),
  };
}

function publicUsers(users, friendships = [], viewerId = null) {
  return (Array.isArray(users) ? users : []).map((user) => publicUser(user, friendships, viewerId));
}

async function visibleFriendships(friendships, viewerId = null) {
  const { rows } = await repository.query("SELECT user_id FROM account_privacy WHERE hide_friends");
  const hidden = new Set(rows.map(row => row.user_id));
  return friendships.filter(({ requesterId, receiverId }) =>
    viewerId === requesterId || viewerId === receiverId || (!hidden.has(requesterId) && !hidden.has(receiverId)));
}

function passwordResetOrigin() {
  try {
    const url = new URL(process.env.PASSWORD_RESET_ORIGIN);
    return url.protocol === "https:" && !url.username && !url.password ? url.origin : "";
  } catch { return ""; }
}

async function queuePasswordReset(email, origin) {
  const token = newSessionToken();
  const found = await withDataMutation(async () => {
    await repository.query("DELETE FROM password_resets WHERE expires_at <= now()");
    const { rowCount } = await repository.query(`
      INSERT INTO password_resets(user_id, token_digest, expires_at)
      SELECT user_id, $2, now() + interval '30 minutes' FROM accounts
      WHERE lower(email) = $1 AND email <> ''
      ON CONFLICT(user_id) DO UPDATE SET token_digest = excluded.token_digest,
        requested_at = now(), expires_at = excluded.expires_at
      WHERE password_resets.requested_at < now() - interval '2 minutes'`, [email, sessionTokenDigest(token)]);
    return rowCount > 0;
  });
  if (!found) return;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.WELCOME_FROM_EMAIL, to: [email],
      subject: "Redefina sua senha do MinhaEstante",
      text: `Abra ${origin}/#/redefinir-senha?token=${token} para redefinir a senha em até 30 minutos. Se você não fez esse pedido, ignore esta mensagem.`,
    }),
  });
  await response.body?.cancel();
  if (!response.ok) {
    await repository.query("DELETE FROM password_resets WHERE token_digest = $1", [sessionTokenDigest(token)]);
    throw new Error("Falha no envio");
  }
}

function mergeUserData(existing, incoming) {
  const clean = sanitizeUser(incoming);
  const tracks = clean.page?.music?.tracks;
  if (tracks !== undefined) {
    if (String(existing.id) !== creatorUserId) {
      throw Object.assign(new Error("Playlist exclusiva do Creator."), { statusCode: 403 });
    }
    if (!Array.isArray(tracks) || tracks.length > MAX_CREATOR_TRACKS) {
      throw Object.assign(new Error("Limite de 20 músicas."), { statusCode: 400 });
    }
  }
  delete clean.isCreator;
  delete clean.creator;
  delete clean.creatorBadge;
  for (const page of [clean.page, clean.page?.mediaPages?.books, clean.page?.mediaPages?.albums]) {
    if (page && "stickers" in page) page.stickers = cleanStickers(page.stickers);
  }
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
      redirect: "error",
      signal: AbortSignal.timeout(8000),
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
    console.warn("MinhaEstante: falha no e-mail de boas-vindas.", error?.name);
    return false;
  }
}

async function authApi(req, res, url) {
  if (!url.pathname.startsWith("/api/auth/")) return false;
  await ensureDataDirs();

  if (req.method === "GET" && url.pathname === "/api/auth/session") {
    const user = await requestUser(req);
    if (!user) {
      json(res, 200, { user: null });
      return true;
    }
    const friendships = await visibleFriendships(await readFriendshipsFile(), user?.id);
    json(res, 200, { user: publicUser(user, friendships, user && String(user.id)) });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/password-reset") {
    json(res, 200, { enabled: Boolean(passwordResetOrigin() && process.env.RESEND_API_KEY && process.env.WELCOME_FROM_EMAIL) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/password-reset/request") {
    const { email } = await readJsonBody(req, 4096) || {};
    const normalized = normalizeEmail(email);
    const origin = passwordResetOrigin();
    if (!origin || !process.env.RESEND_API_KEY || !process.env.WELCOME_FROM_EMAIL) {
      json(res, 503, { error: "A recuperação por e-mail está indisponível no momento." });
      return true;
    }
    if (validEmail(normalized)) {
      const requestId = res.getHeader("X-Request-Id");
      void queuePasswordReset(normalized, origin).catch(() => {
        console.warn(JSON.stringify({ event: "password_reset_delivery_failed", requestId }));
      });
    }
    json(res, 202, { ok: true });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/password-reset/confirm") {
    const { token, password } = await readJsonBody(req, 4096) || {};
    const digest = sessionTokenDigest(token);
    if (!digest || typeof password !== "string" || password.length < 6 || password.length > 200) {
      json(res, 400, { error: "Confira o link e use uma senha de 6 a 200 caracteres." });
      return true;
    }
    const changed = await withDataMutation(async () => {
      const { rows: [reset] } = await repository.query(
        "DELETE FROM password_resets WHERE token_digest = $1 AND expires_at > now() RETURNING user_id", [digest],
      );
      if (!reset) return false;
      await repository.query("UPDATE credentials SET password_hash = $2 WHERE user_id = $1",
        [reset.user_id, await hashPassword(password)]);
      await repository.query("DELETE FROM auth_sessions WHERE user_id = $1", [reset.user_id]);
      return true;
    });
    json(res, changed ? 200 : 400, changed ? { ok: true } : { error: "Link inválido ou expirado." },
      changed ? { "Set-Cookie": clearSessionCookie(isHttps(req)) } : {});
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const payload = await readJsonBody(req, 32 * 1024);
    const identifier = String(payload?.identifier || payload?.username || "").trim().toLowerCase();
    const password = String(payload?.password || "");
    const { rows: [record] } = await repository.query(
      `SELECT user_id, password_hash FROM credentials WHERE user_id = COALESCE(
        (SELECT user_id FROM accounts WHERE lower(email) = $1 AND email <> ''),
        (SELECT id FROM users WHERE username = $1))`,
      [identifier],
    );
    const valid = password.length <= 200 &&
      await verifyPassword(password, record?.password_hash || await dummyPasswordHash);
    if (!record || !valid) {
      json(res, 401, { error: "E-mail, nome de usuário ou senha inválidos." });
      return true;
    }
    const authenticated = await withDataMutation(async () => {
      const { rowCount } = await repository.query(
        "SELECT 1 FROM credentials WHERE user_id = $1 AND password_hash = $2", [record.user_id, record.password_hash],
      );
      if (!rowCount) return null;
      const [user] = await repository.readUsers({ userId: record.user_id });
      return { user, token: await issueSession(user.id) };
    });
    if (!authenticated) {
      json(res, 401, { error: "E-mail, nome de usuário ou senha inválidos." });
      return true;
    }
    const { user, token } = authenticated;
    const friendships = await visibleFriendships(await readFriendshipsFile(), user.id);
    json(
      res,
      200,
      { user: publicUser(user, friendships, String(user.id)) },
      { "Set-Cookie": sessionCookie(token, isHttps(req)) },
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
      accountData = validateAccountInput(payload);
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
      const created = blankUser(username, username);
      const auth = await readAuthFile();
      const passwordHash = await hashPassword(password);
      const createdAccount = accountRecord(created, accountData);
      auth.push(authRecord(created, passwordHash));
      users.push(created);
      accounts.push(createdAccount);
      await writeRecords(authFile, auth);
      await writeRecords(usersFile, users);
      await writeRecords(accountsFile, accounts);
      return { user: created, account: createdAccount, token: await issueSession(created.id) };
    });

    void sendWelcomeEmail(result.account, result.user);
    const friendships = await readFriendshipsFile();
    json(
      res,
      201,
      { user: publicUser(result.user, friendships) },
      { "Set-Cookie": sessionCookie(result.token, isHttps(req)) },
    );
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const digest = sessionTokenDigest(cookieValue(req, "booksite_session"));
    if (digest) await repository.query("DELETE FROM auth_sessions WHERE token_digest = $1", [digest]);
    json(res, 200, { ok: true }, { "Set-Cookie": clearSessionCookie(isHttps(req)) });
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

  if (req.method === "GET" && url.pathname === "/api/account/export") {
    const userId = String(user.id);
    const accounts = await readAccountsFile();
    const friendships = await readFriendshipsFile();
    const pageAssets = await listPageAssetsFor(user);
    const { rows: media } = await repository.query(
      "SELECT kind, path, size_bytes FROM media_files WHERE owner_id = $1 ORDER BY path", [userId],
    );
    const privacy = await accountSafety(userId);
    json(res, 200, {
      exportedAt: new Date().toISOString(),
      account: accounts.find(item => String(item.userId) === userId) || null,
      profile: sanitizeUser(user),
      friendships: friendships.filter(item =>
        String(item.requesterId) === userId || String(item.receiverId) === userId),
      pageAssets,
      media,
      privacy,
    }, { "Content-Disposition": 'attachment; filename="minhaestante-dados.json"' });
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
      if (!(await requestUser(req, [user]))) {
        throw Object.assign(new Error("Sua sessão expirou. Entre novamente."), { statusCode: 401 });
      }
      const accounts = await readAccountsFile();
      const index = accounts.findIndex((item) => String(item.userId) === String(user.id));
      const next = accountRecord(user, { ...nextData, passwordHint: accounts[index]?.passwordHint });
      if (accounts[index]?.email !== next.email) {
        const { rows: [credential] } = await repository.query("SELECT password_hash FROM credentials WHERE user_id = $1", [user.id]);
        if (typeof payload.currentPassword !== "string" || payload.currentPassword.length > 200 ||
            !(await verifyPassword(payload.currentPassword, credential?.password_hash))) {
          throw Object.assign(new Error("Confirme a senha atual para trocar o e-mail."), { statusCode: 403 });
        }
        await repository.query("DELETE FROM password_resets WHERE user_id = $1", [user.id]);
      }
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
      if (index >= 0) accounts[index] = next;
      else accounts.push(next);
      await writeRecords(accountsFile, accounts);
      return next;
    });
    json(res, 200, { ok: true, account: { ...account, username: user.username } });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/account/privacy") {
    json(res, 200, await accountSafety(user.id));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/account/storage") {
    const { rows } = await repository.query(
      "SELECT kind, count(*)::int AS count, sum(size_bytes)::bigint AS bytes FROM media_files WHERE owner_id = $1 GROUP BY kind", [user.id],
    );
    json(res, 200, {
      usage: Object.fromEntries(rows.map(row => [row.kind, { count: row.count, bytes: Number(row.bytes) }])),
      limits: { audioCount: mediaLimits.audioCount, imageCount: mediaLimits.imageCount,
        imageBytes: mediaLimits.imageBytes, totalBytes: mediaLimits.totalBytes },
    });
    return true;
  }

  if (req.method === "PUT" && url.pathname === "/api/account/privacy") {
    const { hideFriends } = await readJsonBody(req, 4096) || {};
    if (typeof hideFriends !== "boolean") {
      json(res, 400, { error: "Escolha a visibilidade da lista de amigos." });
      return true;
    }
    await repository.query(`INSERT INTO account_privacy(user_id, hide_friends) VALUES ($1,$2)
      ON CONFLICT(user_id) DO UPDATE SET hide_friends = excluded.hide_friends`, [user.id, hideFriends]);
    json(res, 200, await accountSafety(user.id));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/account/deletion-request") {
    const { password } = await readJsonBody(req, 4096) || {};
    const safety = await withDataMutation(async () => {
      const { rows: [credential] } = await repository.query("SELECT password_hash FROM credentials WHERE user_id = $1", [user.id]);
      if (!(await requestUser(req, [user])) || typeof password !== "string" || password.length > 200 ||
          !(await verifyPassword(password, credential?.password_hash))) return null;
      await repository.query(
        "INSERT INTO account_deletion_requests(user_id) VALUES ($1) ON CONFLICT(user_id) DO NOTHING", [user.id],
      );
      return accountSafety(user.id);
    });
    json(res, safety ? 202 : 403, safety || { error: "Confirme a senha atual para solicitar a exclusão." });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/account/password") {
    const payload = await readJsonBody(req, 16 * 1024);
    const currentPassword = String(payload?.currentPassword || "");
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
    const token = await withDataMutation(async () => {
      if (!(await requestUser(req, [user]))) {
        throw Object.assign(new Error("Sua sessão expirou. Entre novamente."), { statusCode: 401 });
      }
      const { rows: [credential] } = await repository.query(
        "SELECT password_hash FROM credentials WHERE user_id = $1", [user.id],
      );
      if (!credential) {
        const error = new Error("Credencial da conta não encontrada.");
        error.statusCode = 404;
        throw error;
      }
      if (!currentPassword || currentPassword.length > 200 ||
          !(await verifyPassword(currentPassword, credential.password_hash))) {
        throw Object.assign(new Error("Senha atual incorreta."), { statusCode: 403 });
      }
      await repository.query("UPDATE credentials SET password_hash = $2 WHERE user_id = $1",
        [user.id, await hashPassword(newPassword)]);
      await repository.query("DELETE FROM auth_sessions WHERE user_id = $1", [user.id]);
      await repository.query("DELETE FROM password_resets WHERE user_id = $1", [user.id]);
      return issueSession(user.id);
    });
    json(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(token, isHttps(req)) });
    return true;
  }

  json(res, 404, { error: "Endpoint da conta não encontrado." });
  return true;
}

async function accountSafety(userId) {
  const { rows: [settings] } = await repository.query(`SELECT
    coalesce((SELECT hide_friends FROM account_privacy WHERE user_id = $1), false) AS "hideFriends",
    (SELECT requested_at FROM account_deletion_requests WHERE user_id = $1) AS "deletionRequestedAt"`, [userId]);
  return settings;
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
    const visible = await visibleFriendships(friendships, actor?.id);
    const ids = socialSummary(target.id, visible).friendIds;
    json(res, 200, {
      user: publicUser(target, visible),
      friends: publicUsers(
        ids.map((id) => users.find((item) => String(item.id) === id)).filter(Boolean),
        visible,
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
    const visible = await visibleFriendships(friendships, actor.id);
    const incoming = friendships
      .filter((item) => item.status === "pending" && String(item.receiverId) === String(actor.id))
      .map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        user: publicUser(users.find((user) => String(user.id) === String(item.requesterId)), visible),
      }))
      .filter((item) => item.user);
    const outgoing = friendships
      .filter((item) => item.status === "pending" && String(item.requesterId) === String(actor.id))
      .map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        user: publicUser(users.find((user) => String(user.id) === String(item.receiverId)), visible),
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
      await writeRecords(friendshipsFile, all);
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
      await writeRecords(friendshipsFile, all);
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
      await writeRecords(friendshipsFile, all);
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
  const names = await fsp.readdir(dir).catch(error => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const assets = [];
  for (const name of names) {
    const assetId = safePageAssetId(name);
    if (!assetId) continue;
    const file = path.join(dir, assetId);
    const stat = await fsp.lstat(file).catch(error => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!stat?.isFile()) continue;
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
    const ownerId = safeOwnerId(String(user.id));
    if (!ownerId) {
      json(res, 400, { error: "Conta inválida para upload de imagem." });
      return true;
    }
    const { assetId, body, kind } = await guardedUpload(async () => {
      const raw = await readBody(req, mediaLimits.imageFile);
      const kind = await normalizeImage(raw, req.headers["content-type"]);
      if (!kind || kind.body.length > mediaLimits.imageFile) {
        throw Object.assign(new Error("Envie uma imagem PNG, JPG, WEBP ou GIF válida de até 5 MB."), { statusCode: 400 });
      }
      const assetId = `${randomUUID()}.${kind.ext}`;
      await saveMedia(req, user, path.join(pageAssetsDir, ownerId, assetId), "image", kind.body);
      return { assetId, body: kind.body, kind };
    });
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
    const relative = path.relative(dataDir, file).split(path.sep).join("/");
    const staged = file + "." + randomUUID() + ".pending-delete";
    let moved = false;
    try {
      await withDataMutation(async () => {
        const entry = await repository.query("DELETE FROM media_files WHERE path = $1 AND owner_id = $2 AND kind = 'image'", [relative, user.id]);
        if (!entry.rowCount || !(await requestUser(req, [user]))) {
          throw Object.assign(new Error("Imagem não encontrada."), { statusCode: 404 });
        }
        const [realRoot, realFile, stat] = await Promise.all([fsp.realpath(pageAssetsDir), fsp.realpath(file), fsp.lstat(file)]);
        if (!stat.isFile() || realFile !== path.join(realRoot, ownerId, assetId)) {
          throw Object.assign(new Error("Imagem não encontrada."), { statusCode: 404 });
        }
        await fsp.rename(file, staged);
        moved = true;
      });
    } catch (error) {
      if (moved) await fsp.rename(staged,file);
      throw error;
    }
    await fsp.unlink(staged);
    json(res, 200, { ok: true });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/persistence/users") {
    const users = await readUsersFile();
    const friendships = await readFriendshipsFile();
    const viewer = await requestUser(req, users);
    json(res, 200, { users: publicUsers(users, await visibleFriendships(friendships, viewer?.id), viewer && String(viewer.id)) });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/persistence/home-directory") {
    const { rows } = await repository.query(`SELECT u.id, u.username, u.role,
        jsonb_build_object('title', p.configuration->>'title',
          'displayName', p.configuration->>'displayName') AS page,
        CASE WHEN u.username = 'antonio' THEN coalesce((
          SELECT jsonb_agg(first_post.metadata) FROM (
            SELECT r.metadata FROM user_records r WHERE r.user_id = u.id AND r.category = 'posts'
            ORDER BY r.ordinal LIMIT 1
          ) first_post
        ),'[]'::jsonb) ELSE '[]'::jsonb END AS posts
      FROM users u LEFT JOIN profiles p ON p.user_id = u.id AND p.media = 'legacy'
      ORDER BY u.ordinal`);
    json(res, 200, { users: rows.map(user => ({ ...user, isCreator: user.id === creatorUserId })) });
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
      await writeRecords(usersFile, next);
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
      await writeRecords(usersFile, all);
      return { user: all[index], viewerId: String(actor.id) };
    });
    const visible = await visibleFriendships(await readFriendshipsFile(), savedUser.viewerId);
    json(res, 200, { ok: true, user: publicUser(savedUser.user, visible, savedUser.viewerId) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/persistence/audio") {
    const user = await requestUser(req);
    if (!user) {
      json(res, 401, { error: "Entre para enviar MP3." });
      return true;
    }
    const requestedName = decodeURIComponent(req.headers["x-file-name"] || "");
    if (!/\.mp3$/i.test(requestedName) || req.headers["content-type"] !== "audio/mpeg") {
      json(res, 400, { error: "Escolha um arquivo MP3." });
      return true;
    }
    const id = randomUUID();
    await guardedUpload(async () => {
      const body = await readBody(req, mediaLimits.audioFile);
      if (!validateMp3(body)) {
        throw Object.assign(new Error("O arquivo enviado não parece ser um MP3 válido."), { statusCode: 400 });
      }
      await saveMedia(req, user, path.join(audioDir, `${id}.mp3`), "audio", body);
    });
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
    const { size } = await fsp.stat(file);
    const headers = {
      "Content-Type": "audio/mpeg",
      "Content-Length": size,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Accept-Ranges": "bytes",
    };
    let range;
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/i.exec(req.headers.range);
      const start = match?.[1] ? Number(match[1]) : Math.max(0, size - Number(match?.[2]));
      const end = match?.[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
      if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || start >= size || end < start) {
        res.writeHead(416, { "Content-Range": "bytes */" + size, "Accept-Ranges": "bytes" });
        res.end();
        return true;
      }
      range = { start, end };
      headers["Content-Length"] = end - start + 1;
      headers["Content-Range"] = "bytes " + start + "-" + end + "/" + size;
    }
    res.writeHead(range ? 206 : 200, headers);
    const stream = fs.createReadStream(file, range);
    stream.on("error", () => res.destroy());
    res.on("close", () => stream.destroy());
    stream.pipe(res);
    return true;
  }

  json(res, 404, { error: "Endpoint de persistência não encontrado." });
  return true;
}

await ensureDataDirs();

const server = http.createServer(async (req, res) => {
  const requestId = randomUUID();
  res.setHeader("X-Request-Id", requestId);
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  try {
    const url = new URL(req.url, "http://localhost");
    if (isCrossOriginMutation(req, url)) {
      json(res, 403, { error: "Origem da requisição não autorizada." });
      return;
    }
    const retryAfter = authRetryAfter(req, url);
    if (retryAfter) {
      json(res, 429, { error: "Muitas tentativas. Aguarde e tente novamente." }, { "Retry-After": retryAfter });
      return;
    }
    if (await authApi(req, res, url)) return;
    if (await accountApi(req, res, url)) return;
    if (await socialApi(req, res, url)) return;
    if (await persistenceApi(req, res, url)) return;
    if (await musicProxy(req, res, url)) return;

    const pathname = decodeURIComponent(url.pathname);
    if (/(?:^|\/)(?:\.[^/]+|data|database|scripts|node_modules)(?:\/|$)/.test(pathname.replaceAll("\\", "/"))) {
      res.writeHead(403);
      res.end("Acesso negado");
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      res.end("Método não permitido");
      return;
    }
    const name = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = path.join(root, name);
    const stat = publicFiles.has(name) ? await fsp.lstat(file).catch(error => {
      if (error.code === "ENOENT") return null;
      throw error;
    }) : null;
    if (!stat?.isFile()) {
      res.writeHead(404);
      res.end("Arquivo não encontrado");
      return;
    }
    const etag = `W/"${stat.size.toString(16)}-${stat.ino.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;
    const requestedTags = String(req.headers["if-none-match"] || "").split(",").map(value => value.trim());
    const unchanged = requestedTags.includes("*") || requestedTags.includes(etag) || requestedTags.includes(etag.slice(2));
    res.writeHead(unchanged ? 304 : 200, {
      "Content-Type":
        types[path.extname(file)] + (name.endsWith(".png") ? "" : "; charset=utf-8"),
      "Cache-Control": "public, no-cache",
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
      ...(name === "index.html" ? { "Content-Security-Policy": "frame-ancestors 'none'" } : {}),
    });
    if (unchanged || req.method === "HEAD") {
      res.end();
      return;
    }
    const stream = fs.createReadStream(file);
    stream.on("error", () => res.destroy());
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  } catch (error) {
    const databaseError = typeof error?.severity === "string" || /^(ECONN|ETIMEDOUT|EPIPE)/.test(error?.code || "");
    const knownStatus = !databaseError && Number.isInteger(error?.statusCode) &&
      error.statusCode >= 400 && error.statusCode < 500;
    const status = knownStatus ? error.statusCode : databaseError ? 503 : error instanceof URIError ? 400 : 500;
    if (status >= 500) {
      console.error(JSON.stringify({ event: "request_failed", requestId, status, code: error?.code, type: error?.name }));
    }
    const message = knownStatus ? error.message : {
      400: "Pedido inválido.",
      500: "Não foi possível concluir o pedido.",
      503: "Persistência temporariamente indisponível.",
    }[status];
    if (!res.headersSent) json(res, status, { error: message }, status === 413 ? { Connection: "close" } : {});
    else res.end();
  }
});

server.requestTimeout = 90_000;
server.headersTimeout = 15_000;
server.listen(Number(process.env.PORT || 4183), "127.0.0.1", () =>
  console.log("MinhaEstante: http://127.0.0.1:" + server.address().port),
);
