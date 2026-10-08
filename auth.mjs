import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const HASH_PREFIX = "scrypt-v1";
const HASH_BYTES = 64;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

const b64url = (value) => Buffer.from(value).toString("base64url");

export async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 6 || password.length > 200)
    throw new Error("A senha deve ter entre 6 e 200 caracteres.");
  const salt = randomBytes(16);
  const digest = await scrypt(password, salt, HASH_BYTES);
  return `${HASH_PREFIX}$${b64url(salt)}$${b64url(digest)}`;
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== "string" || typeof encoded !== "string") return false;
  const [prefix, saltPart, digestPart, extra] = encoded.split("$");
  if (prefix !== HASH_PREFIX || !saltPart || !digestPart || extra !== undefined)
    return false;
  let salt, expected;
  try {
    salt = Buffer.from(saltPart, "base64url");
    expected = Buffer.from(digestPart, "base64url");
  } catch {
    return false;
  }
  if (!salt.length || expected.length !== HASH_BYTES) return false;
  const actual = await scrypt(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function sanitizeUser(user) {
  if (!user || typeof user !== "object" || Array.isArray(user)) return user;
  const copy = structuredClone(user);
  delete copy.password;
  delete copy.passwordHash;
  delete copy.auth;
  delete copy.salt;
  return copy;
}

export function sanitizeUsers(users) {
  return Array.isArray(users) ? users.map(sanitizeUser) : [];
}

export function authRecord(user, passwordHash) {
  return {
    userId: String(user.id),
    username: String(user.username || "").toLowerCase(),
    passwordHash,
  };
}

export function createSessionToken(userId, secret, now = Date.now()) {
  const payload = {
    uid: String(userId),
    exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
  };
  const encoded = b64url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifySessionToken(token, secret, now = Date.now()) {
  if (typeof token !== "string") return null;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra !== undefined) return null;
  const expected = createHmac("sha256", secret).update(encoded).digest();
  let received;
  try {
    received = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (received.length !== expected.length || !timingSafeEqual(received, expected))
    return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!payload?.uid || !Number.isFinite(payload.exp)) return null;
    if (payload.exp <= Math.floor(now / 1000)) return null;
    return { userId: String(payload.uid), expiresAt: payload.exp };
  } catch {
    return null;
  }
}

export function sessionCookie(token) {
  return `booksite_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

export const clearSessionCookie = () =>
  "booksite_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0";

export function cookieValue(req, name) {
  const raw = String(req?.headers?.cookie || "");
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    return part.slice(index + 1).trim();
  }
  return "";
}
