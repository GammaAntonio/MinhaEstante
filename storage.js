import { blankUser, seedUsers, SEED_BOOKS, STATUS } from './data.js';
import { ensureMediaPages, syncLegacyBooks } from './page-media.js';
export const KEYS = {
  users: 'booksite_users',
  session: 'booksite_current_user',
  api: 'booksite_api_cache',
  catalog: 'booksite_catalog_cache',
  recent: 'booksite_recent',
};
export function read(key, fallback = null) {
  const value = localStorage.getItem(key);
  if (value === null) return structuredClone(fallback);
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(
      'Dados locais inválidos. Exporte o armazenamento antes de restaurar a demonstração.',
    );
  }
}
let serverPersistenceEnabled = false;
let persistTimer = null;
const pendingUsers = new Map();

async function request(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Servidor respondeu ${response.status}.`);
    error.status = response.status;
    error.payload = payload;
    if (payload.hint) error.hint = payload.hint;
    throw error;
  }
  return payload;
}

export async function refreshUsers() {
  const payload = await request('/api/persistence/users');
  if (!Array.isArray(payload.users)) throw new Error('Resposta de usuários inválida.');
  write(KEYS.users, payload.users);
  serverPersistenceEnabled = true;
  return payload.users;
}

async function persistUserNow(user) {
  return request(`/api/persistence/users/${encodeURIComponent(user.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  });
}

function scheduleUserPersistence(user) {
  if (!serverPersistenceEnabled || !user?.id) return;
  pendingUsers.set(user.id, structuredClone(user));
  clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    const batch = [...pendingUsers.values()];
    pendingUsers.clear();
    try {
      for (const item of batch) await persistUserNow(item);
    } catch (error) {
      console.warn('MinhaEstante: não foi possível salvar no servidor.', error);
      if (error.status === 401) localStorage.removeItem(KEYS.session);
      if (![401, 403].includes(error.status))
        for (const item of batch) pendingUsers.set(item.id, item);
    }
  }, 120);
}

export async function flushUserPersistence(userId) {
  if (!serverPersistenceEnabled || !pendingUsers.has(userId)) return false;
  const user = pendingUsers.get(userId);
  pendingUsers.delete(userId);
  if (!pendingUsers.size) clearTimeout(persistTimer);
  try {
    await persistUserNow(user);
    return true;
  } catch (error) {
    if (error.status === 401) localStorage.removeItem(KEYS.session);
    if (![401, 403].includes(error.status)) scheduleUserPersistence(user);
    throw error;
  }
}

export function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new Error(
      'Não foi possível salvar. O armazenamento pode estar cheio ou bloqueado. Reduza as imagens e tente novamente.',
    );
  }
}

export async function bootstrapStorage() {
  let serverLoaded = false;
  try {
    const payload = await request('/api/persistence/users');
    if (Array.isArray(payload.users)) {
      write(KEYS.users, payload.users);
      serverLoaded = true;
    }
  } catch (error) {
    console.warn('MinhaEstante: servidor de persistência indisponível; usando dados locais.', error);
  }

  initStorage();
  serverPersistenceEnabled = serverLoaded;

  if (!serverLoaded) return;
  try {
    const payload = await request('/api/auth/session');
    if (!payload.user?.id) {
      localStorage.removeItem(KEYS.session);
      return;
    }
    upsertLocalUser(payload.user);
    write(KEYS.session, payload.user.id);
    const all = users();
    const user = all.find((item) => item.id === payload.user.id);
    if (user) {
      let changed = false;
      if (repairBookRelations(user)) changed = true;
      if (repairAlbumRelations(user)) changed = true;
      if (ensureMediaPages(user.page)) changed = true;
      syncLegacyBooks(user.page);
      if (changed) write(KEYS.users, all);
      await persistUserNow(user);
    }
  } catch (error) {
    console.warn('MinhaEstante: não foi possível restaurar a sessão segura.', error);
  }
}

function upsertLocalUser(user) {
  if (!user?.id) return null;
  const all = users();
  const index = all.findIndex((item) => item.id === user.id);
  if (index >= 0) all[index] = structuredClone(user);
  else all.push(structuredClone(user));
  write(KEYS.users, all);
  return all[index >= 0 ? index : all.length - 1];
}

export function initStorage() {
  if (!localStorage.getItem(KEYS.users)) write(KEYS.users, seedUsers());
  if (!localStorage.getItem(KEYS.catalog))
    write(KEYS.catalog, Object.fromEntries(SEED_BOOKS.map((b) => [b.id, b])));
  migrateEarlyDemo();
  migrateBookRelations();
  migrateMediaPages();
}

