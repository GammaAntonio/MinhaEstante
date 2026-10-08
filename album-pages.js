import {
  h,
  link,
  button,
  input,
  textarea,
  select,
  check,
  field,
  formSubmit,
  modal,
  notify,
  panel,
  empty,
  bookCard,
  cover,
  stars,
  date,
  confirmAction,
  guarded,
} from "./ui.js";
import { MusicBrainzService } from "./music-api.js";
import {
  albumState,
  userAlbums,
  getAlbum,
  cacheAlbums,
  albumCatalog,
  mutateAlbums,
  albumActivity,
  ALBUM_STATUS,
  setAlbumStatus,
  favoriteAlbum,
  removeAlbumFromCollection,
  rateAlbum,
  rateTrack,
  trackRating,
  resolveAlbum,
  rememberAlbum,
  ensureAlbumInLibrary,
} from "./album-store.js";
import { currentUser, users, userByName, uid } from "./storage.js";
import { navigate } from "./router.js";
import { uploadMP3, renderMusic, DEFAULT_MUSIC } from "./music.js";
import { userIdentity } from "./identity.js";
const refresh = () => window.dispatchEvent(new HashChangeEvent("hashchange"));
const submit = (label) =>
  h("button", { type: "submit", class: "primary" }, label);
const ratings = {
  0: "Sem nota",
  ...Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [
      (i + 1) / 2,
      `${(i + 1) / 2} estrelas`,
    ]),
  ),
};
const owner = (user) => user && currentUser()?.id === user.id;
export function catalogModes(selected = "books") {
  return h(
    "div",
    { class: "toolbar", "aria-label": "Modalidade do catálogo" },
    link("Livros", "#/livros", {
      class: `button ${selected === "books" ? "active" : ""}`,
    }),
    link("Álbuns", "#/albuns", {
      class: `button ${selected === "albums" ? "active" : ""}`,
    }),
  );
}
export function albumGrid(albums, user, style = "grid") {
  if (!albums.length)
    return empty(
      "nenhum álbum nesta seleção.",
      "Explore o catálogo musical para começar.",
    );
  return h(
    "div",
    { class: `books album-grid ${style}` },
    albums.map((album) => {
      const card = bookCard(album, {
        rating: albumState(user).ratings[album.id],
      });
      if (user) {
        for (const anchor of card.querySelectorAll("a")) {
          const href = anchor.getAttribute("href") || "";
          if (href.startsWith("#/album/")) {
            const separator = href.includes("?") ? "&" : "?";
            anchor.setAttribute(
              "href",
              `${href}${separator}user=${encodeURIComponent(user.username)}`,
            );
          }
          anchor.dataset.user = user.username;
        }
      }
      return card;
    }),
  );
}
export function albumCatalogPage(query, active) {
  const q = query.get("q") || "",
    page = Math.max(1, parseInt(query.get("page")) || 1),
    type = query.get("type") || "all";
  const status = h("p", { role: "status" }),
    results = h("div");
  const form = h(
    "form",
    { class: "search-form" },
    field(
      "Pesquisar álbuns",
      input("query", q, {
        placeholder: "procurar álbum ou artista…",
        required: true,
        maxlength: 200,
      }),
    ),
    select(
      "type",
      { all: "Álbum + artista", title: "Álbum", artist: "Artista" },
      type,
    ),
    submit("buscar"),
  );
  formSubmit(form, (data) =>
    navigate(
      `/albuns?q=${encodeURIComponent(data.get("query").trim())}&type=${data.get("type")}`,
    ),
  );
  const root = h(
    "div",
    {},
    h("div", { class: "page-heading" }, h("div", {}, h("h1", {}, "álbuns"), h("p", { class: "muted" }, "discos, faixas, avaliações e a sua coleção."))),
    catalogModes("albums"),
    form,
    status,
    results,
    link("minha coleção", "#/colecao-albuns"),
    " · ",
    link("listas de álbuns", "#/listas?media=albums"),
  );
  if (!q) {
    results.append(
      panel(
        "álbuns já consultados",
        albumGrid(Object.values(albumCatalog()), currentUser()),
      ),
    );
    return root;
  }
  status.textContent = "procurando álbuns no MusicBrainz…";
  MusicBrainzService.search(q, page, type)
    .then((result) => {
      if (!active()) return;
      status.textContent =
        result.warning ||
        `${result.total} resultados · ${result.source === "musicbrainz" ? "MusicBrainz" : result.source === "itunes" ? "iTunes (fallback)" : "cache local"}`;
      results.replaceChildren(albumGrid(result.albums));
      if (result.source === "musicbrainz" && result.total > 20)
        results.append(
          h(
            "div",
            { class: "pagination" },
            page > 1 &&
              link(
                "← anterior",
                `#/albuns?q=${encodeURIComponent(q)}&type=${type}&page=${page - 1}`,
              ),
            `página ${page}`,
            page * 20 < result.total &&
              link(
                "próxima →",
                `#/albuns?q=${encodeURIComponent(q)}&type=${type}&page=${page + 1}`,
              ),
          ),
        );
    })
    .catch((error) => {
      if (active()) {
        status.textContent = error.message;
        results.replaceChildren(button("tentar novamente", refresh));
      }
    });
  return root;
}
function reviewCard(review, user) {
  const album = resolveAlbum(user, review.albumId);
  return h(
    "article",
    { class: "entry" },
    h("small", {}, userIdentity(user, { linkProfile: true }), " · ", date(review.date)),
    h(
      "h3",
      {},
      link(
        album?.title || "Álbum",
        `#/album/${review.albumId}?user=${user.username}`,
      ),
    ),
    review.rating && stars(review.rating),
    h("p", {}, review.text),
    owner(user) &&
      h(
        "div",
        { class: "toolbar" },
        button("editar resenha", () => reviewForm(album, review)),
        button("excluir resenha", async () => {
          if (
            !(await confirmAction(
              "Excluir esta resenha musical? A nota será mantida.",
            ))
          )
            return;
          mutateAlbums((state) => {
            state.reviews = state.reviews.filter((r) => r.id !== review.id);
          });
          refresh();
        }),
      ),
  );
}
function reviewForm(album, existing, onSaved = refresh) {
  const rating = select(
    "rating",
    ratings,
    existing?.rating || albumState(currentUser()).ratings[album.id] || 0,
  );
  const text = textarea("text", existing?.text || "", {
    required: true,
    maxlength: 20000,
  });
  const form = h(
    "form",
    {},
    field("Nota", rating),
    field("Sua resenha", text),
    submit("salvar resenha"),
  );
  const dialog = modal(
    existing ? "editar resenha musical" : "resenhar álbum",
    form,
  );
  formSubmit(form, (data) => {
    if (!data.get("text").trim()) throw new Error("Escreva a resenha.");
    const score = Number(data.get("rating"));
    rateAlbum(album, score);
    mutateAlbums((state, user) => {
      const review = {
        id: existing?.id || uid(),
        type: "album",
        albumId: album.id,
        rating: score || null,
        text: data.get("text").trim(),
        date: existing?.date || new Date().toISOString(),
      };
      state.reviews = [
        review,
        ...state.reviews.filter((r) => r.id !== review.id),
      ];
      albumActivity(
        user,
        album,
        `${existing ? "editou" : "escreveu"} uma resenha de ${album.title}.`,
      );
    });
    dialog.close();
    onSaved();
  });
}
function actions(album, onChange = refresh) {
  const user = currentUser();
  if (!user)
    return link("entrar para avaliar este álbum", "#/login", {
      class: "button primary",
    });
  const state = albumState(user),
    entry = state.library.find((item) => item.albumId === album.id);
  const status = select(
    "albumStatus",
    { "": "Selecionar status…", ...ALBUM_STATUS },
    entry?.status || "",
  );
  status.addEventListener(
    "change",
    guarded(() => {
      if (status.value) {
        setAlbumStatus(album, status.value);
        onChange();
      }
    }),
  );
  const rating = select("rating", ratings, state.ratings[album.id] || 0);
  rating.addEventListener(
    "change",
    guarded(() => {
      rateAlbum(album, Number(rating.value));
      onChange();
    }),
  );
  return h(
    "div",
    { class: "panel-body" },
    field("Minha coleção de álbuns", status),
    field("Minha nota", rating),
    h(
      "div",
      { class: "toolbar" },
      button(entry?.favorite ? "♥ favorito" : "♡ favoritar", () => {
        favoriteAlbum(album);
        onChange();
      }),
      button("escrever resenha", () =>
        reviewForm(
          album,
          state.reviews.find((r) => r.albumId === album.id),
          onChange,
        ),
      ),
      button("adicionar a lista", () => addToAlbumList(album)),
    ),
    entry &&
      button("remover da coleção", async () => {
        if (
          await confirmAction(
            `Remover “${album.title}” da sua coleção? Sua nota, resenha, notas das faixas, favorito e presença em listas também serão apagados.`,
          )
        ) {
          removeAlbumFromCollection(album.id);
          onChange();
        }
      }),
  );
}
function albumAudioEditor(album, user, onSave) {
  let draft = {
      ...DEFAULT_MUSIC,
      ...albumState(user).audio[album.id],
      loop: false,
    },
    uploading = false;
  const status = h(
      "p",
      { role: "status" },
      draft.fileName || "Nenhum MP3 selecionado.",
    ),
    preview = h("div");
  const upload = input("albumMP3", "", {
    type: "file",
    accept: ".mp3,audio/mpeg",
  });
  const disabled = check("Não tocar música", !draft.enabled);
  disabled.querySelector("input").addEventListener("change", (e) => {
    draft.enabled = !e.target.checked;
    preview.replaceChildren();
  });
  upload.addEventListener(
    "change",
    guarded(async () => {
      if (!upload.files[0]) return;
      uploading = true;
      upload.disabled = true;
      status.textContent = "Carregando MP3…";
      try {
        Object.assign(draft, await uploadMP3(upload.files[0]), {
          enabled: true,
          url: "",
          loop: false,
        });
        disabled.querySelector("input").checked = false;
        status.textContent = draft.fileName;
      } finally {
        uploading = false;
        upload.disabled = false;
        upload.value = "";
      }
    }),
  );
  return h(
    "details",
    {},
    h("summary", {}, "Editar música deste álbum"),
    h(
      "div",
      { class: "panel-body" },
      field(
        "Colocar arquivo MP3",
        upload,
        "Até 55 MB; salvo junto aos dados desta instalação.",
      ),
      status,
      disabled,
      h(
        "p",
        { class: "muted" },
        "O áudio do álbum pausa a música do perfil. Ao terminar ou pausar, a música do perfil continua de onde parou.",
      ),
      h(
        "div",
        { class: "toolbar" },
        button("testar MP3 do álbum", () => {
          if (uploading) throw new Error("Aguarde o envio.");
          if (!draft.fileId) throw new Error("Selecione um MP3.");
          preview.replaceChildren(
            renderMusic(
              { ...draft, enabled: true, loop: false },
              { kind: "album" },
            ),
          );
        }),
        button("remover MP3 do álbum", () => {
          draft = { ...DEFAULT_MUSIC, loop: false };
          status.textContent = "MP3 removido do rascunho.";
          disabled.querySelector("input").checked = true;
          preview.replaceChildren();
        }),
        button(
          "salvar MP3 do álbum",
          () => {
            if (uploading) throw new Error("Aguarde o envio.");
            if (draft.enabled && !draft.fileId)
              throw new Error("Selecione um MP3.");
            mutateAlbums((s) => {
              s.audio[album.id] = {
                ...draft,
                type: "album",
                albumId: album.id,
              };
            });
            preview.replaceChildren();
            notify("MP3 deste álbum salvo.");
            onSave();
          },
          "primary",
        ),
      ),
      preview,
    ),
  );
}
export function albumPage(id, query, active, { embedded = false } = {}) {
  const profileUser = userByName(query.get("user")) || currentUser();
  const viewer = currentUser();
  const audioHost = h("div"),
    content = h("div"),
    message = h("p", { role: "status" }, "abrindo o álbum…");
  const root = h(
    "div",
    { class: embedded ? "media-modal-page album-modal-page" : "" },
    !embedded && link("← catálogo de álbuns", "#/albuns"),
    audioHost,
    message,
    content,
  );
  const updateAudio = (autoplay = false) => {
    const liveUser =
      (profileUser?.username && userByName(profileUser.username)) ||
      profileUser ||
      currentUser();
    const state = albumState(liveUser);
    const savedAudio = state?.audio?.[id] || {};
    audioHost.replaceChildren(
      renderMusic(
        {
          ...savedAudio,
          title: "Música deste álbum",
          loop: false,
        },
        { kind: "album", autoplay },
      ) || "",
    );
  };
  updateAudio(true);

  function ratingWidget(album, track, onSaved) {
    const liveUser = profileUser?.username ? userByName(profileUser.username) : currentUser();
    const value = trackRating(liveUser, album.id, track);
    if (!viewer || !owner(liveUser))
      return value ? stars(value) : h("small", { class: "muted" }, "sem nota");
    const control = select("rating", ratings, value || 0);
    control.classList.add("track-rating-select");
    control.setAttribute("aria-label", `Nota para ${track.title}`);
    control.addEventListener(
      "change",
      guarded(() => {
        rateTrack(album, track, Number(control.value));
        notify(`Nota de “${track.title}” salva.`);
        onSaved?.();
      }),
    );
    return control;
  }

  function draw(rawAlbum) {
    const album = {
      ...rawAlbum,
      secondaryTypes: Array.isArray(rawAlbum?.secondaryTypes)
        ? rawAlbum.secondaryTypes
        : [],
      genres: Array.isArray(rawAlbum?.genres) ? rawAlbum.genres : [],
      tracks: Array.isArray(rawAlbum?.tracks) ? rawAlbum.tracks : [],
      releases: Array.isArray(rawAlbum?.releases) ? rawAlbum.releases : [],
    };
    const liveUser = profileUser?.username
      ? userByName(profileUser.username)
      : currentUser();
    const state = albumState(liveUser);
    const trackScores = album.tracks
      .map((track) => trackRating(liveUser, album.id, track))
      .filter(Boolean);
    const trackAverage = trackScores.length
      ? Math.round((trackScores.reduce((a, b) => a + b, 0) / trackScores.length) * 10) / 10
      : 0;
    const personalReview = state.reviews.find((r) => r.albumId === album.id);
    const personalBox = h(
      "section",
      { class: "album-personal-box" },
      h(
        "h2",
        {},
        owner(liveUser)
          ? "minha avaliação"
          : liveUser
            ? h("span", {}, "avaliação de ", userIdentity(liveUser, { linkProfile: true }))
            : "avaliação de leitor",
      ),
      state.ratings[album.id]
        ? h("p", {}, stars(state.ratings[album.id]), h("small", {}, " · nota geral do álbum"))
        : h("p", { class: "muted" }, "sem nota geral ainda."),
      trackAverage
        ? h("p", {}, stars(trackAverage), h("small", {}, ` · média de ${trackScores.length} faixas avaliadas`))
        : h("p", { class: "muted" }, "nenhuma faixa avaliada ainda."),
      personalReview
        ? h("div", { class: "entry" }, h("strong", {}, "o que eu achei"), h("p", {}, personalReview.text))
        : h("p", { class: "muted" }, "nenhuma resenha pessoal ainda."),
    );

    content.replaceChildren(
      h(
        "div",
        { class: "book-detail album-detail" },
        h(
          "aside",
          { class: "book-sidebar" },
          cover(album, "L"),
          actions(album, () => draw(album)),
        ),
        h(
          "div",
          {},
          h("h1", {}, album.title),
          h(
            "p",
            {},
            link(
              album.artist,
              `#/albuns?q=${encodeURIComponent(album.artist)}&type=artist`,
            ),
          ),
          h(
            "p",
            { class: "muted" },
            [album.year, album.primaryType, ...album.secondaryTypes]
              .filter(Boolean)
              .join(" · "),
          ),
          h(
            "p",
            {},
            [
              album.releaseDate,
              album.country,
              album.label,
              `${album.trackCount || album.tracks.length} faixas`,
            ]
              .filter(Boolean)
              .join(" · "),
          ),
          album.genres?.length > 0 &&
            h("p", { class: "muted" }, `Gêneros: ${album.genres.join(", ")}`),
          personalBox,
          panel(
            "tracklist & minhas notas",
            album.tracks.length
              ? h(
                  "div",
                  { class: "panel-body" },
                  [...new Set(album.tracks.map((t) => t.disc))].map((disc) =>
                    h(
                      "section",
                      {},
                      h("h3", {}, `Disco ${disc}`),
                      h(
                        "ol",
                        { class: "tracklist rated-tracklist" },
                        album.tracks
                          .filter((t) => t.disc === disc)
                          .map((t) =>
                            h(
                              "li",
                              {},
                              h(
                                "span",
                                { class: "track-title" },
                                `${String(t.position).padStart(2, "0")}. ${t.title}`,
                              ),
                              h("small", { class: "track-duration" }, t.durationFormatted || ""),
                              h("span", { class: "track-rating" }, ratingWidget(album, t, () => draw(album))),
                            ),
                          ),
                      ),
                    ),
                  ),
                )
              : empty(
                  "tracklist ainda não disponível.",
                  "Tente outra edição ou consulte a fonte dos dados.",
                ),
          ),
          album.releases.length > 1 &&
            h(
              "details",
              {},
              h("summary", {}, "outras versões"),
              h(
                "div",
                { class: "panel-body" },
                album.releases.map((r) =>
                  button(
                    [r.date, r.format, r.country].filter(Boolean).join(" · ") || r.title,
                    async () => {
                      message.textContent = "carregando faixas desta versão…";
                      try {
                        const version = await MusicBrainzService.detail(id, r.id);
                        if (active()) {
                          draw(version);
                          message.textContent = "";
                        }
                      } catch (e) {
                        if (active()) message.textContent = e.message;
                      }
                    },
                  ),
                ),
              ),
            ),
          h(
            "p",
            { class: "muted" },
            "Dados: ",
            link(
              album.source === "itunes" ? "iTunes" : "MusicBrainz",
              album.source === "itunes"
                ? `https://music.apple.com/album/${album.appleId}`
                : `https://musicbrainz.org/release-group/${album.musicBrainzReleaseGroupId}`,
              { target: "_blank", rel: "noopener noreferrer" },
            ),
          ),
          liveUser && h("p", {}, `Avaliações e MP3 de @${liveUser.username}`),
          owner(liveUser) && albumAudioEditor(album, liveUser, () => updateAudio(false)),
          panel(
            "resenhas deste álbum",
            users().flatMap((u) =>
              albumState(u)
                .reviews.filter((r) => r.albumId === id)
                .map((r) => reviewCard(r, u)),
            ).length
              ? h(
                  "div",
                  {},
                  users().flatMap((u) =>
                    albumState(u)
                      .reviews.filter((r) => r.albumId === id)
                      .map((r) => reviewCard(r, u)),
                  ),
                )
              : empty("ainda não há resenhas deste álbum."),
          ),
        ),
      ),
    );
  }
  const cached = resolveAlbum(profileUser, id) || getAlbum(id);
  if (cached) draw(cached);
  MusicBrainzService.detail(id)
    .then((album) => {
      if (active()) {
        draw(album);
        message.textContent = "";
      }
    })
    .catch((error) => {
      if (active())
        message.replaceChildren(
          error.message,
          " ",
          button("tentar novamente", refresh),
        );
    });
  return root;
}

