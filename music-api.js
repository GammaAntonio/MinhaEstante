import { read, write } from "./storage.js";
import { cacheAlbums, getAlbum, albumCatalog } from "./album-store.js";
const KEY = "booksite_music_api_cache",
  TTL = 3600000;
let queue = Promise.resolve(),
  last = 0;
const pending = new Map();
const artist = (credit) =>
  (credit || [])
    .map((c) => (c.name || c.artist?.name || "") + (c.joinphrase || ""))
    .join("");
const clean = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const https = (url) => String(url || "").replace(/^http:/, "https:");
async function json(url, musicbrainz = false) {
  const cached = read(KEY, {})[url];
  if (cached && Date.now() - cached.time < TTL) return cached.data;
  if (pending.has(url)) return pending.get(url);
  const task = queue
    .catch(() => {})
    .then(async () => {
      if (musicbrainz) {
        const delay = 1100 - (Date.now() - last);
        if (delay > 0)
          await new Promise((resolve) => setTimeout(resolve, delay));
        last = Date.now();
      }
      const response = await fetch(url, { signal: AbortSignal.timeout(22000) });
      if (!response.ok)
        throw new Error(`Serviço musical respondeu ${response.status}.`);
      const data = await response.json();
      try {
        write(KEY, {
          ...Object.fromEntries(
            Object.entries(read(KEY, {}))
              .filter(([, e]) => Date.now() - e.time < TTL)
              .slice(-80),
          ),
          [url]: { time: Date.now(), data },
        });
      } catch {}
      return data;
    });
  queue = task;
  pending.set(url, task);
  try {
    return await task;
  } finally {
    pending.delete(url);
  }
}
const mb = (resource, params = {}) =>
  json(
    "/catalog-api/musicbrainz?" + new URLSearchParams({ resource, ...params }),
    true,
  );
