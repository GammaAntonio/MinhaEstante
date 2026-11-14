import { creatorTracks } from "./creator-playlist.js";
import { drawPreset, visualModes } from "./player-visualizer.js";
import { h, button, picture } from "./ui.js";
import { mediaIcon } from "./media-hub.js";
import { hasMP3Signature } from "./mp3-validation.js";
let backgroundAudio = null,
  albumAudio = null,
  resumeBackground = false;
let backgroundKey = "";
let playingAudio = null;
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
    user?.isCreator ? music?.tracks : null,
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
  dock.replaceChildren(renderMusic(music, { kind: "background", tracks: creatorTracks(user), artwork: user?.page.avatar, subtitle: user?.page.displayName }) || "");
}
export function positionBackgroundMusic(scope) {
  const dock = document.getElementById("profile-music-dock");
  if (!dock) return;
  dock.className = "";
  const slot = scope.querySelector(".profile-music-slot");
  if (slot) slot.append(dock);
  else scope.querySelector(".navbar")?.after(dock);
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
function musicTransport(audio, artwork) {
  let hue = 195;
  let hueReady = false;
  if (artwork) {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const sample = h("canvas", {width:8,height:8}).getContext("2d");
      try {
        sample.drawImage(image,0,0,8,8);
        const rgb = sample.getImageData(0,0,8,8).data;
        let best = 0;
        for (let i=0;i<rgb.length;i+=4) {
          const [r,g,b] = rgb.slice(i,i+3), spread = Math.max(r,g,b)-Math.min(r,g,b);
          if (spread <= best || rgb[i+3]<128) continue;
          best=spread;
          hue=(Math.atan2(Math.sqrt(3)*(g-b),2*r-g-b)*180/Math.PI+360)%360;
          hueReady=true;
        }
      } catch {}
    };
    image.src=artwork;
  }
  const seek = h("input", { type: "range", min: 0, max: 1, step: 0.1, value: 0, class: "music-progress",
    disabled: true, "aria-label": "Posição da reprodução" });
  const volume = h("input", { type: "range", class: "music-volume", min: 0, max: 1,
    step: 0.05, value: audio.volume, "aria-label": "Volume" });
  const time = h("small", { class: "music-time" }, "0:00");
  const display = h("canvas", { class: "music-display", width: 640, height: 256,
    "aria-hidden": "true", hidden: true });
  const formatTime = (value) => {
    const seconds = Math.floor(value);
    return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
  };
  const jump = (offset) => {
    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + offset));
    syncTime();
  };
  const jumpButton = (name, label, offset) => {
    const control = button(mediaIcon(name), () => jump(offset), "music-skip");
    control.setAttribute("aria-label", label);
    control.title = label;
    return control;
  };
  const back = jumpButton("back", "Voltar 10 segundos", -10);
  const forward = jumpButton("forward", "Avançar 10 segundos", 10);
  const mute = button(mediaIcon("sound"), () => { audio.muted = !audio.muted; }, "music-mute");
  mute.setAttribute("aria-label", "Silenciar");
  mute.setAttribute("aria-pressed", "false");
  const syncTime = () => {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    seek.disabled = duration === 0;
    back.disabled = duration === 0;
    forward.disabled = duration === 0;
    seek.style.setProperty("--progress", (duration ? audio.currentTime / duration * 100 : 0) + "%");
    seek.max = duration || 1;
    seek.value = audio.currentTime;
    time.textContent = formatTime(audio.currentTime) + (duration ? " / " + formatTime(duration) : "");
    seek.setAttribute("aria-valuetext", formatTime(audio.currentTime));
  };
  for (const event of ["timeupdate", "durationchange", "seeked", "emptied"]) audio.addEventListener(event, syncTime);
  seek.addEventListener("input", () => {
    audio.currentTime = Number(seek.value);
    syncTime();
  });
  volume.addEventListener("input", () => {
    audio.volume = Number(volume.value);
    if (audio.volume > 0) audio.muted = false;
  });
  audio.addEventListener("volumechange", () => {
    volume.value = audio.muted ? 0 : audio.volume;
    mute.replaceChildren(mediaIcon(audio.muted || !audio.volume ? "muted" : "sound"));
    mute.setAttribute("aria-pressed", String(audio.muted));
  });
  syncTime();

  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const painter = display.getContext("2d");
  const previous = h("canvas", { width: display.width, height: display.height }).getContext("2d");
  let previousMode, transitionAt = 0;
  let context, analyser, frequencies, wave, frame, stream, lastPaint = 0;
  let visible = true, lastChange = -20, activeMode;
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) start(); else stop();
  });
  let captureAttempted = false;
  function stop() {
    cancelAnimationFrame(frame);
    frame = undefined;
    display.hidden = true;
  }
  function draw(now) {
    if (motion.matches || audio.paused || document.hidden) {
      stop();
      return;
    }
    if (now - lastPaint >= 32) {
      lastPaint = now;
      const time = audio.currentTime;
      analyser?.getByteFrequencyData(frequencies);
      const sample = (start, count) => {
        let total = 0;
        for (let index = start; index < start + count; index++) total += frequencies[index];
        return total / (count * 255);
      };
      const live = context?.state === "running" && !!analyser;
      const bass = live ? sample(2,16) : .18;
      const mid = live ? sample(24,48) : .15;
      const treble = live ? sample(82,85) : .08;
      if (live) analyser.getByteTimeDomainData(wave);
      if (!activeMode || time - lastChange >= 12 || time < lastChange) {
        const choices = Object.keys(visualModes).filter(mode =>
          mode !== "auto" && mode !== "off" && mode !== activeMode && (mode !== "album" || hueReady));
        activeMode = choices[Math.floor(Math.random() * choices.length)];
        lastChange = time;
      }
      const mode = live ? activeMode : "ambience";
      display.dataset.mode = mode;
      display.dataset.source = live ? "audio" : "ambient";
      if (previous && mode !== previousMode) {
        previous.clearRect(0,0,display.width,display.height);
        if (previousMode) previous.drawImage(display,0,0);
        transitionAt=now;
        previousMode=mode;
      }
      drawPreset(painter, mode, time, {bass,mid,treble,wave,frequency:frequencies}, .7, hue);
      if (previous && now-transitionAt<440) {
        painter.globalAlpha = 1 - (now-transitionAt)/440;
        painter.drawImage(previous.canvas,0,0);
        painter.globalAlpha=1;
      }
    }
    frame = requestAnimationFrame(draw);
  }
  function start() {
    if (!painter || !visible || display.dataset.compact || motion.matches || audio.paused || document.hidden || frame) return;
    if (!captureAttempted && audio.captureStream && window.AudioContext &&
        new URL(audio.src, location.href).origin === location.origin) {
      captureAttempted = true;
      try {
        stream = audio.captureStream();
        context = new AudioContext();
        analyser = context.createAnalyser();
        frequencies = new Uint8Array(analyser.frequencyBinCount);
        wave = new Uint8Array(analyser.fftSize);
        context.createMediaStreamSource(stream).connect(analyser);
      } catch {
        dispose();
      }
    }
    display.hidden = false;
    context?.resume().catch(() => {});
    frame = requestAnimationFrame(draw);
  }
  function dispose() {
    stop();
    stream?.getTracks().forEach((track) => track.stop());
    if (context && context.state !== "closed") context.close().catch(() => {});
    analyser = null;
    context = null;
    stream = null;
    display.hidden = true;
  }
  const visibility = () => document.hidden ? stop() : start();
  const updateMotion = () => {
    if (motion.matches) stop();
    else start();
  };
  audio.addEventListener("playing", start);
  audio.addEventListener("pause", stop);
  audio.addEventListener("ended", stop);
  const connect = () => {
    observer.observe(display.parentElement);
    motion.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", visibility);
  };
  return {
    display, back, forward,
    element: h("div", { class: "music-transport" },
      h("div", { class: "music-seek" }, seek, time),
      h("div", { class: "music-level" }, mute, volume)),
    connect,
    dispose: () => {
      observer.disconnect();
      motion.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", visibility);
      dispose();
    },
  };
}

