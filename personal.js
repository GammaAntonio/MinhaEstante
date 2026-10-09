import {
  h, link, panel, booksGrid, bookCard, empty, picture, stars, date, cover,
} from "./ui.js";
import { getBook, bookForUser, users as allUsers } from "./storage.js";
import { GADGETS, STATUS, DEFAULT_THEME, FONTS } from "./data.js";
import { renderMusic } from "./music.js";
import { renderAlbumSections, albumGrid } from "./album-pages.js";
import { albumState, userAlbums, getAlbum, resolveAlbum } from "./album-store.js";
import { mediaUser } from "./page-media.js";
import { userIdentity } from "./identity.js";

export const userBooks = (user, predicate = () => true) =>
  user.library.filter(predicate).map((entry) =>
    bookForUser(user, entry.bookId) || {
      id: entry.bookId, type: "book", title: "Livro da estante",
      authors: ["Metadados indisponíveis"],
    });

export function renderPost(post, kind = "post", user = null) {
  return h("article", { class: "entry" },
    h("div", { class: "meta" }, kind === "journal" ? "diário" : "post",
      user && " · ", user && userIdentity(user, { linkProfile: true }),
      " · ", date(post.date)),
    h("h3", {}, post.title),
    h("p", {}, post.text),
    post.image && picture(post.image, post.title, "entry-image"),
    post.bookIds?.length > 0 && h("div", { class: "tags" },
      post.bookIds.map((id) => {
        const b = getBook(id);
        return b && link(b.title, `#/livro/${id}`, { class: "tag" });
      })));
}

export function renderReview(review, user) {
  const book = bookForUser(user, review.bookId);
  return h("article", {
    class: `entry ${user?.page.customization.reviewStyle === "compact" ? "review-compact" : ""}`,
  },
    h("div", { class: "meta" },
      user && userIdentity(user, { linkProfile: true }),
      user && " · ", date(review.date)),
    h("h3", {}, link(book?.title || "Livro", `#/livro/${review.bookId}`)),
    review.rating && stars(review.rating),
    h("p", {}, review.text),
    review.edition && h("small", {}, `edição: ${review.edition}`));
}

export function renderList(list, user = null) {
  return h("article", { class: "entry" },
    h("h3", {}, link(list.title, `#/lista/${list.id}`)),
    h("p", {}, list.description),
    h("div", { class: "list-preview" }, list.bookIds.slice(0, 5).map((id) => {
      const b = bookForUser(user, id);
      return b && link(cover(b), `#/livro/${id}`, { "aria-label": b.title });
    })),
    h("small", {}, `${list.bookIds.length} livros`, user && " · por ",
      user && userIdentity(user, { linkProfile: true }), ` · ${date(list.date)}`));
}

export function renderActivity(items, username = "") {
  return items.length ?
    h("ul", { class: "small-nav" }, items.slice(0, 12).map((a) =>
      h("li", {}, h("small", {}, date(a.date)),
        h("div", {}, a.albumId ?
          link(a.text, `#/album/${a.albumId}${username ? `?user=${encodeURIComponent(username)}` : ""}`) :
          a.bookId ? link(a.text, `#/livro/${a.bookId}`) : a.text)))) :
    empty("nenhuma atividade ainda.",
      "quando acontecer alguma coisa minimamente interessante, aparece aqui.");
}

export function avatar(user) {
  const url = user.page.avatar ||
    `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(user.username)}&backgroundColor=701d2c`;
  return h("div", { class: "avatar" }, user.page.displayName.charAt(0).toUpperCase(),
    picture(url, `Avatar de ${user.page.displayName}`));
}

