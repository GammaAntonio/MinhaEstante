import { BookService } from "./api.js";
import { MusicBrainzService } from "./music-api.js";
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "text") el.textContent = value;
    else if (key.startsWith("on") && typeof value === "function")
      el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (
      key === "checked" ||
      key === "selected" ||
      key === "disabled" ||
      key === "multiple"
    )
      el[key] = !!value;
    else el.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity))
    if (child !== null && child !== undefined && child !== false)
      el.append(
        child instanceof Node ? child : document.createTextNode(String(child)),
      );
  return el;
}
export const link = (text, href, attrs = {}) =>
  h("a", { href, ...attrs }, text);
export const button = (text, fn, cls = "") =>
  h("button", { type: "button", class: cls, onclick: guarded(fn) }, text);
export const empty = (
  title = "ainda não há nada por aqui.",
  text = "Toda página começa com um espaço em branco.",
) =>
  h(
    "div",
    { class: "empty" },
    h("span", { class: "empty-mark", "aria-hidden": "true" }, "✦"),
    h("strong", {}, title),
    h("p", {}, text),
  );
export const panel = (title, body, aside = null) =>
  h(
    "section",
    { class: "panel" },
    h("div", { class: "section-title" }, h("h2", {}, title), aside),
    body,
  );
export function field(label, input, hint = "") {
  const id = input.id || `field-${crypto.randomUUID()}`;
  input.id = id;
  return h(
    "div",
    { class: "field" },
    h("label", { for: id }, label),
    input,
    hint && h("small", {}, hint),
  );
}
export function input(name, value = "", attrs = {}) {
  return h("input", { name, value, ...attrs });
}
export function textarea(name, value = "", attrs = {}) {
  const e = h("textarea", { name, rows: 5, ...attrs });
  e.value = value;
  return e;
}
export function select(name, options, value) {
  const s = h(
    "select",
    { name },
    Object.entries(options)
      .sort((a, b) => (name === "rating" ? Number(a[0]) - Number(b[0]) : 0))
      .map(([v, t]) => h("option", { value: v }, t)),
  );
  s.value = value ?? Object.keys(options)[0];
  return s;
}
export function check(label, checked, name = "") {
  return h(
    "label",
    { class: "check" },
    h("input", { type: "checkbox", name, checked }),
    label,
  );
}
export function notify(message, error = false) {
  const host = document.getElementById("notifications");
  const n = h("div", { class: `toast ${error ? "error" : ""}` }, message);
  host.append(n);
  setTimeout(() => n.remove(), 6500);
}
export function safeURL(value, { image = false } = {}) {
  if (!value) return "";
  if (
    image &&
    /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(value)
  )
    return value;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
export function picture(url, alt, cls = "") {
  const src = safeURL(url, { image: true });
  if (!src) return null;
  return h("img", {
    src,
    alt,
    class: cls,
    loading: "lazy",
    referrerpolicy: "no-referrer",
    onerror: (e) => e.currentTarget.remove(),
  });
}
export function cover(book, size = "M") {
  const wrapper = h(
    "div",
    {
      class: `cover ${book.type === "album" ? "album-cover" : ""}`,
      role: "img",
      "aria-label": `Capa de ${book.title}`,
    },
    h(
      "div",
      { class: "cover-fallback" },
      h("span", {}, book.authors?.[0] || "livro"),
      h("strong", {}, book.title),
      h("span", {}, "✦"),
    ),
  );
  let tried = false;
  const failed = async (e) => {
    e.currentTarget.remove();
    if (tried) return;
    tried = true;
    const url = safeURL(
      await (book.type === "album"
        ? MusicBrainzService.coverFallback(book)
        : BookService.coverFallback(book)),
      { image: true },
    );
    if (url)
      wrapper.append(
        h("img", {
          src: url,
          alt: "",
          loading: "lazy",
          referrerpolicy: "no-referrer",
          onerror: (e) => e.currentTarget.remove(),
        }),
      );
  };
  const src = safeURL(
    book.coverUrl ||
      (book.type === "album" && book.musicBrainzReleaseGroupId
        ? `https://coverartarchive.org/release-group/${book.musicBrainzReleaseGroupId}/front-250`
        : ""),
    { image: true },
  );
  if (src)
    wrapper.append(
      h("img", {
        src:
          book.type === "album"
            ? size === "L"
              ? book.coverLarge || src
              : src
            : src.replace(/-M\.jpg/, "-" + size + ".jpg"),
        alt: "",
        loading: "lazy",
        referrerpolicy: "no-referrer",
        onerror: failed,
        onload: (e) => {
          if (e.currentTarget.naturalWidth < 5) failed(e);
        },
      }),
    );
  return wrapper;
}
export function bookCard(book, { rating = null, small = false } = {}) {
  const mediaType = book.type === "album" ? "album" : "book";
  const href = `#/${mediaType === "album" ? "album" : "livro"}/${encodeURIComponent(book.id)}`;
  const open = (event) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    window.dispatchEvent(
      new CustomEvent("booksite:openmedia", {
        detail: { type: mediaType, id: book.id, username: event.currentTarget?.dataset?.user || "" },
      }),
    );
  };
  return h(
    "article",
    {
      class: `${mediaType === "album" ? "album-card " : ""}book-card ${small ? "small" : ""}`,
    },
    link(cover(book), href, { "aria-label": book.title, onclick: open }),
    h(
      "div",
      { class: mediaType === "album" ? "book-info album-info" : "book-info" },
      link(book.title, href, {
        class: mediaType === "album" ? "book-title album-title" : "book-title",
        onclick: open,
      }),
      h(
        "span",
        { class: mediaType === "album" ? "muted album-artist" : "muted" },
        book.authors?.join(", ") || "Autor não informado",
      ),
      book.type === "album" &&
        h(
          "small",
          { class: "muted" },
          [book.year, book.primaryType, ...(book.secondaryTypes || [])]
            .filter(Boolean)
            .join(" · "),
        ),
      rating && stars(rating),
    ),
  );
}
export function booksGrid(books, ratings = {}, style = "grid") {
  return books.length
    ? h(
        "div",
        { class: `books ${style}` },
        books.map((b) => bookCard(b, { rating: ratings[b.id] })),
      )
    : empty(
        "nenhum livro nesta seleção.",
        "Explore o catálogo para encontrar sua próxima leitura.",
      );
}
export function stars(value) {
  return h(
    "span",
    {
      class: "stars",
      title: `${value} de 5 estrelas`,
      "aria-label": `${value} de 5 estrelas`,
    },
    "★".repeat(Math.floor(value)),
    value % 1 ? "½" : "",
    h("small", {}, ` ${String(value).replace(".", ",")}`),
  );
}
export const date = (value) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
export function modal(title, body, options = {}) {
  const d = h(
    "dialog",
    { class: options.class || "" },
    h(
      "div",
      { class: "dialog-head" },
      h("h2", {}, title),
      button("fechar ×", () => d.close()),
    ),
    body,
  );
  document.body.append(d);
  d.addEventListener("close", () => d.remove());
  d.showModal();
  return d;
}
export function confirmAction(message) {
  return new Promise((resolve) => {
    const body = h("div", {}, h("p", {}, message));
    const dialog = modal("confirmar alteração", body);
    const cancel = button("cancelar", () => dialog.close());
    body.append(
      h(
        "div",
        { class: "toolbar" },
        cancel,
        button(
          "confirmar",
          () => {
            resolve(true);
            dialog.close();
          },
          "primary",
        ),
      ),
    );
    dialog.addEventListener("close", () => resolve(false), { once: true });
    cancel.focus();
  });
}
export function guarded(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      notify(e.message || "Algo deu errado.", true);
    }
  };
}
export function formSubmit(form, fn) {
  form.addEventListener(
    "submit",
    guarded(async (e) => {
      e.preventDefault();
      const submits = [...form.querySelectorAll("[type=submit]")];
      submits.forEach((b) => (b.disabled = true));
      try {
        await fn(new FormData(form), form);
      } finally {
        submits.forEach((b) => (b.disabled = false));
      }
    }),
  );
  return form;
}