const bookSnapshot = (book) => {
  if (!book?.id || !book.title) return null;
  return Object.fromEntries(
    [
      "id",
      "type",
      "title",
      "authors",
      "year",
      "coverUrl",
      "fallbackCoverUrl",
      "openLibraryWorkId",
      "openLibraryEditionId",
      "isbn10",
      "isbn13",
    ]
      .filter((key) => book[key] !== undefined)
      .map((key) => [key, structuredClone(book[key])]),
  );
};

export function ensureBookInLibrary(user, book) {
  if (!user || !book?.id) return null;
  user.library ||= [];
  let entry = user.library.find((item) => item.bookId === book.id);
  if (!entry) {
    entry = {
      bookId: book.id,
      status: "",
      favorite: false,
      addedAt: new Date().toISOString(),
    };
    user.library.unshift(entry);
  }
  const snapshot = bookSnapshot(book);
  if (snapshot) entry.book = { ...(entry.book || {}), ...snapshot };
  return entry;
}

function repairBookRelations(user) {
  if (!user) return false;
  user.library ||= [];
  user.ratings ||= {};
  user.reviews ||= [];
  let changed = false;
  const originalLength = user.library.length;
  const entries = new Map();
  for (const item of user.library) {
    if (!item?.bookId) {
      changed = true;
      continue;
    }
    const previous = entries.get(item.bookId);
    if (previous) {
      previous.status ||= item.status || "";
      previous.favorite ||= !!item.favorite;
      previous.addedAt ||= item.addedAt;
      previous.book ||= item.book;
      changed = true;
    } else entries.set(item.bookId, item);
  }
  if (entries.size !== originalLength) user.library = [...entries.values()];

  const referenced = new Set([
    ...Object.keys(user.ratings).filter((id) => Number(user.ratings[id]) > 0),
    ...user.reviews.map((review) => review?.bookId).filter(Boolean),
    ...(user.lists || []).flatMap((list) => list?.bookIds || []).filter(Boolean),
  ]);
  for (const bookId of referenced) {
    if (entries.has(bookId)) continue;
    const entry = {
      bookId,
      status: "",
      favorite: false,
      addedAt:
        user.reviews.find((review) => review.bookId === bookId)?.date ||
        new Date().toISOString(),
    };
    user.library.unshift(entry);
    entries.set(bookId, entry);
    changed = true;
  }

  for (const list of user.lists || []) {
    const unique = [...new Set((list.bookIds || []).filter(Boolean))];
    if (JSON.stringify(unique) !== JSON.stringify(list.bookIds || [])) {
      list.bookIds = unique;
      changed = true;
    }
  }

  for (const entry of user.library) {
    const cached = getBook(entry.bookId);
    const snapshot = bookSnapshot(cached);
    if (!snapshot) continue;
    const next = { ...(entry.book || {}), ...snapshot };
    if (JSON.stringify(entry.book || null) !== JSON.stringify(next)) {
      entry.book = next;
      changed = true;
    }
  }
  return changed;
}

function migrateBookRelations() {
  const all = users();
  let changed = false;
  for (const user of all) if (repairBookRelations(user)) changed = true;
  if (changed) write(KEYS.users, all);
}


const ALBUM_CACHE_KEY = "booksite_album_catalog";
export const albumSnapshot = (album) => {
  if (!album?.id || !album.title) return null;
  return Object.fromEntries(
    [
      "id",
      "type",
      "source",
      "title",
      "artist",
      "artistId",
      "authors",
      "year",
      "releaseDate",
      "primaryType",
      "secondaryTypes",
      "genres",
      "tags",
      "coverUrl",
      "coverLarge",
      "trackCount",
      "tracks",
      "releases",
      "detailsLoaded",
      "musicBrainzReleaseGroupId",
      "releaseId",
      "appleId",
      "country",
      "label",
      "barcode",
    ]
      .filter((key) => album[key] !== undefined)
      .map((key) => [key, structuredClone(album[key])]),
  );
};