function friendshipProfileControl(user, friendship) {
  if (!friendship || friendship.state === "self") return null;
  const attrs = {
    class: "profile-friendship-control",
    "data-friend-target-id": String(friendship.targetId || user.id || ""),
    "data-friend-target-name": user.page?.displayName || user.username || "usuário",
  };
  if (friendship.state === "logged-out") return h("div", attrs,
    link("entrar para adicionar amigo", "#/login", { class: "button" }));
  if (friendship.state === "friends") return h("div", attrs,
    h("button", { type: "button", class: "button", "data-friend-action": "remove" }, "remover amizade"));
  if (friendship.state === "outgoing") return h("div", attrs,
    h("span", { class: "friend-status pending" }, "solicitação enviada"));
  if (friendship.state === "incoming") {
    return h("div", { ...attrs, class: "profile-friendship-control friend-actions" },
      h("button", {
        type: "button", class: "button primary", "data-friend-action": "accept",
        "data-friendship-id": String(friendship.friendshipId || ""),
      }, "aceitar amizade"),
      h("button", {
        type: "button", class: "button", "data-friend-action": "reject",
        "data-friendship-id": String(friendship.friendshipId || ""),
      }, "recusar"));
  }
  return h("div", attrs,
    h("button", { type: "button", class: "button primary", "data-friend-action": "add" },
      "adicionar amigo"));
}

function socialURL(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const withProtocol = raw.startsWith("//") ? `https:${raw}` :
    /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    if (!["https:", "http:"].includes(url.protocol)) return "";
    if (!url.hostname.includes(".") || url.username || url.password) return "";
    return url.href;
  } catch {
    return "";
  }
}

function socialAnchor(label, href) {
  const anchor = document.createElement("a");
  anchor.className = "profile-social-link";
  anchor.href = href;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.textContent = label;
  anchor.title = `Abrir ${label} em outra aba`;
  anchor.addEventListener("click", (event) => event.stopPropagation());
  return anchor;
}

