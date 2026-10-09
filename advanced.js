import { h, notify } from "./ui.js";
import { renderMusic } from "./music.js";
import { renderAlbumSections, albumGrid } from "./album-pages.js";
import {
  renderPersonalHeader,
  renderSidebar,
  renderWall,
  renderPost,
  renderReview,
  renderList,
  renderActivity,
  publicPageData,
  themeStyle,
  userBooks,
} from "./personal.js";
import { booksGrid, panel } from "./ui.js";

export const SECTION_NAMES = {
  general: "Geral",
  header: "Header",
  sidebar: "Sidebar",
  wall: "Mural",
  posts: "Posts",
  books: "Livros",
  reviews: "Resenhas",
  lists: "Listas",
  footer: "Rodapé",
};
// Estrutura pronta para uma futura galeria; layouts não têm acesso ao armazenamento.
export const BASE_GALLERY = [
  {
    id: "personal-2007",
    name: "Página pessoal 2007",
    author: "MinhaEstante",
    version: 1,
  },
];
let stylesheetPromise;
const styles = () =>
  (stylesheetPromise ??= fetch("./styles.css").then((r) => {
    if (!r.ok) throw new Error("Não foi possível carregar o estilo da prévia.");
    return r.text();
  }));
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const scriptJSON = (value) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

export const SECTION_FIELDS = ["html", "css", "javascript"];

export const emptyOverrides = () => ({
  html: false,
  css: false,
  javascript: false,
});

const baseSection = (html, css = "", javascript = "") => ({
  html,
  css,
  javascript,
  overrides: emptyOverrides(),
});

const normalizeCodeText = (value) =>
  String(value ?? "").replace(/\r\n/g, "\n").trim();

const MANAGED_THEME_VARS = new Set([
  "--primary",
  "--secondary",
  "--link",
  "--outside",
  "--page",
  "--panel",
  "--text",
  "--font",
  "--heading",
  "--side-width",
]);

export function openMediaMessageDetail(data, nonce) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  if (
    data.channel !== "booksite-page" ||
    data.nonce !== nonce ||
    data.type !== "booksite:openmedia" ||
    (data.mediaType !== "album" && data.mediaType !== "book") ||
    typeof data.id !== "string"
  )
    return null;
  const id = data.id.trim();
  if (!id || id.length > 500) return null;
  if (data.username !== undefined && typeof data.username !== "string")
    return null;
  const username = (data.username || "").trim();
  if (username.length > 30 || (username && !/^[a-z0-9_-]+$/i.test(username)))
    return null;
  return { type: data.mediaType, id, username };
}