export function repairAlbumRelations(user) {
  if (!user) return false;
  const empty = {
    type: "album",
    library: [],
    ratings: {},
    trackRatings: {},
    reviews: [],
    lists: [],
    audio: {},
    snapshots: {},
  };
  if (!user.albums || typeof user.albums !== "object") user.albums = structuredClone(empty);
  const state = user.albums;
  let changed = false;
  for (const [key, fallback] of Object.entries(empty)) {
    if (state[key] === undefined || state[key] === null) {
      state[key] = structuredClone(fallback);
      changed = true;
    }
  }

  const entries = new Map();
  for (const item of Array.isArray(state.library) ? state.library : []) {
    if (!item?.albumId) {
      changed = true;
      continue;
    }
    const previous = entries.get(item.albumId);
    if (previous) {
      previous.status ||= item.status || "";
      previous.favorite ||= !!item.favorite;
      previous.addedAt ||= item.addedAt;
      previous.album ||= item.album;
      changed = true;
    } else entries.set(item.albumId, item);
  }
  if (entries.size !== state.library.length) state.library = [...entries.values()];

  const referenced = new Set([
    ...Object.keys(state.ratings || {}).filter((id) => Number(state.ratings[id]) > 0),
    ...Object.keys(state.trackRatings || {}).filter((id) => Object.keys(state.trackRatings[id] || {}).length),
    ...(state.reviews || []).map((review) => review?.albumId).filter(Boolean),
    ...(state.lists || []).flatMap((list) => list?.albumIds || []).filter(Boolean),
    ...Object.keys(state.audio || {}).filter((id) => state.audio[id]?.fileId || state.audio[id]?.url),
  ]);
  for (const albumId of referenced) {
    if (entries.has(albumId)) continue;
    const entry = {
      type: "album",
      albumId,
      status: "",
      favorite: false,
      addedAt:
        (state.reviews || []).find((review) => review.albumId === albumId)?.date ||
        new Date().toISOString(),
    };
    state.library.unshift(entry);
    entries.set(albumId, entry);
    changed = true;
  }

  const cache = read(ALBUM_CACHE_KEY, {});
  state.snapshots ||= {};
  for (const entry of state.library) {
    const snapshot = albumSnapshot(cache[entry.albumId] || entry.album || state.snapshots[entry.albumId]);
    if (!snapshot) continue;
    const before = JSON.stringify(entry.album || null);
    const merged = { ...(state.snapshots[entry.albumId] || {}), ...(entry.album || {}), ...snapshot };
    entry.album = merged;
    state.snapshots[entry.albumId] = merged;
    if (before !== JSON.stringify(merged)) changed = true;
  }
  for (const list of state.lists || []) {
    const unique = [...new Set((list.albumIds || []).filter(Boolean))];
    if (JSON.stringify(unique) !== JSON.stringify(list.albumIds || [])) {
      list.albumIds = unique;
      changed = true;
    }
    for (const albumId of unique) {
      const snapshot = albumSnapshot(cache[albumId] || state.snapshots[albumId]);
      if (!snapshot) continue;
      const next = { ...(state.snapshots[albumId] || {}), ...snapshot };
      if (JSON.stringify(state.snapshots[albumId] || null) !== JSON.stringify(next)) {
        state.snapshots[albumId] = next;
        changed = true;
      }
    }
  }
  return changed;
}


function repairAdvancedWallCode(page, media) {
  const wall = page?.customCode?.sections?.wall;
  if (!wall?.html || typeof wall.html !== "string") return false;
  const before = wall.html;
  if (media === "albums") {
    const first = wall.html.indexOf("{{albumContent}}");
    if (first >= 0) {
      const tail = wall.html.slice(first + "{{albumContent}}".length);
      wall.html =
        wall.html.slice(0, first + "{{albumContent}}".length) +
        tail.replace(/\n\{\{albumContent\}\}(?=\n<\/main>\s*$)/, "");
    }
  } else {
    wall.html = wall.html.replace(/\n\{\{albumContent\}\}(?=\n<\/main>\s*$)/, "");
  }
  return wall.html !== before;
}