export function openAlbumModal(id, username = "") {
  const host = h("div", { class: "media-dialog-body" });
  const dialog = modal("álbum", host, { class: "media-dialog album-dialog" });
  const query = new URLSearchParams();
  if (username) query.set("user", username);
  host.append(albumPage(id, query, () => dialog.isConnected, { embedded: true }));
  return dialog;
}

function albumListForm(existing, album) {
  const form = h(
    "form",
    {},
    field(
      "Título da lista",
      input("title", existing?.title || "", { required: true, maxlength: 140 }),
    ),
    field("Descrição", textarea("description", existing?.description || "")),
    submit("salvar lista de álbuns"),
  );
  const dialog = modal(
    existing ? "editar lista de álbuns" : "nova lista de álbuns",
    form,
  );
  formSubmit(form, (data) => {
    if (!data.get("title").trim()) throw new Error("Dê um título à lista.");
    const id = existing?.id || uid();
    mutateAlbums((state) => {
      if (album) ensureAlbumInLibrary(state, album);
      const item = {
        id,
        type: "album",
        title: data.get("title").trim(),
        description: data.get("description").trim(),
        albumIds: existing?.albumIds || (album ? [album.id] : []),
        date: existing?.date || new Date().toISOString(),
      };
      state.lists = [item, ...state.lists.filter((l) => l.id !== id)];
    });
    dialog.close();
    navigate(`/lista-albuns/${id}`);
  });
}
function addToAlbumList(album) {
  const user = currentUser();
  if (!user) {
    navigate("/login");
    return;
  }
  const lists = albumState(user).lists;
  if (!lists.length) {
    albumListForm(null, album);
    return;
  }
  const choice = select(
    "list",
    Object.fromEntries(lists.map((l) => [l.id, l.title])),
    lists[0].id,
  );
  const form = h(
    "form",
    {},
    field("Lista de álbuns", choice),
    submit("adicionar álbum"),
    button("criar outra lista", () => {
      dialog.close();
      albumListForm(null, album);
    }),
  );
  const dialog = modal("adicionar álbum à lista", form);
  formSubmit(form, (data) => {
    mutateAlbums((state, u) => {
      const list = state.lists.find((l) => l.id === data.get("list"));
      if (!list) throw new Error("Lista não encontrada.");
      ensureAlbumInLibrary(state, album);
      if (!list.albumIds.includes(album.id)) list.albumIds.push(album.id);
      albumActivity(
        u,
        album,
        `adicionou ${album.title} à lista “${list.title}”.`,
      );
    });
    dialog.close();
    notify("Álbum adicionado à lista.");
  });
}
export function albumListsPage(user) {
  const all = user ? [user] : users();
  return h(
    "div",
    {},
    h(
      "div",
      { class: "page-heading" },
      h("h1", {}, "listas de álbuns"),
      currentUser() &&
        button("＋ criar lista de álbuns", () => albumListForm()),
    ),
    link("listas de livros", "#/listas"),
    !all.some((u) => albumState(u).lists.length) &&
      empty(
        "nenhuma lista de álbuns por aqui.",
        "Crie uma lista para organizar seus discos.",
      ),
    h(
      "div",
      {},
      all.flatMap((u) =>
        albumState(u).lists.map((list) =>
          h(
            "article",
            { class: "entry" },
            h("h3", {}, link(list.title, `#/lista-albuns/${list.id}`)),
            h("p", {}, list.description),
            h(
              "small",
              {},
              `${list.albumIds.length} álbuns · `,
              userIdentity(u, { linkProfile: true }),
            ),
          ),
        ),
      ),
    ),
  );
}
export function albumListPage(id) {
  const user = users().find((u) =>
    albumState(u).lists.some((l) => l.id === id),
  );
  if (!user) return empty("lista de álbuns não encontrada.");
  const list = albumState(user).lists.find((l) => l.id === id),
    content = h("div");
  function draw() {
    content.replaceChildren(
      ...list.albumIds
        .map((albumId, i) => {
          const album = resolveAlbum(user, albumId);
          if (!album) return null;
          return h(
            "article",
            { class: "entry" },
            albumGrid([album], user),
            owner(user) &&
              h(
                "div",
                { class: "toolbar" },
                button("↑", () => move(i, -1)),
                button("↓", () => move(i, 1)),
                button("remover álbum", () => {
                  mutateAlbums((s) => {
                    s.lists.find((l) => l.id === id).albumIds =
                      list.albumIds.filter((a) => a !== albumId);
                  });
                  refresh();
                }),
              ),
          );
        })
        .filter(Boolean),
    );
  }
  function move(i, delta) {
    const j = i + delta;
    if (j < 0 || j >= list.albumIds.length) return;
    mutateAlbums((s) => {
      const ids = s.lists.find((l) => l.id === id).albumIds;
      [ids[i], ids[j]] = [ids[j], ids[i]];
    });
    refresh();
  }
  draw();
  return h(
    "div",
    {},
    h("h1", {}, list.title),
    h("p", { class: "meta" }, "por ", userIdentity(user, { linkProfile: true })),
    h("p", {}, list.description),
    link("← listas de álbuns", `#/listas?media=albums&user=${user.username}`),
    content,
    owner(user) &&
      h(
        "div",
        { class: "toolbar" },
        button("editar lista", () => albumListForm(list)),
        button("adicionar álbum", () => {
          const choices = [
            ...new Map(
              [
                ...Object.values(albumState(user).snapshots || {}),
                ...Object.values(albumCatalog()),
              ].map((album) => [album.id, album]),
            ).values(),
          ].filter((a) => !list.albumIds.includes(a.id));
          const selectAlbum = select(
            "album",
            Object.fromEntries(
              choices.map((a) => [a.id, `${a.title} — ${a.artist}`]),
            ),
            choices[0]?.id,
          );
          const f = h(
            "form",
            {},
            field("Álbum", selectAlbum),
            submit("adicionar"),
          );
          const d = modal("adicionar álbum", f);
          formSubmit(f, (data) => {
            const album = resolveAlbum(user, data.get("album")) || getAlbum(data.get("album"));
            if (!album) throw new Error("Escolha um álbum.");
            mutateAlbums((s) => {
              const target = s.lists.find((l) => l.id === id);
              if (!target) throw new Error("Lista não encontrada.");
              ensureAlbumInLibrary(s, album);
              if (!target.albumIds.includes(album.id)) target.albumIds.push(album.id);
            });
            d.close();
            refresh();
          });
        }),
        button("excluir lista", async () => {
          if (await confirmAction("Excluir esta lista de álbuns?")) {
            mutateAlbums((s) => {
              s.lists = s.lists.filter((l) => l.id !== id);
            });
            navigate("/listas?media=albums");
          }
        }),
      ),
  );
}
export function albumShelfPage(user, status = "todos") {
  if (!user) return empty("entre para organizar seus álbuns.");
  return h(
    "div",
    {},
    h("h1", {}, "Álbuns de ", userIdentity(user, { linkProfile: true })),
    h(
      "div",
      { class: "toolbar" },
      Object.entries({
        todos: "Todos",
        favoritos: "Favoritos",
        ...ALBUM_STATUS,
      }).map(([key, title]) =>
        link(title, `#/colecao-albuns/${key}?user=${user.username}`, {
          class: "button",
        }),
      ),
    ),
    albumGrid(
      userAlbums(
        user,
        (e) =>
          status === "todos" ||
          (status === "favoritos" ? e.favorite : e.status === status),
      ),
      user,
    ),
    link("buscar álbuns", "#/albuns"),
    " · ",
    link(
      "minhas resenhas musicais",
      `#/resenhas?media=albums&user=${user.username}`,
    ),
  );
}
export function albumReviewsPage(user) {
  if (!user) return empty("entre para ver suas resenhas musicais.");
  return h(
    "div",
    {},
    h("h1", {}, "Resenhas musicais de ", userIdentity(user, { linkProfile: true })),
    !albumState(user).reviews.length &&
      empty("nenhuma resenha musical por aqui."),
    ...albumState(user).reviews.map((r) => reviewCard(r, user)),
  );
}
export function renderAlbumSections(user) {
  const albums = userAlbums(user);
  const state = albumState(user);
  const style = user.page.customization.wallStyle;
  const types = new Set(user.page.customization.wallContent || []);
  const blocks = [];

  if (types.has("books")) {
    if (albums.length) {
      blocks.push(
        panel(
          "últimos álbuns",
          albumGrid(albums.slice(0, 12), user, style),
          link("ver todos", `#/colecao-albuns?user=${user.username}`),
        ),
      );
    }

  }

  if (types.has("favorites")) {
    const favorites = userAlbums(user, (e) => e.favorite);
    if (favorites.length) {
      blocks.push(
        panel("álbuns favoritos", albumGrid(favorites, user, style)),
      );
    }
  }

  if (types.has("reviews") && state.reviews.length) {
    blocks.push(
      panel(
        "resenhas musicais",
        h(
          "div",
          {},
          state.reviews.slice(0, 5).map((r) => reviewCard(r, user)),
        ),
      ),
    );
  }

  if (types.has("lists") && state.lists.length) {
    blocks.push(
      panel(
        "listas de álbuns",
        h(
          "div",
          { class: "panel-body" },
          state.lists.map((l) =>
            h("p", {}, link(l.title, `#/lista-albuns/${l.id}`)),
          ),
        ),
      ),
    );
  }

  return blocks.length ? h("div", {}, blocks) : null;
}