export function defaultCode(user, media = user.page._media || "books") {
  const c = user.page.customization,
    wall = [];
  if (media === "albums") {
    wall.push("{{albumContent}}");
    if (c.wallContent.includes("posts")) wall.push("{{posts}}");
    if (c.wallContent.includes("activity")) wall.push("{{activity}}");
  } else {
    for (const [type, placeholder] of [
      ["books", "books"],
      ["posts", "posts"],
      ["reviews", "reviews"],
      ["lists", "lists"],
      ["favorites", "favorites"],
      ["activity", "activity"],
    ])
      if (c.wallContent.includes(type)) wall.push(`{{${placeholder}}}`);
  }
  const sections = {
    general: baseSection(
      `<div class="personal-wrap pattern-{{backgroundPattern}}" style="{{defaultThemeStyle}}">\n  <article class="personal">\n    {{header}}\n    <div class="personal-layout {{sidebarPosition}}">\n      {{sidebar}}\n      {{wall}}\n    </div>\n    {{footer}}\n  </article>\n</div>`,
    ),
    header: baseSection("{{defaultHeader}}"),
    sidebar: baseSection(
      '<aside class="personal-sidebar">{{defaultSidebar}}</aside>',
    ),
    wall: baseSection(
      `<main class="personal-wall">\n${wall.join("\n")}\n</main>`,
    ),
    posts: baseSection(
      '<section class="panel"><div class="section-title"><h2>meu caderno</h2></div><div class="panel-body"><page-posts></page-posts></div></section>',
    ),
    books: baseSection(
      media === "albums"
        ? '<section class="panel"><div class="section-title"><h2>álbuns na minha página</h2></div><div class="panel-body">{{recentAlbums}}</div></section>'
        : '<section class="panel"><div class="section-title"><h2>quadrinhos na estante</h2></div><div class="panel-body">{{library}}</div></section>',
    ),
    reviews: baseSection(
      media === "albums"
        ? '<section class="panel"><div class="section-title"><h2>resenhas musicais</h2></div><div class="panel-body">{{albumContent}}</div></section>'
        : '<section class="panel"><div class="section-title"><h2>resenhas</h2></div><div class="panel-body"><book-reviews limit="5"></book-reviews></div></section>',
    ),
    lists: baseSection(
      media === "albums"
        ? '<section class="panel"><div class="section-title"><h2>listas de álbuns</h2></div><div class="panel-body">{{albumContent}}</div></section>'
        : '<section class="panel"><div class="section-title"><h2>minhas listas</h2></div><div class="panel-body"><book-lists></book-lists></div></section>',
    ),
    footer: baseSection(
      '<footer class="personal-footer">obrigado pela visita. volte quando quiser. ✦</footer>',
    ),
  };
  return {
    mode: "base",
    html: sections.general.html,
    css: "/* Seu CSS atua somente dentro desta página. */",
    javascript:
      "// pageData e pageAPI contêm apenas dados públicos desta página.\n",
    sections,
    updatedAt: null,
    previousVersion: null,
  };
}
export const rawCode = () => ({
  html: '<div class="custom-page">\n  <header><h1>{{user.displayName}}</h1><p>{{user.bio}}</p></header>\n  <main>{{content}}</main>\n</div>',
  css: "body { background: #ece9e5; color: #222; font-family: Georgia, serif; }\n.custom-page { max-width: 850px; margin: 30px auto; padding: 20px; }",
  javascript: "",
});
function presentationTokens(user, friendship = null) {
  const data = publicPageData(user),
    c = user.page.customization,
    media = user.page._media || "books";
  const posts = () =>
    data.posts
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((p) => renderPost(p, p.kind || "post", user).outerHTML)
      .join("") || "<p>nenhum texto por aqui.</p>";
  const reviews = (limit = 5) =>
    user.reviews
      .slice(0, limit)
      .map((r) => renderReview(r, user).outerHTML)
      .join("") || "<p>nenhuma resenha por aqui.</p>";
  const lists = () =>
    user.lists.map((l) => renderList(l, user).outerHTML).join("") ||
    "<p>nenhuma lista por aqui.</p>";
  return {
    data,
    posts,
    reviews,
    lists,
    values: {
      defaultHeader: renderPersonalHeader(user).outerHTML,
      defaultThemeStyle: themeStyle(user),
      backgroundPattern: c.backgroundPattern,
      sidebarPosition: c.sidebarPosition,
      library: booksGrid(data.library, user.ratings, c.wallStyle).outerHTML,
      favorites: booksGrid(data.favorites, user.ratings, c.wallStyle).outerHTML,
      currentlyReading: booksGrid(data.reading, user.ratings).outerHTML,
      favoriteAlbums: albumGrid(data.favoriteAlbums, user, c.wallStyle)
        .outerHTML,
      recentAlbums: albumGrid(data.albums.slice(0, 12), user, c.wallStyle)
        .outerHTML,
      currentlyListening: albumGrid(data.currentlyListening, user, c.wallStyle)
        .outerHTML,
      albumContent: renderAlbumSections(user)?.outerHTML || "",
      recentReviews: reviews(),
      activity: renderActivity(user.activity, user.username).outerHTML,
      content: renderWall(user, media).outerHTML,
      defaultSidebar: renderSidebar(user, media, friendship).innerHTML,
    },
  };
}

export function upgradeLegacyGeneralHtml(html) {
  let value = String(html ?? "");
  if (!value.includes("personal-wrap")) return value;

  value = value.replace(
    /\bpattern-(plain|checker|dots|stripes|paper|textured)\b/,
    "pattern-{{backgroundPattern}}",
  );

  value = value.replace(
    /\bpersonal-layout\s+(left|right)\b/,
    "personal-layout {{sidebarPosition}}",
  );

  value = value.replace(
    /style=(["'])([\s\S]*?)\1/i,
    (match, quote, styleText) => {
      if (!styleText.includes("--primary:") || !styleText.includes("--side-width:"))
        return match;

      const extras = String(styleText)
        .split(";")
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item) => {
          const name = item.split(":", 1)[0].trim();
          return !MANAGED_THEME_VARS.has(name);
        });

      const merged = `{{defaultThemeStyle}}${
        extras.length ? `;${extras.join(";")}` : ""
      }`;

      return `style=${quote}${merged}${quote}`;
    },
  );

  return value;
}