function migrateMediaPages() {
  const all = users();
  let changed = false;
  for (const u of all) {
    if (ensureMediaPages(u.page)) changed = true;
    if (repairAdvancedWallCode(u.page.mediaPages.books, "books")) changed = true;
    if (repairAdvancedWallCode(u.page.mediaPages.albums, "albums")) changed = true;
    syncLegacyBooks(u.page);
    if (repairAlbumRelations(u)) changed = true;
  }
  if (changed) write(KEYS.users, all);
}
// Corrige referências de uma prévia inicial sem apagar leituras ou textos já escritos.
function migrateEarlyDemo() {
  const old = read(KEYS.catalog, {}),
    mapping = {};
  for (const book of Object.values(old)) {
    const verified = SEED_BOOKS.find((b) => b.title === book.title);
    if (book.source === 'local' && verified && book.id !== verified.id)
      mapping[book.id] = verified.id;
  }
  if (!Object.keys(mapping).length) return;
  const corrected = Object.fromEntries(Object.entries(old).filter(([id]) => !mapping[id]));
  for (const [oldId, newId] of Object.entries(mapping))
    corrected[newId] = SEED_BOOKS.find((b) => b.id === newId);
  const all = users();
  for (const u of all) {
    for (const item of [...u.library, ...u.reviews, ...u.activity])
      if (mapping[item.bookId]) item.bookId = mapping[item.bookId];
    u.ratings = Object.fromEntries(
      Object.entries(u.ratings).map(([id, n]) => [mapping[id] || id, n]),
    );
    for (const item of [...u.lists, ...u.posts, ...u.journal])
      item.bookIds = item.bookIds.map((id) => mapping[id] || id);
    for (const g of u.page.gadgets) if (mapping[g.bookId]) g.bookId = mapping[g.bookId];
  }
  write(KEYS.catalog, corrected);
  write(KEYS.users, all);
  write(
    KEYS.recent,
    read(KEYS.recent, []).map((id) => mapping[id] || id),
  );
}
export const users = () => read(KEYS.users, []);
export const currentUser = () => users().find((u) => u.id === read(KEYS.session)) || null;
export const userByName = (name) => users().find((u) => u.username === name);

export async function login(identifier, password) {
  const payload = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: String(identifier || '').trim().toLowerCase(), password }),
  });
  if (!payload.user?.id) throw new Error('Resposta de login inválida.');
  const user = upsertLocalUser(payload.user);
  write(KEYS.session, user.id);
  serverPersistenceEnabled = true;
  return user;
}

export function logout() {
  localStorage.removeItem(KEYS.session);
  request('/api/auth/logout', { method: 'POST' }).catch(() => {});
}

export async function register(data) {
  const payload = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
  });
  if (!payload.user?.id) throw new Error('Resposta de cadastro inválida.');
  const user = upsertLocalUser(payload.user);
  ensureMediaPages(user.page);
  write(KEYS.session, user.id);
  serverPersistenceEnabled = true;
  return user;
}

export async function account() {
  const payload = await request('/api/account');
  if (!payload.account) throw new Error('Dados da conta indisponíveis.');
  return payload.account;
}

export async function updateAccount(data) {
  const payload = await request('/api/account', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
  });
  return payload.account;
}

export async function changePassword(newPassword, confirmPassword) {
  return request('/api/account/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword, confirmPassword }),
  });
}

export async function friends(userId) {
  const payload = await request(`/api/social/friends?userId=${encodeURIComponent(userId || '')}`);
  return Array.isArray(payload.friends) ? payload.friends : [];
}

export async function friendState(userId) {
  return request(`/api/social/state?userId=${encodeURIComponent(userId || '')}`);
}

export async function friendRequests() {
  return request('/api/social/requests');
}

async function socialMutation(path, body) {
  const payload = await request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  await refreshUsers();
  return payload;
}

export const sendFriendRequest = (userId) =>
  socialMutation('/api/social/request', { userId });
export const acceptFriendRequest = (friendshipId) =>
  socialMutation('/api/social/accept', { friendshipId });
export const rejectFriendRequest = (friendshipId) =>
  socialMutation('/api/social/reject', { friendshipId });
export const removeFriend = (userId) =>
  socialMutation('/api/social/remove', { userId });

export function updateUser(id, mutate) {
  const viewer = currentUser();
  if (!viewer || viewer.id !== id) throw new Error('Você só pode editar sua própria página.');
  const all = users(),
    u = all.find((x) => x.id === id);
  if (!u) throw new Error('Conta não encontrada.');
  mutate(u);
  repairBookRelations(u);
  repairAlbumRelations(u);
  write(KEYS.users, all);
  scheduleUserPersistence(u);
  return u;
}

