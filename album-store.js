import {
  read,
  write,
  currentUser,
  updateUser,
  uid,
  albumSnapshot,
} from "./storage.js";

export const ALBUM_CACHE = "booksite_album_catalog";
export const ALBUM_STATUS = {
  ouvido: "Ouvido",
  ouvindo: "Ouvindo",
  "quero-ouvir": "Quero ouvir",
};

export const albumCatalog = () => read(ALBUM_CACHE, {});
export const getAlbum = (id) => albumCatalog()[id] || null;

export function cacheAlbums(albums) {
  const all = albumCatalog();
  for (const album of albums)
    if (album?.id) all[album.id] = { ...all[album.id], ...album, type: "album" };
  write(ALBUM_CACHE, all);
}

export function albumState(user) {
  return (
    user?.albums || {
      type: "album",
      library: [],
      ratings: {},
      trackRatings: {},
      reviews: [],
      lists: [],
      audio: {},
      snapshots: {},
    }
  );
}

export function rememberAlbum(state, album) {
  if (!state || !album?.id) return null;
  state.snapshots ||= {};
  const snapshot = albumSnapshot(album);
  if (!snapshot) return state.snapshots[album.id] || null;
  state.snapshots[album.id] = {
    ...(state.snapshots[album.id] || {}),
    ...snapshot,
  };
  const item = state.library?.find((entry) => entry.albumId === album.id);
  if (item) item.album = { ...(item.album || {}), ...state.snapshots[album.id] };
  return state.snapshots[album.id];
}

export function resolveAlbum(user, id) {
  if (!id) return null;
  const state = albumState(user);
  return (
    getAlbum(id) ||
    state.snapshots?.[id] ||
    state.library?.find((item) => item.albumId === id)?.album ||
    null
  );
}

export function mutateAlbums(mutator) {
  const user = currentUser();
  if (!user) throw new Error("Entre para organizar seus álbuns.");
  return updateUser(user.id, (draft) => {
    draft.albums ||= structuredClone(albumState(null));
    draft.albums.trackRatings ||= {};
    draft.albums.snapshots ||= {};
    mutator(draft.albums, draft);
  });
}

export function albumActivity(user, album, text) {
  user.activity.unshift({
    id: uid(),
    type: "album",
    albumId: album.id,
    text,
    date: new Date().toISOString(),
  });
  user.activity = user.activity.slice(0, 200);
}

function entry(state, album) {
  let item = state.library.find((item) => item.albumId === album.id);
  if (!item) {
    item = {
      type: "album",
      albumId: album.id,
      status: "",
      favorite: false,
      addedAt: new Date().toISOString(),
    };
    state.library.unshift(item);
  }
  rememberAlbum(state, album);
  return item;
}

export function ensureAlbumInLibrary(state, album) {
  if (!state || !album?.id) return null;
  return entry(state, album);
}

export function setAlbumStatus(album, status) {
  if (!Object.hasOwn(ALBUM_STATUS, status))
    throw new Error("Status de álbum inválido.");
  cacheAlbums([album]);
  return mutateAlbums((state, user) => {
    const item = entry(state, album);
    if (item.status === status) return;
    item.status = status;
    albumActivity(
      user,
      album,
      `${status === "ouvido" ? "ouviu" : status === "ouvindo" ? "está ouvindo" : "quer ouvir"} ${album.title}.`,
    );
  });
}

export function favoriteAlbum(album) {
  cacheAlbums([album]);
  return mutateAlbums((state, user) => {
    const item = entry(state, album);
    item.favorite = !item.favorite;
    albumActivity(
      user,
      album,
      `${item.favorite ? "adicionou aos" : "retirou dos"} favoritos: ${album.title}.`,
    );
  });
}

export function rateAlbum(album, rating) {
  if (
    !Number.isFinite(rating) ||
    (rating !== 0 && (rating < 0.5 || rating > 5 || (rating * 2) % 1))
  )
    throw new Error("Nota inválida.");
  cacheAlbums([album]);
  return mutateAlbums((state, user) => {
    entry(state, album);
    if (rating) state.ratings[album.id] = rating;
    else delete state.ratings[album.id];
    state.reviews
      .filter((r) => r.albumId === album.id)
      .forEach((r) => (r.rating = rating || null));
    albumActivity(
      user,
      album,
      rating
        ? `deu ${rating} estrelas para ${album.title}.`
        : `removeu a nota de ${album.title}.`,
    );
  });
}

export function rateTrack(album, track, rating) {
  if (
    !Number.isFinite(rating) ||
    (rating !== 0 && (rating < 0.5 || rating > 5 || (rating * 2) % 1))
  )
    throw new Error("Nota de faixa inválida.");
  cacheAlbums([album]);
  const trackId =
    track.recordingId || track.id || `${album.id}-${track.disc || 1}-${track.position}-${track.title}`;
  return mutateAlbums((state) => {
    entry(state, album);
    state.trackRatings ||= {};
    state.trackRatings[album.id] ||= {};
    if (rating) state.trackRatings[album.id][trackId] = rating;
    else delete state.trackRatings[album.id][trackId];
    if (!Object.keys(state.trackRatings[album.id]).length)
      delete state.trackRatings[album.id];
  });
}

export function trackRating(user, albumId, track) {
  const trackId =
    track.recordingId || track.id || `${albumId}-${track.disc || 1}-${track.position}-${track.title}`;
  return albumState(user).trackRatings?.[albumId]?.[trackId] || 0;
}

export function removeAlbumFromUser(user, albumId) {
  if (!user || !albumId) return user;
  const state = user.albums;
  if (state) {
    state.library = (state.library || []).filter((item) => item.albumId !== albumId);
    if (state.ratings) delete state.ratings[albumId];
    if (state.trackRatings) delete state.trackRatings[albumId];
    if (state.audio) delete state.audio[albumId];
    if (state.snapshots) delete state.snapshots[albumId];
    state.reviews = (state.reviews || []).filter((review) => review.albumId !== albumId);
    for (const list of state.lists || [])
      list.albumIds = (list.albumIds || []).filter((id) => id !== albumId);
  }
  user.activity = (user.activity || []).filter((item) => item.albumId !== albumId);
  const pages = [user.page, ...Object.values(user.page?.mediaPages || {})];
  for (const page of new Set(pages.filter(Boolean)))
    for (const gadget of page.gadgets || []) {
      if (gadget.albumId === albumId) gadget.albumId = "";
      if (gadget.bookId === albumId) gadget.bookId = "";
    }
  return user;
}

export function removeAlbumFromCollection(albumId) {
  const user = currentUser();
  if (!user) throw new Error("Entre para organizar seus álbuns.");
  return updateUser(user.id, (draft) => removeAlbumFromUser(draft, albumId));
}

export const userAlbums = (user, predicate = () => true) =>
  albumState(user)
    .library.filter(predicate)
    .map((item) => resolveAlbum(user, item.albumId))
    .filter(Boolean);