export function renderMusic(
  music,
  { kind = "preview", autoplay = false, artwork = "", subtitle = "", tracks = [] } = {},
) {
  if (!music?.enabled || (!tracks.length && !music.fileId && !audioURL(music.url))) return null;
  if (!tracks.length) tracks = [music];
  const audio = h("audio", { preload: "none", loop: tracks.length === 1 && !!music.loop });
  if (kind === "background") backgroundAudio = audio;
  let objectURL, disposed = false, selection = 0, generation = 0;
  const status = h("small", { role: "status", "aria-live": "polite" });
  const title = h("strong", { class: "music-title" });
  async function loadTrack() {
    const token = ++generation;
    const track = tracks[selection];
    title.textContent = track.title?.trim() || "Música da página";
    audio.pause();
    if (objectURL) URL.revokeObjectURL(objectURL);
    objectURL = undefined;
    if (track.fileId?.startsWith("server:")) {
      audio.src = `/api/persistence/audio/${encodeURIComponent(track.fileId.slice(7))}`;
    } else if (track.fileId) {
      const blob = await storedAudio(track.fileId);
      if (disposed || token !== generation) return;
      if (!blob) throw Error("MP3 não encontrado.");
      audio.src = objectURL = URL.createObjectURL(blob);
    } else {
      audio.src = audioURL(track.url);
    }
  }
  const load = () => {
    const pending = loadTrack();
    pending.catch(error => { if (!disposed) status.textContent = error.message; });
    return pending;
  };
  let ready = load();
  async function changeTrack(offset, autoplay = !audio.paused) {
    selection = (selection + offset + tracks.length) % tracks.length;
    ready = load();
    await ready;
    if (!disposed && autoplay) await audio.play();
  }
  const trackButton = (label, offset, icon) => {
    const control = button(mediaIcon(icon), () => changeTrack(offset), "music-skip");
    control.setAttribute("aria-label", label);
    return control;
  };
  const toggle = button(mediaIcon("play"), async () => {
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
  }, "music-play");
  const sync = () => {
    toggle.replaceChildren(mediaIcon(audio.paused ? "play" : "pause"));
    toggle.setAttribute("aria-label", audio.paused ? "Ouvir" : "Pausar");
    toggle.title = audio.paused ? "Ouvir" : "Pausar";
    toggle.setAttribute("aria-pressed", String(!audio.paused));
  };
  sync();
  audio.addEventListener("play", () => {
    if (playingAudio && playingAudio !== audio) playingAudio.pause();
    playingAudio = audio;
    sync();
  });
  audio.addEventListener("pause", sync);
  audio.addEventListener("ended", sync);
  audio.addEventListener("ended", () => {
    if (tracks.length > 1 && (selection < tracks.length - 1 || music.loop))
      changeTrack(1, true).catch(error => { status.textContent = error.message; });
  });
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
  const transport = musicTransport(audio, artwork);
  const art = h("div", { class: "music-art", "aria-hidden": "true" },
    mediaIcon("records"), picture(artwork, "", "music-cover"));
  const screen = h("div", { class: "music-screen" }, art,
    h("div", { class: "music-meta" },
      title,
      h("small", { class: "music-artist" }, subtitle),
      music.loop && h("small", { class: "music-loop" }, "Em repetição")),
    transport.display);
  const transportControls = h("div", { class: "music-buttons", role: "group", "aria-label": "Reprodução" },
    tracks.length > 1 ? trackButton("Música anterior", -1, "back") : transport.back,
    toggle, tracks.length > 1 ? trackButton("Próxima música", 1, "forward") : transport.forward);
  const root = h("section", { class: "profile-music", "data-music-kind": kind, "aria-label": "Player de música" },
    audio,
    h("div", { class: "music-header" }, h("span", {}, mediaIcon("sound"), "Reprodutor")),
    screen,
    h("div", { class: "music-controls" }, transportControls, transport.element),
    status,
  );
  ready.catch((error) => {
    if (!disposed) status.textContent = error.message;
  });
  const observer = new MutationObserver(() => {
    if (!root.isConnected) {
      disposed = true;
      transport.dispose();
      audio.pause();
      if (playingAudio === audio) playingAudio = null;
      audio.removeAttribute("src");
      audio.load();
      if (objectURL) URL.revokeObjectURL(objectURL);
      observer.disconnect();
      if (kind === "album" && albumAudio === audio) restoreBackground();
    }
  });
  setTimeout(() => {
    if (root.isConnected) {
      transport.connect();
      observer.observe(document.body, { childList: true, subtree: true });
    }
    if (root.isConnected && autoplay) toggle.click();
  }, 0);
  return root;
}
