import { h, button } from "./ui.js";
import { hasMP3Signature } from "./mp3-validation.js";
let backgroundAudio = null,
  albumAudio = null,
  resumeBackground = false;
let backgroundKey = "";
function restoreBackground() {
  const resume = resumeBackground;
  resumeBackground = false;
  albumAudio = null;
  if (resume && backgroundAudio) backgroundAudio.play().catch(() => {});
}
export function setBackgroundMusic(user) {
  const music = user?.page.music;
  const key = JSON.stringify([
    user?.id,
    music?.fileId,
    music?.url,
    music?.enabled,
    music?.loop,
    music?.title,
  ]);
  let dock = document.getElementById("profile-music-dock");
  if (!dock) {
    dock = h("div", { id: "profile-music-dock", class: "site" });
  }
  // Preserva o mesmo áudio enquanto a rota substitui o conteúdo da página.
  document.body.append(dock);
  if (key === backgroundKey) return;
  if (backgroundAudio) backgroundAudio.pause();
  backgroundAudio = null;
  resumeBackground = false;
  backgroundKey = key;
  dock.replaceChildren(renderMusic(music, { kind: "background" }) || "");
}
export function positionBackgroundMusic(scope) {
  const dock = document.getElementById("profile-music-dock");
  if (!dock) return;
  dock.className = "";
  const slot = scope.querySelector(".profile-music-slot");
  if (slot) slot.append(dock);
  else scope.querySelector(".site-header")?.after(dock);
}
export const DEFAULT_MUSIC = {
  url: "",
  fileId: "",
  fileName: "",
  title: "",
  enabled: false,
  loop: true,
};

function audioDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("booksite_audio", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Não foi possível abrir o armazenamento de músicas."));
  });
}
async function uploadMP3ToServer(file) {
  const response = await fetch('/api/persistence/audio', {
    method: 'POST',
    headers: {
      'Content-Type': 'audio/mpeg',
      'X-File-Name': encodeURIComponent(file.name),
    },
    body: file,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload.error || 'Não foi possível enviar o MP3 ao servidor.');
  if (!/^server:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.fileId || ''))
    throw new Error('O servidor não confirmou uma referência persistente para o MP3.');
  return { fileId: payload.fileId, fileName: file.name.split(/[\\/]/).pop() };
}

export async function uploadMP3(file) {
  if (!file || !/\.mp3$/i.test(file.name))
    throw new Error("Escolha um arquivo MP3.");
  if (!file.size || file.size > 55 * 1024 * 1024)
    throw new Error("Escolha um MP3 de até 55 MB.");
  const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (!hasMP3Signature(bytes))
    throw new Error("Esse arquivo não parece ser um MP3 válido.");
  try {
    return await uploadMP3ToServer(file);
  } catch (cause) {
    throw new Error('Não foi possível salvar o MP3. Verifique se o MinhaEstante foi iniciado pelo servidor local.', { cause });
  }
}
async function storedAudio(fileId) {
  // Compatibilidade somente de leitura com MP3s antigos deste navegador.
  const db = await audioDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("files").objectStore("files").get(fileId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(new Error("Não foi possível carregar o MP3."));
    });
  } finally {
    db.close();
  }
}
export function audioURL(value) {
  try {
    const url = new URL(String(value).trim());
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    if (
      /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(url.hostname)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
export function renderMusic(
  music,
  { kind = "preview", autoplay = false } = {},
) {
  const src = audioURL(music?.url);
  if (!music?.enabled || (!music.fileId && !src)) return null;
  const audio = h("audio", { preload: "none", loop: !!music.loop });
  if (kind === "background") backgroundAudio = audio;
  let objectURL;
  let disposed = false;
  const serverId = String(music.fileId || '').startsWith('server:')
    ? music.fileId.slice('server:'.length)
    : '';
  const ready = serverId
    ? Promise.resolve().then(() => {
        audio.src = `/api/persistence/audio/${encodeURIComponent(serverId)}`;
      })
    : music.fileId
    ? storedAudio(music.fileId).then((blob) => {
        if (!blob)
          throw new Error("MP3 não encontrado. Envie o arquivo novamente.");
        if (disposed) return;
        objectURL = URL.createObjectURL(blob);
        audio.src = objectURL;
      })
    : Promise.resolve().then(() => {
        audio.src = src;
      });
  const status = h("small", { role: "status", "aria-live": "polite" });
  const toggle = button("Ouvir", async () => {
    if (!audio.paused) {
      audio.pause();
      if (kind === "album" && albumAudio === audio) restoreBackground();
      return;
    }
    toggle.disabled = true;
    status.textContent = "Carregando áudio…";
    try {
      await ready;
      if (disposed) return;
      if (kind === "album") {
        if (albumAudio && albumAudio !== audio) albumAudio.pause();
        resumeBackground =
          resumeBackground || (!!backgroundAudio && !backgroundAudio.paused);
        backgroundAudio?.pause();
        albumAudio = audio;
      } else if (kind === "background" && albumAudio) {
        albumAudio.pause();
        restoreBackground();
      }
      await audio.play();
      status.textContent = "";
    } catch (error) {
      if (kind === "album" && albumAudio === audio) restoreBackground();
      status.textContent =
        error.name === "NotAllowedError"
          ? "Clique em Ouvir para iniciar o áudio."
          : "Não foi possível tocar. Envie o arquivo MP3 novamente em Editar música.";
    } finally {
      toggle.disabled = false;
    }
  });
  const sync = () => {
    toggle.textContent = audio.paused ? "Ouvir" : "Pausar";
    toggle.setAttribute("aria-pressed", String(!audio.paused));
  };
  toggle.setAttribute("aria-pressed", "false");
  audio.addEventListener("play", sync);
  audio.addEventListener("pause", sync);
  audio.addEventListener("ended", sync);
  audio.addEventListener("ended", () => {
    if (kind === "album" && albumAudio === audio) restoreBackground();
  });
  audio.addEventListener("error", () => {
    status.textContent =
      "Áudio indisponível. Confira o arquivo em Editar música.";
    toggle.disabled = false;
    sync();
    if (kind === "album" && albumAudio === audio) restoreBackground();
  });
  const root = h(
    "div",
    { class: "profile-music", "data-music-kind": kind },
    audio,
    toggle,
    h("span", {}, music.title?.trim() || "Música da página"),
    music.loop && h("small", { class: "muted" }, "em repetição"),
    status,
  );
  ready.catch((error) => {
    if (!disposed) status.textContent = error.message;
  });
  const observer = new MutationObserver(() => {
    if (!root.isConnected) {
      disposed = true;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      if (objectURL) URL.revokeObjectURL(objectURL);
      observer.disconnect();
      if (kind === "album" && albumAudio === audio) restoreBackground();
    }
  });
  setTimeout(() => {
    if (root.isConnected)
      observer.observe(document.body, { childList: true, subtree: true });
    if (root.isConnected && autoplay) toggle.click();
  }, 0);
  return root;
}