export function normalizeAlbum(group) {
  return {
    id: `album-${group.id}`,
    type: "album",
    source: "musicbrainz",
    musicBrainzReleaseGroupId: group.id,
    releaseId: "",
    title: group.title || "Álbum sem título",
    artist: artist(group["artist-credit"]),
    artistId: group["artist-credit"]?.[0]?.artist?.id || "",
    authors: [artist(group["artist-credit"])],
    year: parseInt(group["first-release-date"]) || null,
    releaseDate: group["first-release-date"] || "",
    primaryType: group["primary-type"] || group.type || "Album",
    secondaryTypes: group["secondary-types"] || [],
    genres: (group.genres || []).map((g) => g.name),
    tags: (group.tags || []).map((g) => g.name),
    coverUrl: `https://coverartarchive.org/release-group/${group.id}/front-250`,
    trackCount: 0,
    tracks: [],
    releases: [],
  };
}
export function normalizeTracks(release) {
  return (release.media || []).flatMap((disc, i) =>
    (disc.tracks || []).map((track, n) => {
      const durationMs = track.length ?? track.recording?.length ?? null;
      return {
        id: track.id || track.recording?.id || `${release.id}-${i}-${n}`,
        recordingId: track.recording?.id || "",
        position: track.position || n + 1,
        disc: disc.position || i + 1,
        title: track.title || track.recording?.title || "Faixa sem título",
        artist: artist(
          track["artist-credit"] ||
            track.recording?.["artist-credit"] ||
            release["artist-credit"],
        ),
        durationMs,
        durationFormatted: durationMs
          ? `${Math.floor(durationMs / 60000)}:${String(Math.floor(durationMs / 1000) % 60).padStart(2, "0")}`
          : "",
      };
    }),
  );
}
export function chooseRelease(releases, date = "") {
  return [...releases].sort((a, b) => {
    const score = (r) =>
      (r.status === "Official" ? 1000 : 0) +
      ((r.media || []).some((m) => m["track-count"] > 0 || m.tracks?.length)
        ? 100
        : 0) +
      (r.date?.slice(0, 4) === date.slice(0, 4) ? 50 : 0) -
      (parseInt(r.date) || 9999) / 10000;
    return (
      score(b) - score(a) ||
      String(a.date || "9999").localeCompare(String(b.date || "9999"))
    );
  })[0];
}
function normalizeApple(item) {
  return {
    id: `album-itunes-${item.collectionId}`,
    type: "album",
    source: "itunes",
    appleId: item.collectionId,
    title: item.collectionName,
    artist: item.artistName,
    authors: [item.artistName],
    artistId: String(item.artistId || ""),
    year: parseInt(item.releaseDate) || null,
    releaseDate: item.releaseDate || "",
    primaryType: "Album",
    secondaryTypes: [],
    genres: [item.primaryGenreName].filter(Boolean),
    tags: [],
    coverUrl: https(item.artworkUrl100).replace("100x100bb", "600x600bb"),
    trackCount: item.trackCount || 0,
    tracks: [],
    releases: [],
  };
}
async function appleSearch(query) {
  const result = await json(
    "https://itunes.apple.com/search?" +
      new URLSearchParams({
        term: query,
        media: "music",
        entity: "album",
        limit: "20",
        country: "BR",
      }),
  );
  return [
    ...new Map(
      (result.results || []).map((a) => {
        const album = normalizeApple(a);
        return [album.id, album];
      }),
    ).values(),
  ];
}
export const MusicBrainzService = {
  async search(query, page = 1, field = "all") {
    if (!query.trim()) return { albums: [], total: 0, source: "musicbrainz" };
    let warning = "";
    try {
      const literal = query.replace(/[+\-!(){}\[\]^"~*?:\\/]/g, " ").trim();
      const term =
        field === "title"
          ? `releasegroup:"${literal}"`
          : field === "artist"
            ? `artist:"${literal}"`
            : literal;
      const result = await mb("release-group", {
        query: term,
        limit: "20",
        offset: String((page - 1) * 20),
      });
      const albums = [
        ...new Map(
          (result["release-groups"] || [])
            .map(normalizeAlbum)
            .map((a) => [a.id, a]),
        ).values(),
      ];
      if (albums.length) {
        cacheAlbums(
          albums.map((a) => ({
            ...getAlbum(a.id),
            ...a,
            ...(getAlbum(a.id)?.detailsLoaded ? getAlbum(a.id) : {}),
          })),
        );
        return {
          albums: albums.map((a) => getAlbum(a.id)),
          total: result.count || albums.length,
          source: "musicbrainz",
        };
      }
    } catch (error) {
      warning = error.message;
    }
    try {
      const albums = await appleSearch(query);
      cacheAlbums(albums);
      return {
        albums,
        total: albums.length,
        source: "itunes",
        warning: warning ? `${warning} Mostrando fallback iTunes.` : "",
      };
    } catch {
      const terms = query.split(/\s+/).map(clean);
      const albums = Object.values(albumCatalog()).filter((a) =>
        terms.every((t) => clean(a.title + " " + a.artist).includes(t)),
      );
      if (albums.length)
        return {
          albums,
          total: albums.length,
          source: "local",
          warning:
            "Sem conexão com os serviços. Mostrando álbuns já consultados.",
        };
      throw new Error(
        "Não foi possível consultar MusicBrainz ou iTunes. Tente novamente.",
      );
    }
  },
  async release(id) {
    return mb(`release/${id}`, { inc: "recordings+artist-credits+labels" });
  },
  async detail(id, releaseId = "") {
    const cached = getAlbum(id);
    if (cached?.detailsLoaded && !releaseId) return cached;
    if (id.startsWith("album-itunes-")) {
      const result = await json(
        `https://itunes.apple.com/lookup?id=${encodeURIComponent(id.slice(13))}&entity=song&country=BR`,
      );
      const album = cached || normalizeApple(result.results[0]);
      album.tracks = result.results
        .filter((t) => t.wrapperType === "track")
        .map((t) => ({
          id: String(t.trackId),
          recordingId: "",
          disc: t.discNumber || 1,
          position: t.trackNumber,
          title: t.trackName,
          artist: t.artistName,
          durationMs: t.trackTimeMillis,
          durationFormatted: `${Math.floor(t.trackTimeMillis / 60000)}:${String(Math.floor(t.trackTimeMillis / 1000) % 60).padStart(2, "0")}`,
        }));
      album.detailsLoaded = true;
      cacheAlbums([album]);
      return album;
    }
    const groupId = id.replace(/^album-/, "");
    if (!/^[a-f0-9-]{36}$/.test(groupId)) throw new Error("Álbum inválido.");
    const group = await mb(`release-group/${groupId}`, {
      inc: "artist-credits+genres+tags",
    });
    const listing = await mb("release", {
      "release-group": groupId,
      inc: "media+labels",
      limit: "100",
    });
    const releases = listing.releases || [];
    const selected = releaseId
      ? releases.find((r) => r.id === releaseId)
      : chooseRelease(releases, group["first-release-date"]);
    if (!selected)
      throw new Error(
        "Nenhuma edição com faixas foi encontrada para este álbum.",
      );
    const release = await this.release(selected.id);
    const album = {
      ...normalizeAlbum(group),
      releaseId: release.id,
      tracks: normalizeTracks(release),
      country: release.country || "",
      label: (release["label-info"] || [])
        .map((l) => l.label?.name)
        .filter(Boolean)
        .join(", "),
      barcode: release.barcode || "",
      releases: releases.map((r) => ({
        id: r.id,
        title: r.title,
        date: r.date || "",
        country: r.country || "",
        format: (r.media || [])
          .map((m) => m.format || "Formato não informado")
          .join(", "),
      })),
      detailsLoaded: true,
    };
    album.trackCount = album.tracks.length;
    try {
      const covers = await json(
        `https://coverartarchive.org/release-group/${groupId}`,
      );
      const front = covers.images?.find((image) => image.front);
      if (front) {
        album.coverUrl = https(front.thumbnails?.["250"] || front.image);
        album.coverLarge = https(front.thumbnails?.["500"] || front.image);
      }
    } catch {
      try {
        const covers = await json(
          `https://coverartarchive.org/release/${release.id}`,
        );
        const front = covers.images?.find((image) => image.front);
        album.coverUrl = front
          ? https(front.thumbnails?.["250"] || front.image)
          : "";
        album.coverLarge = front
          ? https(front.thumbnails?.["500"] || front.image)
          : "";
      } catch {
        album.coverUrl = "";
      }
    }
    if (!album.coverUrl) album.coverUrl = await this.coverFallback(album);
    cacheAlbums([album]);
    return album;
  },
  async coverFallback(album) {
    try {
      if (album.musicBrainzReleaseGroupId) {
        try {
          const covers = await json(
            `https://coverartarchive.org/release-group/${album.musicBrainzReleaseGroupId}`,
          );
          const front = covers.images?.find((image) => image.front);
          if (front) return https(front.thumbnails?.["250"] || front.image);
        } catch {}
      }
      const alternatives = await appleSearch(`${album.title} ${album.artist}`);
      const match = alternatives.find(
        (a) =>
          clean(a.title) === clean(album.title) &&
          clean(a.artist) === clean(album.artist),
      );
      return match?.coverUrl || "";
    } catch {
      return "";
    }
  },
};
