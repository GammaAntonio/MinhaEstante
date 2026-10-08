import { confirmAction } from "./ui.js";
import {
  h,
  link,
  button,
  input,
  textarea,
  select,
  check,
  field,
  notify,
  guarded,
  modal,
  picture,
  safeURL,
} from "./ui.js";
import { THEMES, FONTS, GADGETS, DEFAULT_THEME } from "./data.js";
import { updateUser, flushUserPersistence, getBook, bookForUser } from "./storage.js";
import { renderPersonalPage } from "./personal.js";
import {
  advancedFrame,
  defaultCode,
  rawCode,
  SECTION_NAMES,
  SECTION_FIELDS,
  emptyOverrides,
  migrateBaseCode,
} from "./advanced.js";
import { SITE_CONFIG } from "./config.js";
import { DEFAULT_MUSIC, audioURL, renderMusic, uploadMP3 } from "./music.js";
import { ensureMediaPages, activateVariant, saveVariant, syncLegacyBooks, copyVariantSection, copyAppearance, mediaVariant, mediaUser } from "./page-media.js";
import { albumState, getAlbum, resolveAlbum } from "./album-store.js";
import {
  listPageAssets,
  uploadPageAsset,
  deletePageAsset,
  copyPageAssetURL,
} from "./page-assets.js";