export function gadgetBody(g, user, media = "books", friendship = null) {
  const p = user.page;
  const albumsMode = media === "albums";
  switch (g.type) {
    case "about":
      return h("div", { class: "panel-body" },
        avatar(user), h("div", { class: "about-name" }, p.displayName),
        h("small", {}, userIdentity(user, { username: true, linkProfile: true })),
        h("p", { class: "about-text" },
          p.bio || "essa pessoa não escreveu uma bio. talvez tenha prioridades melhores."),
        friendshipProfileControl(user, friendship));
    case "reading":
      return albumsMode ?
        albumGrid(userAlbums(user, (e) => e.status === "ouvindo").slice(0, 2), user) :
        booksGrid(userBooks(user, (e) => e.status === "lendo").slice(0, 2), user.ratings);
    case "shelves":
      if (albumsMode) {
        const state = albumState(user);
        return h("ul", { class: "small-nav" },
          Object.entries({
            todos: "Todos", favoritos: "Favoritos", ouvido: "Ouvidos",
            ouvindo: "Ouvindo", "quero-ouvir": "Quero ouvir",
          }).map(([key, name]) => h("li", {}, link([
            name,
            h("span", {}, state.library.filter((x) => key === "todos" ? true :
              key === "favoritos" ? x.favorite : x.status === key).length),
          ], `#/colecao-albuns/${key}?user=${user.username}`))));
      }
      return h("ul", { class: "small-nav" },
        Object.entries({ ...STATUS, favoritos: "Favoritos" }).map(([key, name]) =>
          h("li", {}, link([
            name,
            h("span", {}, user.library.filter((x) =>
              key === "favoritos" ? x.favorite : x.status === key).length),
          ], `#/estante/${key}?user=${user.username}`))));
    case "favorites":
      return albumsMode ?
        albumGrid(userAlbums(user, (e) => e.favorite).slice(0, 6), user) :
        booksGrid(userBooks(user, (e) => e.favorite).slice(0, 6), user.ratings);
    case "lists": {
      if (albumsMode) {
        const lists = albumState(user).lists.filter((l) => !g.listIds?.length || g.listIds.includes(l.id));
        return h("div", { class: "panel-body" }, lists.length ?
          lists.slice(0, 6).map((l) => h("article", { class: "entry" },
            h("h3", {}, link(l.title, `#/lista-albuns/${l.id}`)),
            h("p", {}, l.description || ""), h("small", {}, `${l.albumIds.length} álbuns`))) :
          empty("nenhuma lista por aqui.", "Ideias para juntar álbuns."));
      }
      const lists = user.lists.filter((l) => !g.listIds?.length || g.listIds.includes(l.id));
      return h("div", { class: "panel-body" }, lists.length ?
        lists.slice(0, 6).map((list) => renderList(list, user)) :
        empty("nenhuma lista por aqui.", "Ideias para juntar livros."));
    }
    case "reviews":
      if (albumsMode) {
        const reviews = albumState(user).reviews;
        return h("div", { class: "panel-body" }, reviews.length ?
          reviews.slice(0, 3).map((r) => {
            const album = resolveAlbum(user, r.albumId);
            return h("article", { class: "entry" },
              h("h3", {}, link(album?.title || "Álbum", `#/album/${r.albumId}?user=${user.username}`)),
              r.rating && stars(r.rating), h("p", {}, r.text));
          }) : empty("nenhuma resenha ainda. opiniões existem, só não chegaram aqui."));
      }
      return h("div", { class: "panel-body" }, user.reviews.length ?
        user.reviews.slice(0, 3).map((r) => renderReview(r, user)) :
        empty("nenhuma resenha ainda. opiniões existem, só não chegaram aqui."));
    case "activity":
      return renderActivity(albumsMode ?
        user.activity.filter((a) => a.albumId) : user.activity.filter((a) => !a.albumId), user.username);
    case "posts":
      return h("ul", { class: "small-nav" },
        [...user.posts, ...user.journal].sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 5).map((p) => h("li", {}, link(p.title, `#/diario?user=${user.username}`))),
        !user.posts.length && !user.journal.length &&
          h("li", {}, "nada escrito aqui ainda. o espaço pelo menos está bonito."));
    case "tags":
      return h("div", { class: "panel-body tags" }, p.favoriteGenres.length ?
        p.favoriteGenres.map((t) => link(t, albumsMode ?
          `#/albuns?q=${encodeURIComponent(t)}` : `#/livros?q=${encodeURIComponent(t)}`,
          { class: "tag" })) : "ainda sem tags.");
    case "month": {
      if (albumsMode) {
        const album = resolveAlbum(user, g.albumId || g.bookId);
        return h("div", { class: "panel-body" },
          album ? albumGrid([album], user) : "nenhum álbum do mês escolhido.");
      }
      const book = bookForUser(user, g.bookId);
      return h("div", { class: "panel-body" },
        book ? bookCard(book) : "nenhum livro do mês escolhido.");
    }
    case "text":
      return h("div", { class: "panel-body free-text" },
        g.text || "nada escrito aqui ainda. o espaço pelo menos está bonito.");
    case "image":
      return h("div", { class: "panel-body" },
        picture(g.image, g.text || "Imagem da página", "entry-image") || "escolha uma imagem no editor.");
    case "links": {
      const links = (Array.isArray(p.links) ? p.links : [])
        .filter((item) => item && typeof item === "object")
        .map((item) => ({ ...item, href: socialURL(item.url) })).filter((item) => item.href);
      return h("ul", { class: "small-nav profile-social-links" },
        links.map((item) => h("li", {}, socialAnchor(item.label || item.href, item.href))),
        !links.length && h("li", {}, "nenhum link ainda."));
    }
    case "badges":
      return h("div", { class: "panel-body tags" }, p.badges?.length ?
        p.badges.map((b) => picture(b, "Badge pessoal", "web-badge")) : [
          h("span", { class: "badge" }, "livros & café"),
          h("span", { class: "badge" }, "web pessoal"),
        ]);
    case "stats":
      if (albumsMode) {
        const state = albumState(user);
        return h("ul", { class: "small-nav" }, [
          [state.library.filter((x) => x.status === "ouvido").length, "álbuns ouvidos"],
          [Object.keys(state.ratings).length, "avaliações de álbuns"],
          [Object.values(state.trackRatings || {}).reduce((n, item) =>
            n + Object.keys(item).length, 0), "faixas avaliadas"],
          [state.reviews.length, "resenhas musicais"],
        ].map(([n, t]) => h("li", {}, `${n} ${t}`)));
      }
      return h("ul", { class: "small-nav" }, [
        [user.library.filter((x) => x.status === "lidos").length, "livros lidos"],
        [Object.keys(user.ratings).length, "avaliações"],
        [user.reviews.length, "resenhas"], [user.lists.length, "listas"],
      ].map(([n, t]) => h("li", {}, `${n} ${t}`)));
    default:
      return null;
  }
}

