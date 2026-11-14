import { h, link } from "./ui.js";
import { coverFlow } from "./media-stage.js";

const glyphs = {
  books: ["M3 5h5a4 4 0 0 1 4 4v12a5 5 0 0 0-4-2H3z", "M21 5h-5a4 4 0 0 0-4 4v12a5 5 0 0 1 4-2h5z"],
  records: ["M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z", "M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z", "M5 12a7 7 0 0 1 7-7m7 7a7 7 0 0 1-7 7"],
  photos: ["M4 4h16v17H4z", "m4 16 5-5 4 4 2-2 5 4", "M16 8h.01"],
  people: ["M14 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM2 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2Z", "M17 4a4 4 0 0 1 0 8m3 3a4 4 0 0 1 2 4v2"],
  journal: ["M6 3h13v18H6zM4 7h4M4 12h4M4 17h4m7-9h5m-5 4h5"],
  lists: ["M9 5h12M9 12h12M9 19h12M3 5h1m-1 7h1m-1 7h1"],
  play: ["m8 4 13 8-13 8Z"],
  pause: ["M8 5v14m8-14v14"],
  back: ["M5 5v14m14-14-11 7 11 7Z"],
  forward: ["M19 5v14M5 5l11 7-11 7Z"],
  sound: ["M3 9h4l5-4v14l-5-4H3zm13 0a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12"],
  muted: ["M3 9h4l5-4v14l-5-4H3zm13 0 5 6m0-6-5 6"],
};

export function mediaIcon(name) {
  const namespace = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(namespace, "svg");
  for (const [key, value] of Object.entries({
    viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
    "stroke-width": 1.65, "stroke-linecap": "round", "stroke-linejoin": "round",
    "aria-hidden": "true", focusable: "false",
  })) icon.setAttribute(key, value);
  for (const d of glyphs[name]) {
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("d", d);
    icon.append(path);
  }
  return icon;
}

export function mediaChannels() {
  const channels = [
    ["books", "Livros", "Catálogo de leituras", "#/livros"],
    ["records", "Álbuns", "Discos e faixas", "#/albuns"],
    ["people", "Pessoas", "Páginas pessoais", "#/usuarios"],
    ["journal", "Diário", "Textos e anotações", "#/diario"],
    ["lists", "Listas", "Coleções de leitura", "#/listas"],
  ];
  return h("nav", { class: "media-channels", "aria-label": "Canais da sala de mídia" },
    channels.map(([icon, label, description, href]) =>
      link([
        h("span", { class: "channel-emblem" }, mediaIcon(icon)),
        h("strong", {}, label),
        h("small", {}, description),
      ], href, { class: `media-channel channel-${icon}` })));
}

export function shelfWidget(books) {
  if (!books.length) return null;
  const body = h("div", { class: "shelf-preview" });
  const widget = h("details", { class: "shelf-widget" },
    h("summary", {}, "Navegar em Cover Flow"), body);
  const populate = () => {
    if (!widget.open || body.firstChild) return;
    body.append(coverFlow(books));
  };
  widget.addEventListener("toggle", populate);
  populate();
  return widget;
}