export function resetUser(id) {
  if (currentUser()?.role !== 'admin') throw new Error('Acesso restrito ao administrador.');
  const all = users(),
    index = all.findIndex((u) => u.id === id);
  if (index < 0) throw new Error('Conta não encontrada.');
  const old = all[index];
  if (old.role === 'admin') throw new Error('A conta administradora não pode ser resetada.');
  all[index] = {
    ...blankUser(old.username, old.page.displayName, old.role),
    id: old.id,
    createdAt: old.createdAt,
  };
  ensureMediaPages(all[index].page);
  write(KEYS.users, all);
  scheduleUserPersistence(all[index]);
}
if (typeof addEventListener === 'function') {
  addEventListener('pagehide', () => {
    if (!serverPersistenceEnabled || !pendingUsers.size) return;
    const snapshot = [...pendingUsers.values()];
    pendingUsers.clear();
    for (const user of snapshot) {
      fetch(`/api/persistence/users/${encodeURIComponent(user.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
        keepalive: true,
      }).catch(() => {});
    }
  });
}

export const uid = () => (globalThis.crypto?.randomUUID?.() ?? (globalThis.crypto?.getRandomValues ? Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("") : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`));
export function activity(u, text, bookId = '') {
  u.activity.unshift({ id: uid(), text, bookId, date: new Date().toISOString() });
  u.activity = u.activity.slice(0, 200);
}
export const catalog = () => read(KEYS.catalog, {});
export const getBook = (id) => catalog()[id] || null;
export const bookForUser = (user, id) =>
  getBook(id) || user?.library?.find((entry) => entry.bookId === id)?.book || null;
export function cacheBooks(books) {
  const all = catalog();
  for (const b of books) all[b.id] = { ...all[b.id], ...b };
  write(KEYS.catalog, all);
}
export function visitBook(id) {
  write(KEYS.recent, [id, ...read(KEYS.recent, []).filter((x) => x !== id)].slice(0, 24));
}
export function setBookStatus(book, status) {
  if (!Object.hasOwn(STATUS, status)) throw new Error('Estante inválida.');
  const u = currentUser();
  if (!u) throw new Error('Entre para organizar seus livros.');
  return updateUser(u.id, (d) => {
    const e = ensureBookInLibrary(d, book);
    if (e.status === status) return;
    e.status = status;
    activity(
      d,
      `${status === 'lidos' ? 'terminou' : status === 'lendo' ? 'começou a ler' : status === 'abandonados' ? 'abandonou' : 'quer ler'} ${book.title}.`,
      book.id,
    );
  });
}
export function toggleFavorite(book) {
  const u = currentUser();
  if (!u) throw new Error('Entre para guardar favoritos.');
  return updateUser(u.id, (d) => {
    const e = ensureBookInLibrary(d, book);
    e.favorite = !e.favorite;
    activity(
      d,
      `${e.favorite ? 'adicionou aos' : 'retirou dos'} favoritos: ${book.title}.`,
      book.id,
    );
  });
}
export function rateBook(book, rating) {
  const u = currentUser();
  if (!u) throw new Error('Entre para avaliar.');
  if (
    !Number.isFinite(rating) ||
    (rating !== 0 && (rating < 0.5 || rating > 5 || (rating * 2) % 1))
  )
    throw new Error('Nota inválida.');
  return updateUser(u.id, (d) => {
    if (rating) {
      ensureBookInLibrary(d, book);
      d.ratings[book.id] = rating;
    }
    else delete d.ratings[book.id];
    d.reviews.filter((r) => r.bookId === book.id).forEach((r) => (r.rating = rating || null));
    activity(
      d,
      rating ? `deu ${rating} estrelas para ${book.title}.` : `removeu a nota de ${book.title}.`,
      book.id,
    );
  });
}

function pageVariants(user) {
  const variants = [user?.page, ...Object.values(user?.page?.mediaPages || {})];
  return [...new Set(variants.filter(Boolean))];
}

export function removeBookFromUser(user, bookId) {
  if (!user || !bookId) return user;
  user.library = (user.library || []).filter((item) => item.bookId !== bookId);
  if (user.ratings) delete user.ratings[bookId];
  user.reviews = (user.reviews || []).filter((review) => review.bookId !== bookId);
  for (const list of user.lists || [])
    list.bookIds = (list.bookIds || []).filter((id) => id !== bookId);
  for (const entry of [...(user.posts || []), ...(user.journal || [])])
    entry.bookIds = (entry.bookIds || []).filter((id) => id !== bookId);
  user.activity = (user.activity || []).filter((item) => item.bookId !== bookId);
  for (const page of pageVariants(user))
    for (const gadget of page.gadgets || [])
      if (gadget.bookId === bookId) gadget.bookId = "";
  return user;
}

export function removeBookFromShelf(bookId) {
  const user = currentUser();
  if (!user) throw new Error("Entre para organizar seus livros.");
  return updateUser(user.id, (draft) => removeBookFromUser(draft, bookId));
}
