import { button, cover, h, link, modal, picture } from "./ui.js";

export function coverFlow(items) {
  if (!items.length) return null;

  let current = Math.min(2, items.length - 1);
  const viewport = h("div", { class: "flow-viewport" });
  const caption = h("div", { class: "flow-caption", "aria-live": "polite" });
  const previous = button("‹", () => select(current - 1), "flow-arrow");
  const next = button("›", () => select(current + 1), "flow-arrow");
  previous.setAttribute("aria-label", "Capa anterior");
  next.setAttribute("aria-label", "Próxima capa");

  const cards = items.map((item, index) => {
    const href = item.href || `#/${item.type === "album" ? "album" : "livro"}/${encodeURIComponent(item.id)}`;
    const artwork = cover(item);
    const image = artwork.querySelector("img");
    const itemLink = link(artwork, href, { class: "flow-cover", "aria-label": item.title });
    itemLink.addEventListener("click", (event) => {
      if (current === index || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      select(index);
      viewport.focus({ preventScroll: true });
    });
    return { item, href, itemLink, image };
  });
  viewport.append(...cards.map(({ itemLink }) => itemLink));
  viewport.tabIndex = 0;
  viewport.setAttribute("aria-label", "Capas. Use as setas para navegar.");
  viewport.setAttribute("role", "group");

  function select(index) {
    current = Math.max(0, Math.min(index, cards.length - 1));
    cards.forEach(({ itemLink, image }, position) => {
      const distance = position - current;
      const offset = Math.max(-4, Math.min(4, distance));
      itemLink.style.setProperty("--offset", offset);
      itemLink.style.setProperty("--depth", Math.abs(offset));
      itemLink.style.setProperty("--turn", -Math.sign(offset));
      itemLink.style.zIndex = String(10 - Math.abs(offset));
      itemLink.classList.toggle("flow-offstage", Math.abs(distance) > 3);
      itemLink.tabIndex = distance === 0 ? 0 : -1;
      itemLink.toggleAttribute("inert", Math.abs(distance) > 3);
      itemLink.setAttribute("aria-current", distance === 0 ? "true" : "false");
      if (image && Math.abs(distance) <= 3) image.loading = "eager";
    });
    const { item, href } = cards[current];
    caption.replaceChildren(
      link(item.title, href),
      item.authors?.length ? h("span", {}, item.authors.join(", ")) : null,
    );
    previous.setAttribute("aria-disabled", String(current === 0));
    next.setAttribute("aria-disabled", String(current === cards.length - 1));
  }

  viewport.addEventListener("keydown", (event) => {
    const index = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: cards.length - 1 }[event.key];
    if (index === undefined) return;
    event.preventDefault();
    viewport.focus({ preventScroll: true });
    select(index);
  });
  let dragStart;
  let dragged = false;
  viewport.addEventListener("dragstart", event => event.preventDefault());
  viewport.addEventListener("pointerdown", event => {
    dragged = false;
    if (event.pointerType === "mouse" && event.button === 0) dragStart = event.clientX;
  });
  viewport.addEventListener("pointerleave", () => { dragStart = undefined; });
  viewport.addEventListener("pointerup", event => {
    if (dragStart === undefined) return;
    const dx = event.clientX - dragStart;
    dragStart = undefined;
    if (Math.abs(dx) <= 35) return;
    dragged = true;
    select(current - Math.sign(dx));
  });
  viewport.addEventListener("click", event => {
    if (!dragged) return;
    dragged = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  let swipeStart;
  viewport.addEventListener("touchstart", (event) => {
    swipeStart = event.touches[0];
  }, { passive: true });
  viewport.addEventListener("touchend", (event) => {
    if (!swipeStart) return;
    const end = event.changedTouches[0];
    const dx = end.clientX - swipeStart.clientX;
    const dy = end.clientY - swipeStart.clientY;
    swipeStart = null;
    if (Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy)) select(current - Math.sign(dx));
  }, { passive: true });

  select(current);
  return h("section", { class: "cover-flow", "aria-label": "Navegador de capas" },
    viewport, h("div", { class: "flow-controls" }, previous, caption, next));
}

export function mediaBrowser(items, grid) {
  if (!items.length) return grid;
  const stage = h("div", { class: "catalog-flow", hidden: true });
  const controls = [];
  const modes = [["Estante", "shelf"], ["Lista", "index"], ["Madeira", "wood"]];
  if (items.length > 1) modes.push(["Vista em capas", "flow"]);
  const setMode = (mode) => {
    if (mode === "flow" && !stage.firstChild) stage.append(coverFlow(items));
    stage.hidden = mode !== "flow";
    grid.hidden = mode === "flow";
    grid.classList.toggle("catalog-index", mode === "index");
    grid.classList.toggle("catalog-wood", mode === "wood");
    controls.forEach(([name, control]) => control.setAttribute("aria-pressed", String(name === mode)));
  };
  for (const [label, mode] of modes) controls.push([mode, button(label, () => setMode(mode), "flow-toggle")]);
  setMode("shelf");
  return h("div", { class: "media-browser" },
    h("div", { class: "collection-toolbar", role: "group", "aria-label": "Modo de exibição" },
      controls.map(([, control]) => control)), stage, grid);
}

export function polaroid(url, title) {
  const photo = picture(url, title, "entry-image");
  if (!photo) return null;
  const frame = button(photo, () => {
    const enlarged = picture(url, title, "photo-enlarged");
    if (!enlarged) return;
    modal(title, enlarged, { class: "photo-dialog" });
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      enlarged.animate([
        { opacity: .35, transform: "scale(.94) translateY(8px)" },
        { opacity: 1, transform: "none" },
      ], { duration: 240, easing: "cubic-bezier(.16,1,.3,1)" });
    }
  }, "polaroid");
  frame.setAttribute("aria-label", `Ampliar foto: ${title}`);
  const screen = h("figure", { class: "polaroid-line" }, frame);
  frame.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    const rect = screen.getBoundingClientRect();
    const tilt = (event.clientX - rect.left) / rect.width - 0.5;
    frame.style.setProperty("--photo-tilt", `${tilt * 12}deg`);
  });
  frame.addEventListener("pointerleave", () => frame.style.removeProperty("--photo-tilt"));
  photo.addEventListener("error", () => screen.remove());
  return screen;
}
