import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAlbum,
  normalizeTracks,
  chooseRelease,
  MusicBrainzService,
} from "../music-api.js";
import {
  initStorage,
  currentUser,
  userByName,
  users,
  write,
  KEYS,
} from "../storage.js";
import { blankUser } from "../data.js";
import {
  albumState,
  rateAlbum,
  setAlbumStatus,
  favoriteAlbum,
  mutateAlbums,
  rateTrack,
  trackRating,
  removeAlbumFromCollection,
  resolveAlbum,
  userAlbums,
  ALBUM_CACHE,
} from "../album-store.js";
globalThis.localStorage = {
  data: new Map(),
  getItem(k) {
    return this.data.get(k) ?? null;
  },
  setItem(k, v) {
    this.data.set(k, String(v));
  },
  removeItem(k) {
    this.data.delete(k);
  },
};
const ensureTestUsers = () => {
  const all = users();
  if (!all.some((u) => u.username === "maria")) {
    all.push(blankUser("maria", "Maria Carolina"));
    write(KEYS.users, all);
  }
};
const signIn = (username) => write(KEYS.session, userByName(username).id);
const signOut = () => localStorage.removeItem(KEYS.session);
const group = {
  id: "76620c3a-d5be-4e28-8a9d-4fba42406ea4",
  title: "Ciano",
  "first-release-date": "2006-06-01",
  "primary-type": "Album",
  "artist-credit": [{ name: "Fresno", artist: { id: "artist" } }],
};
test("álbum conceitual mantém identidade do release-group e faixas completas em vários discos", () => {
  const album = normalizeAlbum(group);
  assert.equal(album.type, "album");
  assert.equal(album.artist, "Fresno");
  assert.equal(album.year, 2006);
  const tracks = normalizeTracks({
    media: [
      {
        position: 1,
        tracks: [
          {
            id: "a",
            position: 1,
            title: "Quebre as correntes",
            length: 219000,
          },
        ],
      },
      {
        position: 2,
        tracks: [
          {
            id: "b",
            position: 1,
            recording: { id: "r", title: "Outra faixa", length: 60000 },
          },
        ],
      },
    ],
  });
  assert.equal(tracks.length, 2);
  assert.equal(tracks[0].durationFormatted, "3:39");
  assert.equal(tracks[1].disc, 2);
  assert.equal(tracks[1].title, "Outra faixa");
  assert.equal(
    chooseRelease(
      [
        { id: "live", status: "Bootleg", date: "2005" },
        {
          id: "official",
          status: "Official",
          date: "2006",
          media: [{ "track-count": 14 }],
        },
      ],
      "2006",
    ).id,
    "official",
  );
});
test("notas, coleção, favoritos e MP3 de álbuns persistem separados dos livros e das outras contas", () => {
  initStorage();
  ensureTestUsers();
  signIn("antonio");
  const books = JSON.stringify(currentUser().library);
  const album = normalizeAlbum(group);
  setAlbumStatus(album, "ouvido");
  rateAlbum(album, 4.5);
  favoriteAlbum(album);
  mutateAlbums((s) => {
    s.audio[album.id] = { fileId: "local-test", enabled: true };
  });
  assert.equal(albumState(currentUser()).ratings[album.id], 4.5);
  assert.equal(albumState(currentUser()).library[0].favorite, true);
  assert.equal(JSON.stringify(currentUser().library), books);
  assert.throws(() => rateAlbum(album, 4.2));
  assert.throws(() => rateAlbum(album, 6));
  signOut();
  signIn("maria");
  assert.equal(albumState(currentUser()).library.length, 0);
  assert.equal(albumState(currentUser()).audio[album.id], undefined);
  signOut();
  signIn("antonio");
  assert.equal(albumState(currentUser()).audio[album.id].fileId, "local-test");
  assert.equal(albumState(userByName("antonio")).ratings[album.id], 4.5);
});


test("álbum salvo continua visível quando o cache de busca some", () => {
  localStorage.data.clear();
  initStorage();
  signIn("antonio");
  const album = normalizeAlbum(group);
  setAlbumStatus(album, "ouvido");
  const before = currentUser();
  assert.equal(before.albums.library[0].album.title, "Ciano");
  assert.equal(before.albums.snapshots[album.id].artist, "Fresno");

  localStorage.removeItem(ALBUM_CACHE);
  const after = currentUser();
  assert.equal(resolveAlbum(after, album.id).title, "Ciano");
  assert.equal(userAlbums(after)[0].artist, "Fresno");
});

test("lista legada de álbuns repara coleção, snapshot e IDs duplicados", () => {
  localStorage.data.clear();
  initStorage();
  signIn("antonio");
  const album = normalizeAlbum(group);
  const { cacheAlbums } = { cacheAlbums: (albums) => {
    const all = JSON.parse(localStorage.getItem(ALBUM_CACHE) || "{}");
    for (const item of albums) all[item.id] = item;
    localStorage.setItem(ALBUM_CACHE, JSON.stringify(all));
  }};
  cacheAlbums([album]);
  mutateAlbums((state) => {
    state.lists.push({ id: "legacy-list", albumIds: [album.id, album.id] });
  });
  const state = albumState(currentUser());
  assert.deepEqual(state.lists[0].albumIds, [album.id]);
  assert.equal(state.library.some((item) => item.albumId === album.id), true);
  assert.equal(state.snapshots[album.id].title, "Ciano");
});