const albumGadgetNames = {
  reading: "Ouvindo agora", shelves: "Meus álbuns", favorites: "Álbuns favoritos",
  lists: "Listas de álbuns", reviews: "Resenhas musicais",
  month: "Álbum do mês", stats: "Estatísticas musicais",
};

function friendsPanel(user) {
  const ids = Array.isArray(user?.social?.friendIds) ? user.social.friendIds : [];
  const friends = ids.map((id) => allUsers().find((item) => String(item.id) === String(id)))
    .filter(Boolean).slice(0, 6);
  return panel(`amigos (${Number(user?.social?.friendCount || ids.length || 0)})`,
    friends.length ?
      h("div", { class: "profile-friends-grid" },
        friends.map((friend) => link([
          h("span", { class: "profile-friend-avatar" }, friend.page.avatar ?
            picture(friend.page.avatar, "", "") : friend.page.displayName.charAt(0).toUpperCase()),
          h("small", {}, friend.page.displayName),
        ], `#/pagina/${friend.username}`, { class: "profile-friend" }))) :
      h("div", { class: "panel-body muted" }, "nenhum amigo adicionado ainda."),
    link("ver todos", `#/amigos?user=${user.username}`));
}

export function renderSidebar(user, media = "books", friendship = null) {
  return h("aside", { class: "personal-sidebar" },
    [...user.page.gadgets].sort((a, b) => a.position - b.position)
      .filter((g) => g.enabled).map((g) =>
        panel(media === "albums" ? albumGadgetNames[g.type] || GADGETS[g.type] : GADGETS[g.type],
          gadgetBody(g, user, media, friendship))),
    friendsPanel(user));
}

export function renderWall(user, media = "books") {
  const c = user.page.customization;
  const types = c.wallContent;
  if (media === "albums") {
    const albumSections = renderAlbumSections(user);
    const blocks = [];
    if (albumSections) blocks.push(albumSections);
    if (types.includes("posts")) {
      const posts = [...user.posts, ...user.journal]
        .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
      blocks.push(panel("meu caderno", h("div", { class: "entries" },
        posts.length ? posts.map((p) => renderPost(p, "post", user)) :
          empty("nada escrito aqui ainda. o espaço pelo menos está bonito."))));
    }
    if (types.includes("activity")) {
      blocks.push(panel("notícias musicais",
        renderActivity(user.activity.filter((a) => a.albumId), user.username)));
    }
    return h("div", { class: `personal-wall wall-${c.wallStyle}` }, blocks.length ? blocks :
      empty("nenhuma música pra mostrar. silêncio editorial.", "Adicione álbuns ou ative módulos no editor."));
  }
  const blocks = [];
  if (types.includes("books")) {
    blocks.push(panel(user.isCreator ? "quadrinhos na estante" : "livros na estante",
      booksGrid(userBooks(user).slice(0, 18), user.ratings, c.wallStyle),
      link("ver estantes", `#/estante/todos?user=${user.username}`)));
  }
  const entries = [];
  if (types.includes("posts")) entries.push(
    ...user.posts.map((p) => ({ date: p.date, el: renderPost(p, "post", user) })),
    ...user.journal.map((p) => ({ date: p.date, el: renderPost(p, "journal", user) })));
  if (types.includes("reviews")) entries.push(
    ...user.reviews.map((r) => ({ date: r.date, el: renderReview(r, user) })));
  if (types.includes("lists")) entries.push(
    ...user.lists.map((l) => ({ date: l.date, el: renderList(l, user) })));
  if (types.some((x) => ["posts", "reviews", "lists"].includes(x))) {
    blocks.push(panel(c.wallStyle === "blog" ? "meu caderno" : "textos, listas & outras coisas",
      h("div", { class: "entries" }, entries.length ?
        entries.sort((a, b) => b.date.localeCompare(a.date)).map((e) => e.el) :
        empty("nada publicado. uma disciplina admirável."))));
  }
  if (types.includes("favorites")) blocks.push(panel("os que passaram no processo seletivo",
    booksGrid(userBooks(user, (e) => e.favorite).slice(0, 10), user.ratings, c.wallStyle)));
  if (types.includes("activity")) blocks.push(panel("últimos acontecimentos de relevância discutível",
    renderActivity(user.activity.filter((a) => !a.albumId), user.username)));
  return h("div", { class: `personal-wall wall-${c.wallStyle}` }, blocks.length ? blocks :
    empty("nenhum bloco aqui. minimalismo involuntário.", "Os módulos podem ser escolhidos no editor da página."));
}