export function isLegacyDefaultHeader(html) {
  const value = normalizeCodeText(html);
  if (!value) return false;
  if (value === "{{defaultHeader}}") return true;

  if (!/^<header\b/i.test(value)) return false;
  if (!/<\/header>$/.test(value)) return false;
  if (!/class=(["'])[^"']*\bpersonal-header\b[^"']*\1/i.test(value))
    return false;
  if (!/class=(["'])[^"']*\bpersonal-header-content\b[^"']*\1/i.test(value))
    return false;
  if (!/<h1\b[^>]*>[\s\S]*<\/h1>/i.test(value)) return false;
  if (!/<p\b[^>]*>[\s\S]*<\/p>/i.test(value)) return false;

  if (
    /<script\b|<style\b|\son[a-z]+\s*=|\sdata-[\w-]+\s*=|\s(?:id|style)\s*=/i.test(
      value,
    )
  )
    return false;

  const tags = [...value.matchAll(/<\/?([a-z][\w-]*)\b/gi)].map((match) =>
    match[1].toLowerCase(),
  );
  const allowedTags = new Set([
    "header",
    "div",
    "img",
    "h1",
    "p",
    "span",
    "a",
    "details",
    "summary",
    "strong",
  ]);
  if (tags.some((tag) => !allowedTags.has(tag))) return false;

  const allowedClasses = new Set([
    "personal-header",
    "left",
    "center",
    "right",
    "has-banner",
    "personal-banner",
    "personal-header-content",
    "personal-header-identity",
    "user-identity",
    "user-identity-link",
    "user-identity-label",
    "creator-badge",
    "creator-badge-popup",
  ]);

  for (const match of value.matchAll(/class=(["'])([^"']*)\1/gi)) {
    const classes = match[2].split(/\s+/).filter(Boolean);
    if (classes.some((className) => !allowedClasses.has(className))) return false;
  }

  return true;
}

export function isLegacyManagedWallHtml(html) {
  const value = normalizeCodeText(html);
  if (!value) return false;

  return /^<main class="personal-wall">\s*(?:\{\{\s*(?:books|posts|reviews|lists|favorites|activity|albumContent)\s*\}\}\s*)*<\/main>$/.test(
    value,
  );
}

export function migrateBaseCode(
  code,
  user,
  media = user.page._media || "books",
) {
  const current = structuredClone(code || {});

  if (current.mode === "raw") return current;

  const defaults = defaultCode(user, media);
  const next = {
    ...current,
    sections: {},
  };

  for (const key of Object.keys(SECTION_NAMES)) {
    const defaultSection = defaults.sections[key];
    const savedSection = current.sections?.[key];

    if (!savedSection) {
      next.sections[key] = structuredClone(defaultSection);
      continue;
    }

    let savedHtml = String(savedSection.html ?? defaultSection.html);

    if (key === "general") {
      savedHtml = upgradeLegacyGeneralHtml(savedHtml);
    }

    if (key === "header" && isLegacyDefaultHeader(savedHtml)) {
      savedHtml = "{{defaultHeader}}";
    }

    const existingOverrides = savedSection.overrides;

    let htmlOverride;
    let cssOverride;
    let javascriptOverride;

    if (
      existingOverrides &&
      typeof existingOverrides === "object" &&
      !Array.isArray(existingOverrides)
    ) {
      htmlOverride = !!existingOverrides.html;
      cssOverride = !!existingOverrides.css;
      javascriptOverride = !!existingOverrides.javascript;
    } else {
      if (key === "wall" && isLegacyManagedWallHtml(savedHtml)) {
        htmlOverride = false;
      } else {
        htmlOverride =
          normalizeCodeText(savedHtml) !== normalizeCodeText(defaultSection.html);
      }

      cssOverride =
        normalizeCodeText(savedSection.css) !==
        normalizeCodeText(defaultSection.css);

      javascriptOverride =
        normalizeCodeText(savedSection.javascript) !==
        normalizeCodeText(defaultSection.javascript);
    }

    const overrides = {
      html: htmlOverride,
      css: cssOverride,
      javascript: javascriptOverride,
    };

    next.sections[key] = {
      html: htmlOverride ? savedHtml : defaultSection.html,
      css: cssOverride ? String(savedSection.css ?? "") : defaultSection.css,
      javascript: javascriptOverride
        ? String(savedSection.javascript ?? "")
        : defaultSection.javascript,
      overrides,
    };
  }

  return next;
}

export async function advancedDocument(user, code, nonce, { friendship = null } = {}) {
  const media = user.page._media || "books";
  const effectiveCode =
    code?.mode === "raw"
      ? structuredClone(code)
      : migrateBaseCode(code, user, media);
  const tokens = presentationTokens(user, friendship);
  const sections = effectiveCode.sections || {};
  function expand(html, depth = 0) {
    if (depth > 7) return "<p>Referência circular no template.</p>";
    return String(html)
      .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
        if (key.startsWith("user."))
          return escape(tokens.data.user[key.slice(5)] || "");
        if (effectiveCode.mode === "base" && sections[key])
          return expand(sections[key].html, depth + 1);
        if (key === "posts") return tokens.posts();
        if (key === "lists") return tokens.lists();
        if (key === "reviews") return tokens.reviews();
        return tokens.values[key] ?? "";
      })
      .replace(
        /<(book-currently-reading|book-favorites|book-reviews|book-lists|album-recent|album-favorites|album-currently-listening|page-posts|page-activity)\b([^>]*)>\s*<\/\1>/gi,
        (_, name, attrs) => {
          const limit = Math.min(
            50,
            Math.max(
              1,
              Number(attrs.match(/limit\s*=\s*["']?(\d+)/i)?.[1] || 5),
            ),
          );
          return {
            "book-currently-reading": () => tokens.values.currentlyReading,
            "book-favorites": () => tokens.values.favorites,
            "book-reviews": () => tokens.reviews(limit),
            "book-lists": () => tokens.lists(),
            "album-recent": () => tokens.values.recentAlbums,
            "album-favorites": () => tokens.values.favoriteAlbums,
            "album-currently-listening": () => tokens.values.currentlyListening,
            "page-posts": () => tokens.posts(),
            "page-activity": () => tokens.values.activity,
          }[name.toLowerCase()]();
        },
      );
  }
  const html = expand(
    effectiveCode.mode === "base"
      ? sections.general.html
      : effectiveCode.html,
  );
  const css =
    (await styles()) +
    "\nbody{margin:0;background:#ece9e5}.web-badge{width:88px;height:31px}\n" +
    (effectiveCode.mode === "base"
      ? Object.values(sections)
          .map((s) => s.css || "")
          .join("\n")
      : "") +
    "\n" +
    (effectiveCode.css || "");
  const js =
    (effectiveCode.mode === "base"
      ? Object.values(sections)
          .map((s) => s.javascript || "")
          .join("\n")
      : "") +
    "\n" +
    (effectiveCode.javascript || "");
  const bridge = `const nonce=${scriptJSON(nonce)};const appOrigin=${scriptJSON(globalThis.location?.origin || "")};window.pageData=${scriptJSON(tokens.data)};
 const clone=v=>JSON.parse(JSON.stringify(v));window.pageAPI=Object.freeze({getCurrentBook:()=>clone(pageData.reading[0]||null),getFavorites:()=>clone(pageData.favorites),getReviews:()=>clone(pageData.reviews),getLists:()=>clone(pageData.lists),getPosts:()=>clone(pageData.posts),getAlbums:()=>clone(pageData.albums||[]),getFavoriteAlbums:()=>clone(pageData.favoriteAlbums||[]),getCurrentlyListening:()=>clone(pageData.currentlyListening||[])});
 const send=(type,value)=>parent.postMessage({channel:'booksite-page',nonce,type,value},'*');
 const sendMedia=(mediaType,id,username)=>parent.postMessage({channel:'booksite-page',nonce,type:'booksite:openmedia',mediaType,id,username},'*');
 document.addEventListener('error',e=>{if(e.target?.tagName==='IMG')e.target.remove();},true);
 addEventListener('error',e=>{if(e.message)send('error',String(e.message).slice(0,200));});
 addEventListener('unhandledrejection',e=>send('error',String(e.reason).slice(0,200)));
 addEventListener('click',e=>{const friendButton=e.target.closest?.('[data-friend-action]');if(friendButton){e.preventDefault();send('friend-action',{action:friendButton.dataset.friendAction||'',targetId:friendButton.closest?.('[data-friend-target-id]')?.dataset.friendTargetId||'',targetName:friendButton.closest?.('[data-friend-target-name]')?.dataset.friendTargetName||'',friendshipId:friendButton.dataset.friendshipId||''});return;}const a=e.target.closest?.('a');const rawHref=a?.getAttribute('href')||'';if(!rawHref)return;let href=rawHref;if(!href.startsWith('#/')){try{const absolute=new URL(href,appOrigin+'/');if(absolute.origin!==appOrigin||!absolute.hash.startsWith('#/'))return;href=absolute.hash;}catch{return;}}const media=href.match(new RegExp('^#/(livro|album)/([^?]+)(?:[?]([^#]*))?$'));if(media){e.preventDefault();let id='';try{id=decodeURIComponent(media[2]);}catch{return;}const username=new URLSearchParams(media[3]||'').get('user')||'';if(id)sendMedia(media[1]==='album'?'album':'book',id,username);return;}e.preventDefault();send('navigate',href);});
 addEventListener('load',()=>{let last=0;new ResizeObserver(()=>{const height=Math.max(400,document.body.scrollHeight);if(Math.abs(last-height)>3){last=height;send('height',height);}}).observe(document.body);});`;
  // A CSP precede qualquer HTML do usuário. Nunca acrescentar allow-same-origin ao sandbox.
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: http: data:; connect-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.replace(/<\/style/gi, "<\\/style")}</style><script>${bridge}<\/script></head><body>${html}<script>${js.replace(/<\/script/gi, "<\\/script")}<\/script></body></html>`;
}
export async function advancedFrame(user, code, { preview = false, friendship = null } = {}) {
  const nonce = (globalThis.crypto?.randomUUID?.() ?? (globalThis.crypto?.getRandomValues ? Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("") : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)),
    frame = h("iframe", {
      class: preview ? "preview-frame" : "custom-frame",
      sandbox: "allow-scripts allow-popups allow-popups-to-escape-sandbox",
      title: preview
        ? "Prévia isolada da sua página"
        : "Página pessoal em ambiente isolado",
      referrerpolicy: "no-referrer",
    });
  frame.srcdoc = await advancedDocument(user, code, nonce, { friendship });
  let errors = 0;
  const listener = (e) => {
    if (
      e.source !== frame.contentWindow ||
      e.data?.channel !== "booksite-page" ||
      e.data.nonce !== nonce
    )
      return;
    const mediaDetail = openMediaMessageDetail(e.data, nonce);
    if (mediaDetail) {
      window.dispatchEvent(
        new CustomEvent("booksite:openmedia", { detail: mediaDetail }),
      );
      return;
    }
    if (e.data.type === "friend-action" && e.data.value && typeof e.data.value === "object") {
      window.dispatchEvent(
        new CustomEvent("booksite:friend-action", { detail: e.data.value }),
      );
      return;
    }
    if (e.data.type === "height" && !preview && Number.isFinite(e.data.value))
      frame.style.height =
        Math.min(12000, Math.max(400, e.data.value + 12)) + "px";
    if (e.data.type === "error" && preview && errors++ < 3)
      notify(`Prévia: ${String(e.data.value).slice(0, 200)}`, true);
    if (
      e.data.type === "navigate" &&
      /^#\/(livro\/[\w-]+|album\/[\w-]+(?:\?user=[\w-]+)?|lista-albuns\/[\w-]+|albuns(?:\?[^\s]*)?|colecao-albuns(?:\/[\w-]+)?(?:\?user=[\w-]+)?|listas(?:\?[^\s]*)?|resenhas(?:\?[^\s]*)?|lista\/[\w-]+|pagina\/[\w-]+|livros(?:\?[^\s]*)?|catalogo(?:\?[^\s]*)?|estante\/[\w-]+(?:\?user=[\w-]+)?|diario(?:\?user=[\w-]+)?)$/.test(
        e.data.value,
      )
    )
      location.hash = e.data.value;
  };
  window.addEventListener("message", listener);
  const observer = new MutationObserver(() => {
    if (!frame.isConnected) {
      window.removeEventListener("message", listener);
      observer.disconnect();
    }
  });
  // Observação começa após o chamador anexar o iframe.
  setTimeout(() => {
    if (frame.isConnected)
      observer.observe(document.body, { childList: true, subtree: true });
    else window.removeEventListener("message", listener);
  }, 1000);
  // O player confiável fica fora do código pessoal; o sandbox continua fechado.
  return h(
    "div",
    { class: "advanced-personal" },
    preview && renderMusic(user.page.music),
    !preview && h("div", { class: "profile-music-slot" }),
    frame,
  );
}