test("nota de faixa sozinha cria relação persistente com o álbum", () => {
  localStorage.data.clear();
  initStorage();
  signIn("antonio");
  const album = normalizeAlbum(group);
  const track = { recordingId: "recording-solo", disc: 1, position: 1, title: "Faixa" };
  rateTrack(album, track, 4);
  const state = albumState(currentUser());
  assert.equal(state.library.some((item) => item.albumId === album.id), true);
  assert.equal(state.snapshots[album.id].title, album.title);
  assert.equal(trackRating(currentUser(), album.id, track), 4);
});

test("avaliações de faixas persistem separadas da nota geral do álbum", () => {
  localStorage.data.clear();
  initStorage();
  signIn("antonio");
  const album = normalizeAlbum(group);
  const track = { id: "track-1", recordingId: "recording-1", disc: 1, position: 1, title: "A Resposta" };
  rateAlbum(album, 5);
  rateTrack(album, track, 4.5);
  assert.equal(albumState(currentUser()).ratings[album.id], 5);
  assert.equal(trackRating(currentUser(), album.id, track), 4.5);
  rateTrack(album, track, 0);
  assert.equal(trackRating(currentUser(), album.id, track), 0);
  assert.equal(albumState(currentUser()).ratings[album.id], 5);
});
test("remover álbum apaga dados pessoais em cascata e readição começa limpa", () => {
  localStorage.data.clear();
  initStorage();
  signIn("antonio");
  const album = normalizeAlbum(group);
  const otherId = "album-outro";
  const track = { recordingId: "track-one", disc: 1, position: 1, title: "Faixa" };
  setAlbumStatus(album, "ouvido");
  favoriteAlbum(album);
  rateAlbum(album, 5);
  rateTrack(album, track, 4.5);
  mutateAlbums((state, user) => {
    state.reviews.push({ id: "review", albumId: album.id, rating: 5, text: "texto" });
    state.lists.push(
      { id: "one", albumIds: [album.id, otherId] },
      { id: "two", albumIds: [album.id] },
    );
    state.audio[album.id] = { fileId: "server:album", enabled: true };
    user.activity.push({ id: "other", albumId: otherId, text: "outro álbum" });
    user.page.mediaPages.albums.gadgets.find((g) => g.type === "month").albumId = album.id;
  });
  const backgroundMusic = structuredClone(currentUser().page.music);

  removeAlbumFromCollection(album.id);
  let user = currentUser(), state = albumState(user);
  assert.equal(state.library.some((item) => item.albumId === album.id), false);
  assert.equal(state.ratings[album.id], undefined);
  assert.equal(state.trackRatings[album.id], undefined);
  assert.equal(state.reviews.some((item) => item.albumId === album.id), false);
  assert.deepEqual(state.lists.map((list) => list.albumIds), [[otherId], []]);
  assert.equal(state.audio[album.id], undefined);
  assert.equal(user.activity.some((item) => item.albumId === album.id), false);
  assert.equal(user.activity.some((item) => item.albumId === otherId), true);
  assert.deepEqual(user.page.music, backgroundMusic);
  assert.equal(user.page.mediaPages.albums.gadgets.find((g) => g.type === "month").albumId, "");

  signOut();
  signIn("antonio");
  assert.equal(albumState(currentUser()).ratings[album.id], undefined);
  setAlbumStatus(album, "ouvindo");
  user = currentUser(); state = albumState(user);
  assert.equal(state.library.find((item) => item.albumId === album.id).favorite, false);
  assert.equal(state.ratings[album.id], undefined);
  assert.equal(state.trackRatings[album.id], undefined);
  assert.equal(state.reviews.some((item) => item.albumId === album.id), false);
});
test("busca musical deduplica requisições e resultados e reaproveita cache", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return {
      ok: true,
      json: async () => ({ "release-groups": [group, group], count: 2 }),
    };
  };
  try {
    const [a, b] = await Promise.all([
      MusicBrainzService.search("Ciano Fresno"),
      MusicBrainzService.search("Ciano Fresno"),
    ]);
    assert.equal(calls, 1);
    assert.equal(a.albums.length, 1);
    assert.equal(b.albums[0].id, a.albums[0].id);
    await MusicBrainzService.search("Ciano Fresno");
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("iTunes fallback is used only after an empty MusicBrainz response", async () => {
  const original = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return {
      ok: true,
      json: async () =>
        String(url).includes("musicbrainz")
          ? { "release-groups": [], count: 0 }
          : {
              results: [
                {
                  collectionId: 123,
                  collectionName: "Fallback",
                  artistName: "Artist",
                  releaseDate: "2000-01-01",
                  artworkUrl100: "https://example.com/100x100bb.jpg",
                },
              ],
            },
    };
  };
  try {
    const result = await MusicBrainzService.search("Fallback test unique");
    assert.equal(result.source, "itunes");
    assert.equal(result.albums[0].type, "album");
    assert.equal(urls.length, 2);
    assert.ok(urls[0].includes("musicbrainz"));
    assert.ok(urls[1].includes("itunes.apple.com"));
  } finally {
    globalThis.fetch = original;
  }
});