export function parseCustomization(text, page) {
  const t = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const changes = [];
  const add = (key, value, label) => changes.push({ key, value, label });
  const colors = {
    preto: "#111111",
    branco: "#ffffff",
    vinho: "#701d2c",
    rosa: "#c88795",
    azul: "#23496d",
    verde: "#163c23",
    cinza: "#c7c3bf",
  };
  for (const [word, color] of Object.entries(colors)) {
    if (new RegExp(`(?:fundo|background)\\s+(?:externo\\s+)?${word}`).test(t))
      add("backgroundColor", color, `fundo ${word}`);
    if (
      new RegExp(`(?:detalhes|principal|cor)\\s+${word}`).test(t) ||
      (word === "vinho" && t.includes(word))
    )
      add("primaryColor", color, `detalhes ${word}`);
  }
  for (const font of FONTS) {
    const term = font === "Courier New" ? "courier" : font.toLowerCase();
    if (t.includes(term))
      add(
        font === "Georgia" || t.includes(`${term} nos titulos`)
          ? "headingFont"
          : "fontFamily",
        font,
        `fonte ${font}`,
      );
  }
  for (const [word, style] of Object.entries({
    blog: "blog",
    compacto: "compact",
    grade: "grid",
    lista: "list",
  }))
    if (
      (t.includes("mural") && t.includes(word)) ||
      (word === "grade" && t.includes("capas"))
    )
      add("wallStyle", style, `mural em ${word}`);
  for (const [word, pos] of Object.entries({
    direita: "right",
    esquerda: "left",
  }))
    if (t.includes("sidebar") && t.includes(word))
      add("sidebarPosition", pos, `sidebar à ${word}`);
  for (const [type, label] of Object.entries(GADGETS)) {
    const name = label
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/^minhas? /, "");
    if (
      new RegExp(
        `(?:esconder|ocultar|desativar)\\s+(?:as? |os? )?${name}`,
      ).test(t)
    )
      changes.push({
        gadget: type,
        value: false,
        label: `esconder ${label.toLowerCase()}`,
      });
    if (new RegExp(`(?:mostrar|ativar)\\s+(?:as? |os? )?${name}`).test(t))
      changes.push({
        gadget: type,
        value: true,
        label: `mostrar ${label.toLowerCase()}`,
      });
  }
  return changes;
}
export async function compressImage(file) {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type))
    throw new Error("Escolha uma imagem PNG, JPEG, WebP ou GIF.");
  if (file.size > SITE_CONFIG.maxImageBytes)
    throw new Error("A imagem deve ter no máximo 5 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, 1200 / bitmap.width, 800 / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    canvas
      .getContext("2d")
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let result = canvas.toDataURL("image/webp", 0.78);
    if (result.length > 600000) result = canvas.toDataURL("image/jpeg", 0.55);
    if (result.length > 800000)
      throw new Error(
        "Essa imagem continua grande após compressão. Escolha uma menor.",
      );
    return result;
  } finally {
    bitmap.close();
  }
}
export function imageEditor(label, value, onChange) {
  const preview = h("div", {}, picture(value, label, "image-preview"));
  const url = input("", value?.startsWith("data:") ? "" : value || "", {
    type: "url",
    placeholder: "https://…",
  });
  url.addEventListener("change", () => {
    const v = url.value.trim();
    if (v && !safeURL(v, { image: true })) {
      notify("Use uma URL http ou https válida.", true);
      return;
    }
    onChange(v);
    preview.replaceChildren(picture(v, label, "image-preview") || "");
  });
  const upload = input("", "", {
    type: "file",
    accept: "image/png,image/jpeg,image/webp,image/gif",
  });
  upload.addEventListener(
    "change",
    guarded(async () => {
      if (!upload.files[0]) return;
      const v = await compressImage(upload.files[0]);
      onChange(v);
      url.value = "";
      preview.replaceChildren(picture(v, label, "image-preview"));
      notify("Imagem reduzida e pronta para salvar.");
    }),
  );
  return h(
    "div",
    { class: "image-editor" },
    field(`${label} — URL`, url),
    field(
      "ou enviar imagem",
      upload,
      "até 5 MB; reduzida automaticamente. GIFs enviados viram imagem estática.",
    ),
    button("remover imagem", () => {
      onChange("");
      url.value = "";
      preview.replaceChildren();
    }),
    preview,
  );
}
export function renderEditor(user, initialMedia = "books") {
  let draft = structuredClone(user.page),
    media = initialMedia === "albums" ? "albums" : "books",
    tab = "about",
    section = "general",
    pendingChanges = [];
  ensureMediaPages(draft);
  activateVariant(draft, media);
  draft.music = { ...DEFAULT_MUSIC, ...draft.music };
  let musicUploading = false;
  const otherMedia = () => (media === "books" ? "albums" : "books");
  const mediaName = (value = media) => (value === "albums" ? "Álbuns" : "Livros");
  const saveCurrentVariant = () => saveVariant(draft, media);
  const switchMedia = (next) => {
    if (next === media) return;
    saveCurrentVariant();
    media = next;
    activateVariant(draft, media);
    section = "general";
    show();
  };
  const prepareSavedPage = () => {
    saveCurrentVariant();
    const saved = structuredClone(draft);
    syncLegacyBooks(saved);
    return saved;
  };
  const padronizeSection = async (which = tab) => {
    saveCurrentVariant();
    const target = otherMedia();
    if (!(await confirmAction(`Aplicar esta seção de ${mediaName()} também em ${mediaName(target)}?`))) return;
    copyVariantSection(draft, media, target, which);
    notify(`${which === "advanced" ? "Base" : "Seção"} copiada para ${mediaName(target)}.`);
  };
  const padronizeAll = async () => {
    saveCurrentVariant();
    const target = otherMedia();
    if (!(await confirmAction(`Padronizar toda a aparência de ${mediaName(target)} com ${mediaName()}? O conteúdo da coleção não será alterado.`))) return;
    copyAppearance(draft, media, target);
    notify(`A aparência de ${mediaName(target)} agora segue ${mediaName()}.`);
  };
  const root = h("div"),
    mediaTabs = h("div", { class: "media-editor-switch", role: "group", "aria-label": "Editar área" }),
    tabs = h("div", {
      class: "editor-tabs",
      role: "group",
      "aria-label": "Editar minha página",
    }),
    body = h("div", { class: "editor-section" }),
    mode = h("p", { class: "notice" });
  const names = {
    about: "Página",
    appearance: "Aparência",
    wall: "Mural",
    gadgets: "Gadgets",
    images: "Imagens",
    fonts: "Fontes",
    music: "Editar música",
    advanced: "Editar base",
  };
  function updateMode() {
    mode.textContent = draft.customCode.mode === "visual"
      ? "Modo atual: Editor visual"
      : "Modo atual: Edição de base. Esta é a versão publicada da página.";
  }
  async function persist(message = "Página salva.") {
    if (draft.music.url.trim() && !audioURL(draft.music.url))
      throw new Error(
        "Use um link direto de áudio (MP3, por exemplo). Links do YouTube não são arquivos de áudio.",
      );
    if (musicUploading) throw new Error("Aguarde o MP3 terminar de carregar.");
    if (
      draft.music.enabled &&
      !draft.music.fileId &&
      !audioURL(draft.music.url)
    )
      throw new Error("Coloque um arquivo MP3 ou marque Não tocar música.");
    const saved = prepareSavedPage();
    updateUser(user.id, (u) => {
      u.page = saved;
    });
    await flushUserPersistence(user.id);
    notify(message);
    updateMode();
  }
  async function commitAdvanced() {
    const savedPage = JSON.parse(localStorage.getItem("booksite_users")).find(
      (u) => u.id === user.id,
    ).page;
    ensureMediaPages(savedPage);
    const saved = mediaVariant(savedPage, media).customCode;
    const { previousVersion, ...previous } = saved;
    draft.customCode.previousVersion = previous;
    draft.customCode.updatedAt = new Date().toISOString();
    await persist("Base salva e publicada.");
  }
  const textField = (label, key, multi = false) => {
    const control = multi
      ? textarea(key, draft[key] || "")
      : input(key, draft[key] || "", { maxlength: 140 });
    control.addEventListener("input", () => (draft[key] = control.value));
    return field(label, control);
  };
  const choice = (label, key, options) => {
    const s = select(key, options, draft.customization[key]);
    s.addEventListener("change", () => (draft.customization[key] = s.value));
    return field(label, s);
  };
  async function preview() {
    saveCurrentVariant();
    const u = { ...user, page: structuredClone(draft) };
    const view = mediaUser(u, media);
    const host = h(
      "div",
      {},
      h(
        "p",
        { class: "muted" },
        "Esta prévia ainda não altera a versão salva.",
      ),
    );
    const d = modal("visualizar alterações", host);
    if (view.page.customCode.mode === "visual")
      host.append(renderPersonalPage(u, { preview: true, media }));
    else {
      const frame = await advancedFrame(view, view.page.customCode, { preview: true });
      if (d.isConnected) host.append(frame);
    }
  }
  function show() {
    mediaTabs.replaceChildren(
      button("Livros", () => switchMedia("books"), media === "books" ? "active" : ""),
      button("Álbuns", () => switchMedia("albums"), media === "albums" ? "active" : ""),
      h("span", { class: "media-editor-label" }, `editando: ${mediaName()}`),
    );
    tabs.replaceChildren(
      ...Object.entries(names).map(([key, label]) =>
        button(
          label,
          () => {
            tab = key;
            show();
          },
          key === tab ? "active" : "",
        ),
      ),
    );
    updateMode();
    body.replaceChildren();
    body.append(
      h(
        "div",
        { class: "standardize-bar" },
        h("strong", {}, `${mediaName()} — configurações independentes`),
        h(
          "div",
          { class: "toolbar" },
          tab !== "music" && button(`padronizar esta seção em ${mediaName(otherMedia())}`, () => padronizeSection(tab)),
          button(`padronizar toda a aparência em ${mediaName(otherMedia())}`, padronizeAll),
        ),
        tab === "music" && h("small", { class: "muted" }, "O áudio do perfil continua compartilhado entre as duas áreas."),
      ),
    );
    if (tab === "about") {
      const genres = input("genres", draft.favoriteGenres.join(", "));
      genres.addEventListener(
        "input",
        () =>
          (draft.favoriteGenres = genres.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 20)),
      );
      const links = textarea(
        "links",
        draft.links.map((l) => `${l.label} | ${l.url}`).join("\n"),
      );
      links.addEventListener(
        "input",
        () =>
          (draft.links = links.value
            .split("\n")
            .map((l) => {
              const [label, ...url] = l.split("|");
              return { label: label.trim(), url: url.join("|").trim() };
            })
            .filter((l) => l.label && safeURL(l.url))
            .slice(0, 15)),
      );
      body.append(
        h("h3", {}, "a sua pequena página"),
        h(
          "div",
          { class: "form-grid" },
          textField("Nome de exibição", "displayName"),
          textField("Título da página", "title"),
        ),
        textField("Subtítulo", "subtitle"),
        textField("Sobre mim", "bio", true),
        field("Tags / gêneros favoritos", genres, "separe por vírgulas"),
        field(
          "Links pessoais",
          links,
          "um por linha: nome do link | https://endereco.com",
        ),
        choice("Alinhamento do header", "headerStyle", {
          left: "Esquerda",
          center: "Centro",
          right: "Direita",
        }),
      );
    }
    if (tab === "appearance") {
      const theme = select(
        "theme",
        {
          "": "Escolher um tema…",
          ...Object.fromEntries(Object.keys(THEMES).map((k) => [k, k])),
        },
        "",
      );
      theme.addEventListener("change", () => {
        if (theme.value) {
          draft.customization = {
            ...draft.customization,
            ...structuredClone(THEMES[theme.value]),
          };
          show();
        }
      });
      body.append(
        field("Bases de cor", theme),
        h(
          "div",
          { class: "editor-colors" },
          Object.entries({
            primaryColor: "Principal",
            secondaryColor: "Secundária",
            linkColor: "Links",
            backgroundColor: "Fundo externo",
            pageColor: "Página",
            panelColor: "Painéis",
            textColor: "Texto",
          }).map(([key, label]) => {
            const c = input(key, draft.customization[key], { type: "color" });
            c.addEventListener(
              "input",
              () => (draft.customization[key] = c.value),
            );
            return field(label, c);
          }),
        ),
        h(
          "div",
          { class: "form-grid" },
          choice("Textura do fundo", "backgroundPattern", {
            plain: "Cor lisa",
            checker: "Quadriculado",
            dots: "Pontilhado",
            stripes: "Listras",
            paper: "Papel envelhecido",
            textured: "Preto texturizado",
          }),
          choice("Posição da sidebar", "sidebarPosition", {
            left: "Esquerda",
            right: "Direita",
          }),
          choice("Largura da sidebar", "sidebarWidth", {
            narrow: "Estreita",
            normal: "Normal",
            wide: "Larga",
          }),
        ),
      );
      const request = textarea("request", "", {
          placeholder:
            "quero fundo preto, detalhes vinho, Georgia nos títulos e mural blog",
        }),
        found = h("div");
      body.append(
        h("h3", {}, "alterar minha página — experimental"),
        field(
          "Descreva como você quer sua página",
          request,
          "regras locais de palavras-chave; não utiliza IA.",
        ),
        button("encontrar alterações", () => {
          pendingChanges = parseCustomization(request.value, draft);
          found.replaceChildren(
            pendingChanges.length
              ? h(
                  "ul",
                  {},
                  pendingChanges.map((c) => h("li", {}, c.label)),
                )
              : h(
                  "p",
                  {},
                  "Nenhuma regra reconhecida. Tente os exemplos acima.",
                ),
          );
          if (pendingChanges.length)
            found.append(
              button("aplicar ao rascunho", () => {
                for (const c of pendingChanges) {
                  if (c.gadget)
                    draft.gadgets.find((g) => g.type === c.gadget).enabled =
                      c.value;
                  else draft.customization[c.key] = c.value;
                }
                notify("Alterações aplicadas ao rascunho. Visualize e salve.");
                show();
              }),
            );
        }),
        found,
      );
    }
    if (tab === "fonts")
      body.append(
        h("h3", {}, "letras que também dizem quem você é"),
        choice(
          "Fonte do corpo",
          "fontFamily",
          Object.fromEntries(FONTS.map((f) => [f, f])),
        ),
        choice(
          "Fonte dos títulos",
          "headingFont",
          Object.fromEntries(FONTS.map((f) => [f, f])),
        ),
      );
    if (tab === "wall") {
      body.append(
        choice("Estilo do mural", "wallStyle", {
          grid: "Grade de capas",
          list: "Lista",
          compact: "Compacto",
          blog: "Blog",
        }),
        choice("Resenhas", "reviewStyle", {
          full: "Texto completo",
          compact: "Trecho compacto",
        }),
        h("h3", {}, "o que aparece no mural"),
      );
      for (const [key, label] of Object.entries({
        books: media === "albums" ? "Álbuns recentes" : "Livros recentes",
        favorites: media === "albums" ? "Álbuns favoritos" : "Favoritos",
        posts: "Posts e diário",
        reviews: media === "albums" ? "Resenhas musicais" : "Resenhas",
        lists: media === "albums" ? "Listas de álbuns" : "Listas",
        activity: "Atividade",
      })) {
        const c = check(label, draft.customization.wallContent.includes(key));
        c.querySelector("input").addEventListener("change", (e) => {
          draft.customization.wallContent = e.target.checked
            ? [...draft.customization.wallContent, key]
            : draft.customization.wallContent.filter((x) => x !== key);
        });
        body.append(c);
      }
    }
    if (tab === "gadgets") {
      body.append(
        h("h3", {}, "suas pequenas caixas"),
        h(
          "p",
          { class: "muted" },
          "Escolha quais aparecem e use as setas para ordenar.",
        ),
      );
      draft.gadgets
        .sort((a, b) => a.position - b.position)
        .forEach((g, i) => {
          const albumNames = { reading: "Ouvindo agora", shelves: "Meus álbuns", favorites: "Álbuns favoritos", lists: "Listas de álbuns", reviews: "Resenhas musicais", month: "Álbum do mês", stats: "Estatísticas musicais" };
          const gadgetName = media === "albums" ? albumNames[g.type] || GADGETS[g.type] : GADGETS[g.type];
          const c = check(gadgetName, g.enabled);
          c.querySelector("input").addEventListener(
            "change",
            (e) => (g.enabled = e.target.checked),
          );
          const move = (delta) => {
            const j = i + delta;
            if (j < 0 || j >= draft.gadgets.length) return;
            [draft.gadgets[i], draft.gadgets[j]] = [
              draft.gadgets[j],
              draft.gadgets[i],
            ];
            draft.gadgets.forEach((x, n) => (x.position = n));
            show();
          };
          const up = button("↑", () => move(-1));
          up.setAttribute("aria-label", `Subir ${gadgetName}`);
          up.disabled = i === 0;
          const down = button("↓", () => move(1));
          down.setAttribute("aria-label", `Descer ${gadgetName}`);
          down.disabled = i === draft.gadgets.length - 1;
          body.append(h("div", { class: "gadget-row" }, c, up, down));
          if (g.type === "text") {
            const t = textarea("freeText", g.text);
            t.addEventListener("input", () => (g.text = t.value));
            body.append(field("Texto livre (somente texto)", t));
          }
          if (g.type === "month") {
            if (media === "albums") {
              const state = albumState(user);
              const s = select(
                "month",
                {
                  "": "Escolher álbum…",
                  ...Object.fromEntries(
                    state.library.map((e) => [e.albumId, resolveAlbum(user, e.albumId)?.title || e.albumId]),
                  ),
                },
                g.albumId || "",
              );
              s.addEventListener("change", () => (g.albumId = s.value));
              body.append(field("Álbum do mês", s));
            } else {
              const s = select(
                "month",
                {
                  "": "Escolher livro…",
                  ...Object.fromEntries(
                    user.library.map((e) => [
                      e.bookId,
                      bookForUser(user, e.bookId)?.title || e.bookId,
                    ]),
                  ),
                },
                g.bookId,
              );
              s.addEventListener("change", () => (g.bookId = s.value));
              body.append(field("Livro do mês", s));
            }
          }
          const availableLists = media === "albums" ? albumState(user).lists : user.lists;
          if (g.type === "lists" && availableLists.length) {
            const f = h(
              "div",
              { class: "panel-body" },
              h("small", {}, "Sem seleção, todas as listas aparecem."),
            );
            availableLists.forEach((l) => {
              const c = check(l.title, g.listIds?.includes(l.id));
              c.querySelector("input").addEventListener(
                "change",
                (e) =>
                  (g.listIds = e.target.checked
                    ? [...(g.listIds || []), l.id]
                    : (g.listIds || []).filter((id) => id !== l.id)),
              );
              f.append(c);
            });
            body.append(f);
          }
        });
    }
    if (tab === "images") {
      const g = draft.gadgets.find((g) => g.type === "image");
      body.append(
        imageEditor("Avatar", draft.avatar, (v) => (draft.avatar = v)),
        imageEditor("Banner", draft.banner, (v) => (draft.banner = v)),
        imageEditor("Gadget de imagem", g.image, (v) => {
          g.image = v;
          g.enabled = !!v;
        }),
      );
      const badges = textarea("badges", (draft.badges || []).join("\n"));
      badges.addEventListener(
        "input",
        () =>
          (draft.badges = badges.value
            .split("\n")
            .map((v) => safeURL(v.trim(), { image: true }))
            .filter(Boolean)
            .slice(0, 12)),
      );
      body.append(
        field(
          "Badges 88×31 — URLs",
          badges,
          "uma URL de imagem por linha; ative o gadget Badges.",
        ),
      );
    }
    if (tab === "music") {
      const music = draft.music;
      const upload = input("musicFile", "", {
        type: "file",
        accept: ".mp3,audio/mpeg",
      });
      const fileStatus = h(
        "p",
        { role: "status" },
        music.fileName
          ? `Arquivo: ${music.fileName}`
          : "Nenhum MP3 selecionado.",
      );
      const title = input("musicTitle", music.title, {
        maxlength: 140,
        placeholder: "Ex.: Um Minuto Para o Fim do Mundo — CPM 22",
      });
      const disabled = check("Não tocar música", !music.enabled);
      const loop = check("Repetir música ao terminar", music.loop);
      const previewHost = h("div", { class: "music-preview" });
      upload.addEventListener(
        "change",
        guarded(async () => {
          if (!upload.files[0]) return;
          musicUploading = true;
          upload.disabled = true;
          fileStatus.textContent = "Carregando MP3…";
          try {
            const uploaded = await uploadMP3(upload.files[0]);
            Object.assign(music, uploaded, { url: "", enabled: true });
            disabled.querySelector("input").checked = false;
            fileStatus.textContent = `Arquivo: ${music.fileName} — pronto para salvar.`;
            previewHost.replaceChildren();
          } catch (error) {
            fileStatus.textContent = music.fileName
              ? `Arquivo anterior mantido: ${music.fileName}`
              : "Nenhum MP3 selecionado.";
            throw error;
          } finally {
            musicUploading = false;
            upload.disabled = false;
            upload.value = "";
          }
        }),
      );
      title.addEventListener("input", () => {
        music.title = title.value;
      });
      disabled.querySelector("input").addEventListener("change", (e) => {
        music.enabled = !e.target.checked;
        previewHost.replaceChildren();
      });
      loop.querySelector("input").addEventListener("change", (e) => {
        music.loop = e.target.checked;
      });
      body.append(
        h("h3", {}, "adicionar música"),
        h("p", {}, "Uma música para acompanhar quem visita seu pequeno mundo."),
        field(
          "Colocar arquivo MP3",
          upload,
          "Escolha um MP3 de até 55 MB. O arquivo será salvo junto aos dados desta instalação.",
        ),
        fileStatus,
        field("Nome da música e artista (opcional)", title),
        disabled,
        loop,
        h(
          "p",
          { class: "muted" },
          "Somente som, sem vídeo. Quem visita toca em Ouvir e pode pausar quando quiser. A música toca enquanto o perfil estiver aberto.",
        ),
        h(
          "div",
          { class: "toolbar" },
          button("testar música", () => {
            if (musicUploading)
              throw new Error("Aguarde o MP3 terminar de carregar.");
            if (!music.fileId && !audioURL(music.url))
              throw new Error("Coloque um arquivo MP3 primeiro.");
            previewHost.replaceChildren(
              renderMusic({ ...music, enabled: true }),
            );
          }),
          button("remover música", () => {
            draft.music = { ...DEFAULT_MUSIC };
            show();
            notify("Música removida do rascunho. Salve as alterações.");
          }),
        ),
        previewHost,
        h(
          "p",
          { class: "muted" },
          "Salve as alterações para publicar no seu perfil. Também funciona nos modos Editar base e Do zero.",
        ),
      );
    }
    if (tab === "advanced") renderAdvanced();
  }

  function pageAssetsManager() {
    const upload = input("pageAsset", "", {
      type: "file",
      accept: "image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif",
    });
    const status = h("p", { role: "status", class: "muted" }, "Carregando imagens…");
    const gallery = h("div", { class: "page-assets-grid" });
    let busy = false;

    const copyText = async (value, message) => {
      await copyPageAssetURL(value);
      notify(message);
    };

    const renderAssets = async () => {
      gallery.replaceChildren();
      status.textContent = "Carregando imagens…";
      const assets = await listPageAssets();
      if (!assets.length) {
        status.textContent = "Nenhuma imagem enviada ainda.";
        return;
      }
      status.textContent = `${assets.length} ${assets.length === 1 ? "imagem salva" : "imagens salvas"}.`;
      gallery.append(
        ...assets.map((asset) => {
          const url = asset.url;
          const urlField = input("assetUrl", url, {
            readonly: true,
            class: "page-asset-url",
            "aria-label": "URL da imagem",
          });
          return h(
            "article",
            { class: "page-asset-card" },
            h("img", { src: url, alt: "Imagem enviada para a página", loading: "lazy" }),
            urlField,
            h(
              "div",
              { class: "toolbar page-asset-actions" },
              button("copiar URL", () => copyText(url, "URL da imagem copiada.")),
              button(
                "copiar <img>",
                () => copyText(`<img src="${url}" alt="">`, "Tag <img> copiada."),
              ),
              button(
                "copiar CSS",
                () =>
                  copyText(
                    `background-image: url("${url}");`,
                    "CSS da imagem copiado.",
                  ),
              ),
              button(
                "apagar",
                guarded(async () => {
                  if (
                    !(await confirmAction(
                      "Apagar esta imagem da página? Códigos que usam esta URL deixarão de exibi-la.",
                    ))
                  )
                    return;
                  await deletePageAsset(asset.id);
                  notify("Imagem apagada.");
                  await renderAssets();
                }),
                "danger",
              ),
            ),
          );
        }),
      );
    };

    upload.addEventListener(
      "change",
      guarded(async () => {
        const file = upload.files?.[0];
        if (!file || busy) return;
        busy = true;
        upload.disabled = true;
        status.textContent = "Enviando imagem…";
        try {
          await uploadPageAsset(file);
          notify("Imagem enviada. A URL já pode ser usada no HTML/CSS.");
          await renderAssets();
        } finally {
          busy = false;
          upload.disabled = false;
          upload.value = "";
        }
      }),
    );

    const box = h(
      "details",
      { class: "page-assets-manager" },
      h("summary", {}, "Imagens da página"),
      h(
        "div",
        { class: "page-assets-manager-body" },
        h(
          "p",
          {},
          "Envie PNG, JPG, WEBP ou GIF de até 8 MB. O arquivo fica salvo nesta instalação e a URL pode ser usada diretamente no HTML ou CSS do Editar base.",
        ),
        field("Enviar imagem", upload, "SVG não é aceito."),
        status,
        gallery,
      ),
    );

    renderAssets().catch((error) => {
      status.textContent = error.message || "Não foi possível carregar as imagens.";
    });
    return box;
  }

  function ensureCode() {
    const pageUser = { ...user, page: draft };

    if (!draft.customCode.sections?.general) {
      const old = draft.customCode;
      const defaults = defaultCode(pageUser, media);

      draft.customCode = {
        ...defaults,
        ...old,
        sections: defaults.sections,
      };
    }

    draft.customCode = migrateBaseCode(
      draft.customCode,
      pageUser,
      media,
    );
  }
  function renderAdvanced() {
    ensureCode();
    let code = draft.customCode;
    body.append(
      h("h3", {}, "edição avançada"),
      h(
        "p",
        {},
        "Altere diretamente a estrutura e o estilo da sua página. Se você não conhece HTML/CSS, utilize o editor normal.",
      ),
      h(
        "p",
        { class: "notice" },
        "A prévia e a página publicada usam um iframe isolado. Livros, listas e textos continuam no sistema.",
      ),
      pageAssetsManager(),
    );
    body.append(
      h(
        "div",
        { class: "toolbar" },
        button("editar base existente", async () => {
          code.mode = "base";
          await persist("Edição de base ativada e publicada.");
          show();
        }),
        button("começar do zero", async () => {
          if (
            !(await confirmAction(
              "Isso substituirá a estrutura visual atual da sua página no rascunho. Seus livros, listas, avaliações, posts e outros dados não serão apagados.",
            ))
          )
            return;
          const raw = rawCode();
          code.mode = "raw";
          code.html = raw.html;
          code.css = raw.css;
          code.javascript = raw.javascript;
          await persist("Edição de base iniciada e publicada.");
          show();
        }),
        button("voltar para editor normal", async () => {
          code.mode = "visual";
          await persist(
            "Editor visual ativado. Seu código personalizado continua salvo como rascunho.",
          );
          show();
        }),
      ),
    );
    body.append(
      h(
        "p",
        { class: "notice" },
        code.mode === "visual"
          ? "O editor visual está publicado. Escolha “editar base existente” para ativar e publicar esta base."
          : "A edição de base está ativa. As alterações salvas abaixo serão usadas na sua página.",
      ),
    );
    if (code.mode !== "raw")
      body.append(
        h(
          "p",
          { class: "notice" },
          "As configurações das abas Página, Aparência, Mural, Gadgets, Imagens, Fontes e Música continuam dinâmicas no modo Base. Se você substituir manualmente um token dinâmico por conteúdo fixo, aquela parte passa a ser controlada pelo seu código.",
        ),
      );
    const sectionTabs = h("div", { class: "editor-tabs" });
    let target = code;
    if (code.mode !== "raw") {
      const sectionNames = media === "albums"
        ? { ...SECTION_NAMES, books: "Álbuns", reviews: "Resenhas musicais", lists: "Listas de álbuns" }
        : SECTION_NAMES;
      const keys = {
        ...sectionNames,
        css: "CSS global",
        javascript: "JavaScript da página",
      };
      sectionTabs.append(
        ...Object.entries(keys).map(([k, label]) =>
          button(
            label,
            () => {
              section = k;
              show();
            },
            section === k ? "active" : "",
          ),
        ),
      );
      body.append(sectionTabs);
      if (section !== "css" && section !== "javascript")
        target = code.sections[section];
    }
    const currentSectionName = media === "albums"
      ? ({ ...SECTION_NAMES, books: "Álbuns", reviews: "Resenhas musicais", lists: "Listas de álbuns" })[section]
      : SECTION_NAMES[section];
    const makeCode = (label, key, obj, trackOverride = false) => {
      const area = textarea(key, obj[key] || "", {
        class: "code-editor",
        spellcheck: "false",
        "aria-label": label,
      });
      const markOverride = () => {
        if (trackOverride && SECTION_FIELDS.includes(key)) {
          obj.overrides ||= emptyOverrides();
          obj.overrides[key] = true;
        }
      };
      area.addEventListener("input", () => {
        obj[key] = area.value;
        markOverride();
      });
      area.addEventListener("keydown", (e) => {
        if (e.key === "Tab") {
          e.preventDefault();
          const a = area.selectionStart,
            b = area.selectionEnd;
          area.setRangeText("  ", a, b, "end");
          obj[key] = area.value;
          markOverride();
        }
      });
      return field(label, area);
    };
    if (code.mode === "raw")
      body.append(
        makeCode("HTML", "html", code),
        makeCode("CSS", "css", code),
        makeCode("JavaScript", "javascript", code),
      );
    else if (section === "css")
      body.append(makeCode("CSS global", "css", code));
    else if (section === "javascript")
      body.append(makeCode("JavaScript da página", "javascript", code));
    else
      body.append(
        makeCode(`${currentSectionName} — HTML`, "html", target, true),
        makeCode(`${currentSectionName} — CSS`, "css", target, true),
        makeCode(
          `${currentSectionName} — JavaScript`,
          "javascript",
          target,
          true,
        ),
        button(
          `restaurar ${currentSectionName.toLowerCase()}`,
          async () => {
            if (await confirmAction("Restaurar esta seção no rascunho?")) {
              code.sections[section] = defaultCode({
                ...user,
                page: draft,
              }, media).sections[section];
              show();
            }
          },
        ),
      );
    const dynamicTokenHelp =
      "{{defaultHeader}} · {{defaultThemeStyle}} · {{backgroundPattern}} · {{sidebarPosition}} · {{defaultSidebar}}\n";
    body.append(
      h(
        "details",
        {},
        h("summary", {}, "dados e componentes disponíveis"),
        h(
          "pre",
          { class: "code-help" },
          media === "albums"
            ? dynamicTokenHelp +
              '{{user.displayName}} · {{user.bio}} · {{user.title}}\n{{recentAlbums}} · {{favoriteAlbums}} · {{currentlyListening}} · {{albumContent}}\n\n<album-recent></album-recent>\n<album-favorites></album-favorites>\n<album-currently-listening></album-currently-listening>\n<page-posts></page-posts>\n<page-activity></page-activity>\n\npageData.albums / favoriteAlbums / currentlyListening / albumReviews / albumLists'
            : dynamicTokenHelp +
              '{{user.displayName}} · {{user.bio}} · {{user.title}}\n{{library}} · {{favorites}} · {{currentlyReading}}\n{{recentReviews}} · {{content}}\n\n<book-currently-reading></book-currently-reading>\n<book-favorites></book-favorites>\n<book-reviews limit="5"></book-reviews>\n<book-lists></book-lists>\n<page-posts></page-posts>\n<page-activity></page-activity>\n\npageData.user / library / reading / favorites / reviews / lists / posts / activity\npageAPI.getFavorites(), getCurrentBook(), getReviews(), getLists(), getPosts()',
        ),
      ),
    );
    body.append(
      h(
        "div",
        { class: "toolbar" },
        button("restaurar versão anterior", async () => {
          if (!code.previousVersion) {
            notify("Ainda não existe versão anterior.");
            return;
          }
          if (await confirmAction("Restaurar a versão anterior do código?")) {
            const { previousVersion, ...current } = code;
            draft.customCode = {
              ...structuredClone(previousVersion),
              previousVersion: current,
            };
            await persist("Versão anterior restaurada e publicada.");
            show();
          }
        }),
        button("restaurar página padrão", async () => {
          if (
            !(await confirmAction(
              "Restaurar a aparência padrão? Livros e textos serão mantidos.",
            ))
          )
            return;
          const { previousVersion, ...previous } = code;
          draft.customization = structuredClone(DEFAULT_THEME);
          draft.customCode = {
            ...defaultCode({ ...user, page: draft }, media),
            mode: "visual",
            previousVersion: previous,
          };
          await persist("Página padrão restaurada.");
          show();
        }),
      ),
    );
  }
  root.append(
    h(
      "div",
      { class: "page-heading" },
      h("h1", {}, "editar minha página"),
      link("visitar minha página", `#/pagina/${user.username}${media === "albums" ? "?media=albums" : ""}`),
    ),
    mediaTabs,
    mode,
    tabs,
    body,
    h(
      "div",
      { class: "editor-actions" },
      button("visualizar alterações", guarded(preview)),
      button(
        "salvar alterações",
        guarded(async () => {
          if (!draft.displayName.trim() || !draft.title.trim())
            throw new Error("Preencha o nome e o título da página.");
          if (draft.customCode.mode !== "visual")
            await commitAdvanced();
          else await persist();
        }),
        "primary",
      ),
      link("voltar à página", `#/pagina/${user.username}${media === "albums" ? "?media=albums" : ""}`, { class: "button" }),
    ),
  );
  show();
  return root;
}
