export const MAX_CREATOR_TRACKS = 20;
export const MAX_TRACK_BYTES = 50 * 1024 * 1024;

export function creatorTracks(user) {
  if (!user?.isCreator) return [];

  const music = user.page?.music || {};

  const tracks = Array.isArray(music.tracks)
    ? music.tracks
    : music.fileId || music.url
      ? [{
          title: music.title || music.fileName || "Musica",
          fileId: music.fileId || "",
          fileName: music.fileName || "",
          url: music.url || ""
        }]
      : [];

  return tracks
    .filter(track => track && (track.fileId || track.url))
    .slice(0, MAX_CREATOR_TRACKS)
    .map(track => ({
      title: String(track.title || "Musica").slice(0, 140),
      fileId: String(track.fileId || ""),
      fileName: String(track.fileName || ""),
      url: String(track.url || "")
    }));
}