export function themeStyle(user) {
  const c = user.page.customization || DEFAULT_THEME;
  const colors = {
    primary: "primaryColor", secondary: "secondaryColor", link: "linkColor",
    outside: "backgroundColor", page: "pageColor", panel: "panelColor", text: "textColor",
  };
  const parts = [];
  for (const [key, prop] of Object.entries(colors)) {
    parts.push(`--${key}:${/^#[0-9a-f]{6}$/i.test(c[prop]) ? c[prop] : DEFAULT_THEME[prop]}`);
  }
  parts.push(
    `--font:'${FONTS.includes(c.fontFamily) ? c.fontFamily : "Tahoma"}'`,
    `--heading:'${FONTS.includes(c.headingFont) ? c.headingFont : "Georgia"}'`,
    `--side-width:${{ narrow: "165px", normal: "200px", wide: "250px" }[c.sidebarWidth] || "200px"}`);
  return parts.join(";");
}

export function renderPersonalHeader(user) {
  const p = user.page;
  const hasBanner = !!p.banner;
  return h("header", {
    class: `personal-header ${p.customization.headerStyle}${hasBanner ? " has-banner" : ""}`,
  },
    hasBanner && picture(p.banner, "", "personal-banner"),
    h("div", { class: "personal-header-content" },
      h("h1", {}, p.title), h("p", {}, p.subtitle),
      h("div", { class: "personal-header-identity" },
        userIdentity(user, { username: true, linkProfile: true }))));
}

export function renderPersonalPage(user, { preview = false, media = "books", friendship = null } = {}) {
  const view = mediaUser(user, media);
  const c = view.page.customization;
  return h("div", { class: `personal-wrap pattern-${c.backgroundPattern}`, style: themeStyle(view) },
    h("article", { class: "personal" },
      renderPersonalHeader(view),
      preview && renderMusic(user.page.music),
      !preview && h("div", { class: "profile-music-slot" }),
      h("div", { class: "personal-topbar" },
        h("span", {}, "você está na página de ",
          userIdentity(user, { username: true, linkProfile: true }), ". tente não mexer em nada."),
        h("small", {}, media === "albums" ? "álbuns · faixas · resenhas" : "livros · textos · listas")),
      h("div", { class: `personal-layout ${c.sidebarPosition}` },
        renderSidebar(view, media, friendship), renderWall(view, media)),
      h("footer", { class: "personal-footer" },
        "valeu pela visita. não sei como você chegou aqui. ",
        h("span", { "aria-hidden": "true" }, "✦"))));
}

export function publicPageData(user) {
  const books = userBooks(user);
  return {
    user: {
      username: user.username, isCreator: !!user.isCreator,
      displayName: user.page.displayName, bio: user.page.bio,
      title: user.page.title, subtitle: user.page.subtitle,
    },
    library: books,
    reading: userBooks(user, (e) => e.status === "lendo"),
    favorites: userBooks(user, (e) => e.favorite),
    albums: userAlbums(user),
    favoriteAlbums: userAlbums(user, (e) => e.favorite),
    currentlyListening: userAlbums(user, (e) => e.status === "ouvindo"),
    albumReviews: structuredClone(albumState(user).reviews),
    albumLists: structuredClone(albumState(user).lists),
    reviews: structuredClone(user.reviews),
    lists: structuredClone(user.lists),
    posts: structuredClone([...user.posts, ...user.journal]),
    activity: structuredClone(user.activity),
  };
}