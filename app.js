import { confirmAction } from "./ui.js";
import { SITE_CONFIG } from "./config.js";
import { STATUS, SEED_BOOKS } from "./data.js";
import * as Store from "./storage.js";
import { BookService } from "./api.js";
import { startRouter, navigate } from "./router.js";
import {
  h,
  link,
  panel,
  booksGrid,
  cover,
  stars,
  empty,
  input,
  textarea,
  select,
  check,
  field,
  formSubmit,
  notify,
  button,
  guarded,
  modal,
  date,
} from "./ui.js";
import {
  userBooks,
  renderPersonalPage,
  renderPost,
  renderReview,
  renderList,
  renderActivity,
  avatar,
  themeStyle,
} from "./personal.js";
import { renderEditor, imageEditor } from "./editor.js";
import { advancedFrame } from "./advanced.js";
import { registerBookTools } from "./webmcp.js";
import {
  catalogModes,
  albumCatalogPage,
  albumPage,
  albumListsPage,
  albumListPage,
  albumShelfPage,
  albumReviewsPage,
  openAlbumModal,
} from "./album-pages.js";
import { setBackgroundMusic, positionBackgroundMusic } from "./music.js";
import { mediaUser } from "./page-media.js";
import { userIdentity } from "./identity.js";

const app = document.getElementById("app");
const rerender = () => window.dispatchEvent(new HashChangeEvent("hashchange"));
const heading = (title, subtitle = "", action = null) =>
  h(
    "div",
    { class: "page-heading" },
    h(
      "div",
      {},
      h("h1", {}, title),
      subtitle && h("p", { class: "muted" }, subtitle),
    ),
    action,
  );
const submit = (text, cls = "primary") =>
  h("button", { type: "submit", class: cls }, text);
const now = () => new Date().toISOString();
const requireUser = () => {
  const u = Store.currentUser();
  if (!u) navigate("/login");
  return u;
};
const owner = (u) => Store.currentUser()?.id === u?.id;
const ratings = {
  0: "Sem nota",
  ...Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [
      (i + 1) / 2,
      `${(i + 1) / 2} estrelas`,
    ]),
  ),
};
const getBooks = (ids) => ids.map(Store.getBook).filter(Boolean);

async function hydrateUserLibrary(user) {
  const snapshots = (user.library || [])
    .map((entry) => entry.book)
    .filter((book) => book?.id && book.title);
  if (snapshots.length) Store.cacheBooks(snapshots);
  const missing = (user.library || []).filter(
    (entry) => !Store.getBook(entry.bookId),
  );
  if (!missing.length) return;
  const loaded = (
    await Promise.allSettled(
      missing.map((entry) => BookService.details(entry.bookId)),
    )
  )
    .filter((result) => result.status === "fulfilled" && result.value?.title)
    .map((result) => result.value);
  if (loaded.length && owner(user))
    Store.updateUser(user.id, (draft) => {
      for (const book of loaded) Store.ensureBookInLibrary(draft, book);
    });
}

function searchForm(query = "", type = "q") {
  const f = h(
    "form",
    { class: "search-form" },
    h("label", { class: "sr-only", for: "catalog-search" }, "Pesquisar livros"),
    input("query", query, {
      id: "catalog-search",
      placeholder: "título, autor, ISBN…",
      required: true,
      maxlength: 200,
    }),
    select(
      "type",
      { q: "Todos os campos", title: "Título", author: "Autor", isbn: "ISBN" },
      type,
    ),
    submit("buscar"),
  );
  return formSubmit(f, (data) =>
    navigate(
      `/livros?q=${encodeURIComponent(data.get("query").trim())}&type=${data.get("type")}`,
    ),
  );
}
function renderHeader(route) {
  const musical =
    route.query.get("media") === "albums" ||
    ["album", "albuns", "colecao-albuns", "lista-albuns"].includes(route.parts[0]);
  const user = Store.currentUser(),
    global = h(
      "form",
      { class: "global-search", role: "search" },
      h(
        "label",
        { class: "sr-only", for: "global-query" },
        musical ? "Procurar álbum" : "Procurar livro",
      ),
      input("query", "", {
        id: "global-query",
        placeholder: musical ? "procurar álbum ou artista…" : "procurar livro…",
        required: true,
        maxlength: 200,
      }),
      submit("buscar", ""),
    );
  formSubmit(global, (data) =>
    navigate(
      `/${musical ? "albuns" : "livros"}?q=${encodeURIComponent(data.get("query").trim())}`,
    ),
  );
  const nav = [
    ["home", "/home"],
    ["livros", "/livros"],
    ["pessoas", "/usuarios"],
    ["álbuns", "/albuns"],
    ["listas", musical ? "/listas?media=albums" : "/listas"],
    ["diário", "/diario"],
    ["resenhas", musical ? "/resenhas?media=albums" : "/resenhas"],
    ["minha página", user ? `/pagina/${user.username}${musical ? "?media=albums" : ""}` : "/login"],
  ];
  if (user) nav.push(["amigos", "/amigos"]);
  if (user?.role === "admin") nav.push(["admin", "/admin"]);
  return [
    h(
      "div",
      { class: "topline" },
      "o catálogo é compartilhado, mas a página é sua.",
      h("span", {}, "feito para leitores curiosos · build V4 · dados no servidor"),
    ),
    h(
      "header",
      { class: "site-header" },
      link(
        [
          h("span", {}, "www."),
          h("strong", {}, SITE_CONFIG.name),
          h("span", {}, ".com"),
        ],
        "#/home",
        { class: "brand" },
      ),
      h("p", { class: "tagline" }, SITE_CONFIG.tagline),
      h(
        "div",
        { class: "header-stamp" },
        "páginas pessoais",
        h("br"),
        "desde agora.",
      ),
    ),
    h(
      "nav",
      { class: "navbar", "aria-label": "Navegação principal" },
      nav.map(([label, path]) =>
        link(label, "#" + path, {
          class: route.parts[0] === path.split("/")[1] ? "active" : "",
        }),
      ),
      global,
    ),
    h(
      "div",
      { class: "session" },
      user
        ? [
            h("span", {}, "olá, ", userIdentity(user, { linkProfile: true }), "."),
            link("editar minha página", `#/pagina/${user.username}/editar`),
            link("minha conta", "#/conta"),
            button("sair", () => {
              Store.logout();
              navigate("/login");
            }),
          ]
        : [link("entrar", "#/login"), link("criar página", "#/criar-pagina")],
    ),
  ];
}
function sideMenu(user) {
  return h(
    "aside",
    {},
    panel(
      "meu pequeno mundo",
      h(
        "div",
        { class: "panel-body" },
        avatar(user),
        h("h3", {}, user.page.displayName),
        h("small", {}, userIdentity(user, { username: true, linkProfile: true })),
        h("p", {}, link("visitar minha página", `#/pagina/${user.username}`)),
      ),
    ),
    panel(
      "atalhos",
      h(
        "ul",
        { class: "small-nav" },
        [
          ["explorar livros", "#/livros"],
          ["explorar álbuns", "#/albuns"],
          ["minhas listas", `#/listas?user=${user.username}`],
          ["meu diário", `#/diario?user=${user.username}`],
          ["minhas resenhas", `#/resenhas?user=${user.username}`],
          ["amigos", `#/amigos?user=${user.username}`],
          ["minha conta", "#/conta"],
          ...Object.entries(STATUS).map(([k, v]) => [
            v,
            `#/estante/${k}?user=${user.username}`,
          ]),
        ].map(([label, url]) => h("li", {}, link(label, url))),
      ),
    ),
    panel(
      "outras páginas",
      h(
        "ul",
        { class: "small-nav" },
        Store.users()
          .filter((u) => u.role !== "admin" && u.id !== user.id)
          .slice(0, 8)
          .map((u) =>
            h(
              "li",
              {},
              link(u.page.title, `#/pagina/${u.username}`),
              " ",
              userIdentity(u, { username: true, linkProfile: true }),
            ),
          ),
      ),
    ),
  );
}
function home(user, { inspect = false } = {}) {
  if (!user)
    return h(
      "div",
      {},
      heading(
        "um catálogo compartilhado. uma página sua.",
        "um pequeno canto da internet para os livros e o que eles deixam.",
        link("criar minha página", "#/criar-pagina", {
          class: "button primary",
        }),
      ),
      searchForm(),
      h(
        "div",
        { class: "two-column" },
        h(
          "aside",
          {},
          panel(
            "visite uma página",
            h(
              "ul",
              { class: "small-nav" },
              Store.users()
                .filter((u) => u.role !== "admin")
                .map((u) =>
                  h(
                    "li",
                    {},
                    link(u.page.title, `#/pagina/${u.username}`),
                    " ",
                    userIdentity(u, { username: true, linkProfile: true }),
                  ),
                ),
            ),
          ),
          panel(
            "bem-vindo de volta",
            h(
              "div",
              { class: "panel-body" },
              h(
                "p",
                {},
                "Sem pressa, sem ranking. Organize suas leituras e construa um espaço com a sua cara.",
              ),
              link("entrar na minha página", "#/login", {
                class: "button primary",
              }),
            ),
          ),
        ),
        h(
          "div",
          {},
          panel(
            "livros que ficam com a gente",
            booksGrid(Object.values(Store.catalog()).slice(0, 6)),
          ),
          panel(
            "páginas nas margens",
            h(
              "div",
              { class: "panel-body" },
              renderPost(
                Store.userByName("antonio")?.posts[0] || {
                  title: "cada leitor, um pequeno mundo",
                  text: "Seu catálogo se conecta aos livros. Sua página se parece com você.",
                  date: now(),
                  bookIds: [],
                },
                "post",
                Store.userByName("antonio"),
              ),
            ),
          ),
        ),
      ),
    );
  return h(
    "div",
    {},
    inspect &&
      h(
        "div",
        { class: "inspect-banner" },
        `Visualizando a home de ${user.page.displayName}. Sua sessão continua como administrador; visualização somente leitura.`,
        link(" voltar ao admin", "#/admin"),
      ),
    heading(
      `olá, ${user.page.displayName.toLowerCase()}.`,
      "bom te ver por aqui. deixamos sua página aberta.",
      link("visitar minha página", `#/pagina/${user.username}`, {
        class: "button",
      }),
    ),
    searchForm(),
    h(
      "div",
      { class: "two-column" },
      sideMenu(user),
      h(
        "div",
        {},
        panel(
          "lendo agora",
          booksGrid(
            userBooks(user, (e) => e.status === "lendo"),
            user.ratings,
          ),
        ),
        panel(
          "últimos livros adicionados",
          booksGrid(userBooks(user).slice(0, 10), user.ratings),
          link("ver todos", `#/estante/todos?user=${user.username}`),
        ),
        panel(
          "listas que estou montando",
          h(
            "div",
            { class: "panel-body" },
            user.lists.length
              ? user.lists.slice(0, 3).map(renderList)
              : empty(
                  "nenhuma lista por aqui.",
                  "Junte livros por um tema, uma sensação ou qualquer ideia.",
                ),
          ),
          link("ver listas", `#/listas?user=${user.username}`),
        ),
        panel(
          "últimas páginas do diário",
          h(
            "div",
            { class: "panel-body" },
            [...user.journal, ...user.posts].length
              ? [...user.journal, ...user.posts]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, 2)
                  .map((p) => renderPost(p, "post", user))
              : empty("ainda sem anotações.", "Uma frase já é um começo."),
          ),
          link("abrir diário", `#/diario?user=${user.username}`),
        ),
      ),
    ),
  );
}
function auth(signup = false) {
  const hintBox = h("div", { class: "password-hint-box", hidden: true });
  const maxBirthDate = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 14);
    return d.toISOString().slice(0, 10);
  })();

  const fields = signup
    ? [
        field(
          "Nome completo",
          input("fullName", "", {
            required: true,
            maxlength: 100,
            autocomplete: "name",
          }),
        ),
        field(
          "Nome de usuário",
          input("username", "", {
            required: true,
            minlength: 3,
            maxlength: 30,
            autocomplete: "username",
            pattern: "[a-zA-Z0-9_-]+",
          }),
          "3 a 30 caracteres. Use letras sem acentos, números, _ ou -.",
        ),
        field(
          "Data de nascimento",
          input("birthDate", "", {
            type: "date",
            required: true,
            max: maxBirthDate,
            autocomplete: "bday",
          }),
          "Cadastro disponível para pessoas com 14 anos ou mais.",
        ),
        field(
          "Cidade",
          input("city", "", {
            required: true,
            maxlength: 100,
            autocomplete: "address-level2",
          }),
        ),
        field(
          "E-mail",
          input("email", "", {
            type: "email",
            required: true,
            maxlength: 160,
            autocomplete: "email",
          }),
        ),
        field(
          "Telefone",
          input("phone", "", {
            type: "tel",
            required: true,
            maxlength: 24,
            autocomplete: "tel",
            placeholder: "(14) 99999-9999",
          }),
        ),
        field(
          "Senha",
          input("password", "", {
            type: "password",
            required: true,
            minlength: 6,
            maxlength: 200,
            autocomplete: "new-password",
          }),
        ),
        field(
          "Confirmar senha",
          input("confirmPassword", "", {
            type: "password",
            required: true,
            minlength: 6,
            maxlength: 200,
            autocomplete: "new-password",
          }),
        ),
        field(
          "Dica da senha (opcional)",
          input("passwordHint", "", {
            maxlength: 160,
            autocomplete: "off",
            placeholder: "algo que ajude você a lembrar",
          }),
          "Ela aparece quando você erra a senha. Não escreva a senha inteira aqui.",
        ),
      ]
    : [
        field(
          "E-mail ou nome de usuário",
          input("identifier", "", {
            required: true,
            maxlength: 160,
            autocomplete: "username",
          }),
        ),
        field(
          "Senha",
          input("password", "", {
            type: "password",
            required: true,
            autocomplete: "current-password",
          }),
        ),
      ];

  const f = h(
    "form",
    { class: signup ? "signup-form" : "login-form" },
    signup ? h("div", { class: "form-grid signup-grid" }, fields) : fields,
    !signup && hintBox,
    signup &&
      h(
        "p",
        { class: "notice" },
        "Sua senha é guardada como hash no servidor. O e-mail é usado para a conta e para a mensagem de boas-vindas.",
      ),
    submit(signup ? "criar minha conta" : "entrar"),
    h(
      "p",
      {},
      link(
        signup ? "já tenho uma conta" : "quero criar uma conta",
        signup ? "#/login" : "#/criar-pagina",
      ),
    ),
  );

  formSubmit(f, async (data) => {
    hintBox.hidden = true;
    hintBox.replaceChildren();
    try {
      if (signup) {
        await Store.register({
          fullName: data.get("fullName"),
          username: data.get("username"),
          birthDate: data.get("birthDate"),
          city: data.get("city"),
          email: data.get("email"),
          phone: data.get("phone"),
          password: data.get("password"),
          confirmPassword: data.get("confirmPassword"),
          passwordHint: data.get("passwordHint"),
        });
      } else {
        await Store.login(data.get("identifier"), data.get("password"));
      }
      navigate("/home");
    } catch (error) {
      if (!signup && error.hint) {
        hintBox.hidden = false;
        hintBox.append(
          h("strong", {}, "Dica da senha: "),
          h("span", {}, error.hint),
        );
      }
      throw error;
    }
  });

  return h(
    "div",
    { class: "auth-layout" },
    h(
      "div",
      { class: "auth-intro" },
      h("span", { class: "badge" }, "bem-vindo à sua pequena internet"),
      h("h1", {}, "livros em comum. páginas diferentes."),
      h(
        "p",
        {},
        "Um catálogo para descobrir livros. Uma página para guardar o que eles deixam em você.",
      ),
      h(
        "p",
        {},
        "Escolha cores, escreva nas margens, monte listas. Faça desse lugar o seu lugar.",
      ),
      booksGrid(SEED_BOOKS.slice(0, 3)),
    ),
    h(
      "div",
      {},
      h("h2", {}, signup ? "criar conta" : "entrar na sua conta"),
      f,
    ),
  );
}

async function accountPage() {
  const user = requireUser();
  if (!user) return empty("entre para abrir sua conta.");
  const account = await Store.account();
  const maxBirthDate = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 14);
    return d.toISOString().slice(0, 10);
  })();

  const infoForm = h(
    "form",
    { class: "account-form" },
    h(
      "div",
      { class: "form-grid" },
      field(
        "Nome completo",
        input("fullName", account.fullName || "", {
          required: true,
          maxlength: 100,
          autocomplete: "name",
        }),
      ),
      field(
        "Nome de usuário",
        input("username", account.username || user.username, {
          disabled: true,
        }),
        "O endereço da sua página não muda por aqui.",
      ),
      field(
        "Data de nascimento",
        input("birthDate", account.birthDate || "", {
          type: "date",
          required: true,
          max: maxBirthDate,
          autocomplete: "bday",
        }),
      ),
      field(
        "Cidade",
        input("city", account.city || "", {
          required: true,
          maxlength: 100,
          autocomplete: "address-level2",
        }),
      ),
      field(
        "E-mail",
        input("email", account.email || "", {
          type: "email",
          required: true,
          maxlength: 160,
          autocomplete: "email",
        }),
      ),
      field(
        "Telefone",
        input("phone", account.phone || "", {
          type: "tel",
          required: true,
          maxlength: 24,
          autocomplete: "tel",
        }),
      ),
    ),
    field(
      "Dica da senha (opcional)",
      input("passwordHint", account.passwordHint || "", {
        maxlength: 160,
        autocomplete: "off",
      }),
      "A dica aparece apenas quando alguém acerta sua conta, mas erra a senha.",
    ),
    submit("salvar dados da conta"),
  );
  formSubmit(infoForm, async (data) => {
    await Store.updateAccount({
      fullName: data.get("fullName"),
      birthDate: data.get("birthDate"),
      city: data.get("city"),
      email: data.get("email"),
      phone: data.get("phone"),
      passwordHint: data.get("passwordHint"),
    });
    notify("Dados da conta salvos.");
  });

  const passwordForm = h(
    "form",
    { class: "account-password-form" },
    field(
      "Nova senha",
      input("newPassword", "", {
        type: "password",
        required: true,
        minlength: 6,
        maxlength: 200,
        autocomplete: "new-password",
      }),
    ),
    field(
      "Confirmar nova senha",
      input("confirmPassword", "", {
        type: "password",
        required: true,
        minlength: 6,
        maxlength: 200,
        autocomplete: "new-password",
      }),
    ),
    submit("alterar senha"),
  );
  formSubmit(passwordForm, async (data, form) => {
    await Store.changePassword(data.get("newPassword"), data.get("confirmPassword"));
    form.reset();
    notify("Senha alterada. No próximo login, use a nova senha.");
  });

  return h(
    "div",
    {},
    heading("minha conta", "dados de cadastro e segurança da sua conta."),
    h(
      "div",
      { class: "account-grid" },
      panel("dados de cadastro", h("div", { class: "panel-body" }, infoForm)),
      panel(
        "segurança",
        h(
          "div",
          { class: "panel-body" },
          h(
            "p",
            {},
            "A senha só pode ser alterada enquanto você já estiver dentro da conta. Não há recuperação por e-mail nesta versão.",
          ),
          passwordForm,
        ),
      ),
    ),
  );
}

function catalogPage(query, active) {
  const q = query.get("q") || "",
    type = ["q", "title", "author", "isbn"].includes(query.get("type"))
      ? query.get("type")
      : "q",
    page = Math.max(1, parseInt(query.get("page")) || 1);
  const status = h("p", { class: "search-status", role: "status" }),
    results = h("div"),
    container = h(
      "div",
      {},
      heading("livros", "obras em comum, muitas formas de ler."),
      catalogModes("books"),
      searchForm(q, type),
      status,
      results,
    );
  if (!q) {
    const recent = Store.read(Store.KEYS.recent, []);
    results.append(
      panel(
        "consultados recentemente",
        recent.length
          ? booksGrid(getBooks(recent))
          : empty(
              "ainda não abrimos nenhum livro.",
              "Busque por título, autor ou ISBN.",
            ),
      ),
      panel(
        "explorar a estante",
        booksGrid(Object.values(Store.catalog()).slice(0, 18)),
      ),
      h(
        "p",
        { class: "muted" },
        "Os dados de demonstração ficam disponíveis sem conexão. Buscas novas consultam a Open Library.",
      ),
    );
    return container;
  }
  status.textContent = "procurando nas estantes da Open Library…";
  (async () => {
    try {
      const result = await BookService.search(q, type, page);
      if (!active()) return;
      status.textContent =
        result.warning ||
        `${result.total.toLocaleString("pt-BR")} obras encontradas · ${result.source === "google" ? "Google Books" : "Open Library"}`;
      results.replaceChildren(
        result.books.length
          ? booksGrid(result.books)
          : empty(
              "não achei nada na estante.",
              "Tente outro título, autor ou ISBN.",
            ),
      );
      if (result.source !== "local" && result.total > SITE_CONFIG.pageSize) {
        const pagination = h("div", { class: "pagination" });
        if (page > 1)
          pagination.append(
            link(
              "← anterior",
              `#/livros?q=${encodeURIComponent(q)}&type=${type}&page=${page - 1}`,
            ),
          );
        pagination.append(h("span", {}, `página ${page}`));
        if (page * SITE_CONFIG.pageSize < result.total)
          pagination.append(
            link(
              "próxima →",
              `#/livros?q=${encodeURIComponent(q)}&type=${type}&page=${page + 1}`,
            ),
          );
        results.append(pagination);
      }
    } catch (e) {
      if (active()) {
        status.textContent = "a busca não pôde ser concluída.";
        results.replaceChildren(
          h(
            "div",
            { class: "error-box" },
            h("p", {}, e.message),
            button("tentar novamente", rerender),
          ),
        );
      }
    }
  })();
  return container;
}
function bookActions(book, onChange = rerender) {
  const user = Store.currentUser();
  if (!user)
    return h(
      "div",
      { class: "action-stack" },
      link("entrar para guardar este livro", "#/login", {
        class: "button primary",
      }),
    );
  const entry = user.library.find((x) => x.bookId === book.id),
    status = select(
      "status",
      { "": "Escolher estante…", ...STATUS },
      entry?.status || "",
    );
  status.addEventListener(
    "change",
    guarded(async () => {
      if (!status.value) return;
      Store.setBookStatus(book, status.value);
      notify("Estante atualizada.");
      onChange();
    }),
  );
  const rating = select("rating", ratings, user.ratings[book.id] || 0);
  rating.addEventListener(
    "change",
    guarded(async () => {
      Store.rateBook(book, Number(rating.value));
      notify("Nota salva.");
      onChange();
    }),
  );
  return h(
    "div",
    { class: "action-stack" },
    field("na minha estante", status),
    button(
      entry?.favorite ? "♥ nos favoritos" : "♡ favoritar",
      guarded(async () => {
        Store.toggleFavorite(book);
        onChange();
      }),
    ),
    field("minha nota", rating),
    button("escrever resenha", () =>
      reviewForm(
        book,
        user.reviews.find((r) => r.bookId === book.id),
        onChange,
      ),
    ),
    button("adicionar a lista", () => addToList(book)),
    button("registrar no diário", () => postForm("journal", null, [book.id])),
    entry &&
      button(
        "remover da estante",
        guarded(async () => {
          if (
            await confirmAction(
              `Remover “${book.title}” da sua estante? Sua nota, resenha, favorito e presença em listas também serão apagados.`,
            )
          ) {
            Store.removeBookFromShelf(book.id);
            onChange();
          }
        }),
        "danger",
      ),
  );
}
function bookPage(id, active, { embedded = false } = {}) {
  const container = h(
    "div",
    { class: embedded ? "media-modal-page book-modal-page" : "" },
    !embedded && link("← voltar aos livros", "#/livros"),
    h("div", { class: "loading" }, "abrindo o livro…"),
  );
  function draw(book, loading = false) {
    const reviews = Store.users().flatMap((u) =>
        u.reviews
          .filter((r) => r.bookId === book.id)
          .map((r) => ({ user: u, review: r })),
      ),
      notes = Store.users()
        .map((u) => u.ratings[book.id])
        .filter(Boolean),
      average = notes.length
        ? Math.round((notes.reduce((a, b) => a + b, 0) / notes.length) * 10) /
          10
        : 0;
    const details = h(
      "div",
      {},
      h("h1", {}, book.title || "Obra"),
      book.subtitle && h("p", {}, book.subtitle),
      h(
        "p",
        {},
        book.authors.map((a, i) => [
          i ? ", " : "",
          link(a, `#/livros?q=${encodeURIComponent(a)}&type=author`),
        ]),
        " · ",
        book.firstPublishYear || "ano não informado",
      ),
      average > 0 &&
        h(
          "p",
          {},
          stars(average),
          h("small", {}, ` · ${notes.length} avaliações locais`),
        ),
      h(
        "p",
        { class: "description" },
        book.description || "Esta obra ainda não tem uma descrição disponível.",
      ),
      book.subjects.length > 0 &&
        h(
          "div",
          { class: "tags" },
          book.subjects.slice(0, 10).map((s) =>
            link(s, `#/livros?q=${encodeURIComponent(s)}`, {
              class: "tag",
            }),
          ),
        ),
      h(
        "dl",
        {},
        h("dt", {}, "idiomas"),
        h("dd", {}, book.languages.join(", ") || "não informado"),
        book.pageCount && [
          h("dt", {}, "páginas"),
          h("dd", {}, `${book.pageCount} (varia por edição)`),
        ],
        book.publishers.length > 0 && [
          h("dt", {}, "editoras"),
          h("dd", {}, book.publishers.slice(0, 3).join(", ")),
        ],
      ),
      h(
        "p",
        { class: "muted" },
        book.source === "local"
          ? "metadados mínimos da demonstração"
          : `fonte: ${book.source === "google" ? "Google Books" : "Open Library"} · ${book.editionCount || "várias"} edições`,
      ),
    );
    if (loading)
      details.append(
        h("p", { class: "loading" }, "consultando descrição e edições…"),
      );
    const me = Store.currentUser();
    const myReview = me?.reviews.find((r) => r.bookId === book.id);
    if (me)
      details.append(
        h(
          "section",
          { class: "album-personal-box book-personal-box" },
          h("h2", {}, "minha avaliação"),
          me.ratings[book.id]
            ? h("p", {}, stars(me.ratings[book.id]), h("small", {}, " · minha nota"))
            : h("p", { class: "muted" }, "sem nota ainda."),
          myReview
            ? h("div", { class: "entry" }, h("strong", {}, "o que eu achei"), h("p", {}, myReview.text))
            : h("p", { class: "muted" }, "nenhum comentário pessoal ainda."),
        ),
      );
    if (book.warning)
      details.append(
        h(
          "p",
          { class: "notice" },
          `${book.warning} Mostrando os dados já disponíveis.`,
        ),
      );
    if (book.editionError)
      details.append(
        h(
          "p",
          { class: "notice" },
          "As edições não puderam ser consultadas agora.",
        ),
      );
    if (book.editions?.length)
      details.append(
        h(
          "details",
          {},
          h("summary", {}, `edições (${book.editions.length} nesta amostra)`),
          book.editions.map((e) =>
            h(
              "div",
              { class: "entry" },
              h("strong", {}, e.title),
              h(
                "p",
                {},
                [e.publishers.join(", "), e.publishedDate, e.language]
                  .filter(Boolean)
                  .join(" · "),
              ),
              h(
                "small",
                {},
                `ISBN: ${[...e.isbn13, ...e.isbn10].join(", ") || "não informado"}${e.pageCount ? " · " + e.pageCount + " páginas" : ""}`,
              ),
            ),
          ),
        ),
      );
    else if (book.isbn13.length || book.isbn10.length)
      details.append(
        h(
          "details",
          {},
          h("summary", {}, "ISBNs conhecidos"),
          h("p", {}, [...book.isbn13, ...book.isbn10].join(", ")),
        ),
      );
    container.replaceChildren(
      !embedded && h(
        "div",
        { class: "breadcrumb" },
        link("livros", "#/livros"),
        " / obra",
      ),
      h(
        "div",
        { class: "book-detail" },
        h("aside", {}, cover(book, "L"), bookActions(book, () => draw(book))),
        details,
      ),
      panel(
        "nas páginas dos leitores",
        h(
          "div",
          { class: "panel-body" },
          reviews.length
            ? reviews.map(({ user, review }) =>
                h(
                  "div",
                  {},
                  link(
                    `visitar página de ${user.page.displayName}`,
                    `#/pagina/${user.username}`,
                  ),
                  renderReview(review, user),
                ),
              )
            : empty(
                "este livro ainda não ganhou uma resenha.",
                "A sua pode ser a primeira neste navegador.",
              ),
        ),
      ),
    );
  }
  const cached = Store.getBook(id);
  if (cached) draw(cached, true);
  (async () => {
    try {
      const book = await BookService.details(id);
      if (active()) {
        Store.visitBook(book.id);
        draw(book);
      }
    } catch (e) {
      if (active())
        container.replaceChildren(
          h(
            "div",
            { class: "error-box" },
            e.message,
            link("voltar ao catálogo", "#/livros"),
          ),
        );
    }
  })();
  return container;
}
function openBookModal(id) {
  const host = h("div", { class: "media-dialog-body" });
  const dialog = modal("livro", host, { class: "media-dialog book-dialog" });
  const user = Store.currentUser();
  if (user) dialog.setAttribute("style", themeStyle(mediaUser(user, "books")));
  host.append(bookPage(id, () => dialog.isConnected, { embedded: true }));
  return dialog;
}
function openAlbumStyled(id, username = "") {
  const dialog = openAlbumModal(id, username);
  const user = (username && Store.userByName(username)) || Store.currentUser();
  if (user) dialog.setAttribute("style", themeStyle(mediaUser(user, "albums")));
  return dialog;
}

function reviewForm(book, existing = null, onSaved = rerender) {
  const u = requireUser();
  if (!u || !book) return;
  const f = h(
    "form",
    {},
    h("h3", {}, book.title),
    field(
      "Sua nota (opcional)",
      select("rating", ratings, existing?.rating || u.ratings[book.id] || 0),
    ),
    field(
      "Sua resenha",
      textarea("text", existing?.text || "", {
        required: true,
        maxlength: 15000,
      }),
    ),
    field(
      "Edição lida (opcional)",
      input("edition", existing?.edition || "", { maxlength: 200 }),
    ),
    submit("salvar resenha"),
  );
  const d = modal(existing ? "editar resenha" : "escrever resenha", f);
  formSubmit(f, (data) => {
    if (!data.get("text").trim())
      throw new Error("Escreva algo para salvar sua resenha.");
    Store.updateUser(u.id, (user) => {
      Store.ensureBookInLibrary(user, book);
      const item = {
        id: existing?.id || Store.uid(),
        bookId: book.id,
        text: data.get("text").trim(),
        rating: Number(data.get("rating")) || null,
        edition: data.get("edition").trim(),
        date: existing?.date || now(),
        updatedAt: now(),
      };
      const idx = user.reviews.findIndex((r) => r.id === item.id);
      if (idx >= 0) user.reviews[idx] = item;
      else user.reviews.unshift(item);
      if (item.rating) user.ratings[book.id] = item.rating;
      else delete user.ratings[book.id];
      Store.activity(
        user,
        `${existing ? "editou" : "escreveu"} uma resenha de ${book.title}.`,
        book.id,
      );
    });
    d.close();
    notify("Resenha salva.");
    onSaved();
  });
}
function friendCard(user) {
  return h(
    "article",
    { class: "friend-card" },
    avatar(user),
    h(
      "div",
      { class: "friend-card-info" },
      h("strong", {}, user.page.displayName),
      h("small", {}, userIdentity(user, { username: true, linkProfile: true })),
      link("visitar página", `#/pagina/${user.username}`),
    ),
  );
}

async function friendshipProfileState(target) {
  const viewer = Store.currentUser();
  if (!viewer)
    return { state: "logged-out", targetId: target.id };
  if (String(viewer.id) === String(target.id))
    return { state: "self", targetId: target.id };

  const state = await Store.friendState(target.id);
  return {
    state: state.state || "none",
    targetId: target.id,
    friendshipId: state.friendshipId || "",
  };
}

async function runFriendAction(detail = {}) {
  const action = String(detail.action || "");
  const targetId = String(detail.targetId || "");
  const friendshipId = String(detail.friendshipId || "");
  const targetName = String(detail.targetName || "este usuário");

  if (!Store.currentUser()) {
    location.hash = "#/login";
    return;
  }

  if (action === "add" && targetId) {
    await Store.sendFriendRequest(targetId);
    notify("Solicitação de amizade enviada.");
    rerender();
    return;
  }

  if (action === "accept" && friendshipId) {
    await Store.acceptFriendRequest(friendshipId);
    notify("Agora vocês são amigos.");
    rerender();
    return;
  }

  if (action === "reject" && friendshipId) {
    await Store.rejectFriendRequest(friendshipId);
    notify("Solicitação recusada.");
    rerender();
    return;
  }

  if (action === "remove" && targetId) {
    if (!(await confirmAction(`Remover ${targetName} dos seus amigos?`))) return;
    await Store.removeFriend(targetId);
    notify("Amizade removida.");
    rerender();
  }
}

async function friendsPage(query) {
  const viewer = Store.currentUser();
  const target = query.get("user") ? Store.userByName(query.get("user")) : viewer;
  if (!target)
    return h(
      "div",
      {},
      heading("amigos"),
      empty("entre para ver suas amizades."),
      link("entrar", "#/login", { class: "button" }),
    );

  const list = await Store.friends(target.id);
  const ownPage = viewer?.id === target.id;
  let requests = null;
  if (ownPage) requests = await Store.friendRequests();

  return h(
    "div",
    {},
    heading(
      ownPage
        ? "meus amigos"
        : h("span", {}, "amigos de ", userIdentity(target, { linkProfile: true })),
      `${list.length} ${list.length === 1 ? "amizade" : "amizades"}`,
      link("visitar página", `#/pagina/${target.username}`),
    ),
    ownPage && requests?.incoming?.length
      ? panel(
          `solicitações recebidas (${requests.incoming.length})`,
          h(
            "div",
            { class: "friend-request-list" },
            requests.incoming.map((request) =>
              h(
                "div",
                { class: "friend-request" },
                friendCard(request.user),
                h(
                  "div",
                  { class: "friend-actions" },
                  button("aceitar", async () => {
                    await Store.acceptFriendRequest(request.id);
                    notify("Solicitação aceita.");
                    rerender();
                  }, "primary"),
                  button("recusar", async () => {
                    await Store.rejectFriendRequest(request.id);
                    notify("Solicitação recusada.");
                    rerender();
                  }),
                ),
              ),
            ),
          ),
        )
      : null,
    ownPage && requests?.outgoing?.length
      ? panel(
          `solicitações enviadas (${requests.outgoing.length})`,
          h(
            "div",
            { class: "friend-grid" },
            requests.outgoing.map((request) => friendCard(request.user)),
          ),
        )
      : null,
    panel(
      "amigos",
      list.length
        ? h("div", { class: "friend-grid" }, list.map(friendCard))
        : empty("nenhum amigo por aqui ainda.", ownPage ? "Visite uma página e envie uma solicitação." : "Esta pessoa ainda não adicionou ninguém."),
    ),
  );
}


function normalizePersonSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^@/, "")
    .trim();
}

function personSearchScore(user, query) {
  const q = normalizePersonSearch(query);

  if (!q) return 0;

  const fields = [
    user?.page?.displayName,
    user?.username,
    user?.page?.title,
  ]
    .map(normalizePersonSearch)
    .filter(Boolean);

  let best = Infinity;

  for (const value of fields) {
    if (value === q) {
      best = Math.min(best, 0);
    } else if (value.startsWith(q)) {
      best = Math.min(best, 10 + value.length - q.length);
    } else if (
      value
        .split(/\s+/)
        .some((word) => word.startsWith(q))
    ) {
      best = Math.min(best, 20);
    } else if (value.includes(q)) {
      best = Math.min(best, 30 + value.indexOf(q));
    }
  }

  return best;
}

function peopleSearchForm(query = "") {
  const form = h(
    "form",
    { class: "search-form", role: "search" },

    h(
      "label",
      { class: "sr-only", for: "people-query" },
      "Pesquisar pessoas",
    ),

    input("query", query, {
      id: "people-query",
      placeholder: "nome ou @usuário…",
      maxlength: 100,
      autocomplete: "off",
    }),

    submit("buscar"),
  );

  return formSubmit(form, (data) => {
    const value = String(data.get("query") || "").trim();

    navigate(
      value
        ? `/usuarios?q=${encodeURIComponent(value)}`
        : "/usuarios",
    );
  });
}

function peoplePage(query) {
  const search = String(query.get("q") || "").trim();

  const people = Store.users()
    .filter((user) => user?.role !== "admin")
    .map((user) => ({
      user,
      score: personSearchScore(user, search),
    }))
    .filter((item) => Number.isFinite(item.score))
    .sort(
      (a, b) =>
        a.score - b.score ||
        String(
          a.user?.page?.displayName ||
            a.user?.username ||
            "",
        ).localeCompare(
          String(
            b.user?.page?.displayName ||
              b.user?.username ||
              "",
          ),
          "pt-BR",
          { sensitivity: "base" },
        ),
    );

  return h(
    "div",
    {},

    heading(
      "pessoas",
      "procure uma página pelo nome ou pelo @usuário.",
    ),

    peopleSearchForm(search),

    h(
      "p",
      { class: "search-status" },

      search
        ? `${people.length} ${
            people.length === 1
              ? "pessoa encontrada"
              : "pessoas encontradas"
          } para “${search}”.`
        : `${people.length} ${
            people.length === 1
              ? "pessoa cadastrada"
              : "pessoas cadastradas"
          }.`,
    ),

    people.length
      ? h(
          "div",
          { class: "friend-grid" },

          people.map(({ user }) =>
            h(
              "article",
              { class: "friend-card" },

              avatar(user),

              h(
                "div",
                { class: "friend-card-info" },

                h(
                  "strong",
                  {},
                  user.page?.displayName ||
                    user.username,
                ),

                h(
                  "small",
                  {},
                  userIdentity(user, {
                    username: true,
                    linkProfile: true,
                  }),
                ),

                link(
                  "visitar página",
                  `#/pagina/${user.username}`,
                ),
              ),
            ),
          ),
        )
      : empty(
          "ninguém encontrado.",
          "Tente outro nome ou @usuário.",
        ),
  );
}
const selectedUser = (query) =>
  query.get("user") ? Store.userByName(query.get("user")) : Store.currentUser();
function reviewsPage(user) {
  if (!user)
    return h(
      "div",
      {},
      heading("resenhas"),
      empty("entre para ver suas resenhas."),
      link("entrar", "#/login", { class: "button" }),
    );
  return h(
    "div",
    {},
    heading(
      owner(user)
        ? "minhas resenhas"
        : h("span", {}, "resenhas de ", userIdentity(user, { linkProfile: true })),
      "o que ficou depois da última página.",
    ),
    user.reviews.length
      ? user.reviews.map((r) =>
          h(
            "section",
            { class: "panel panel-body" },
            renderReview(r, user),
            owner(user) &&
              h(
                "div",
                { class: "entry-actions" },
                button("editar", () => reviewForm(Store.bookForUser(user, r.bookId), r)),
                button(
                  "excluir",
                  guarded(async () => {
                    if (
                      await confirmAction(
                        "Excluir esta resenha? A nota será mantida.",
                      )
                    ) {
                      Store.updateUser(
                        user.id,
                        (u) =>
                          (u.reviews = u.reviews.filter((x) => x.id !== r.id)),
                      );
                      rerender();
                    }
                  }),
                  "danger",
                ),
              ),
          ),
        )
      : empty(
          "nenhuma resenha ainda.",
          "Abra uma obra no catálogo para começar.",
        ),
  );
}
function listForm(existing = null, initialBook = null) {
  const u = requireUser();
  if (!u) return;
  const f = h(
      "form",
      {},
      field(
        "Título da lista",
        input("title", existing?.title || "", {
          required: true,
          maxlength: 120,
        }),
      ),
      field(
        "Descrição",
        textarea("description", existing?.description || "", {
          maxlength: 4000,
        }),
      ),
      submit(existing ? "salvar lista" : "criar lista"),
    ),
    d = modal(existing ? "editar lista" : "uma nova lista", f);
  formSubmit(f, (data) => {
    if (!data.get("title").trim())
      throw new Error("Dê um título para a lista.");
    const id = existing?.id || Store.uid();
    Store.updateUser(u.id, (user) => {
      if (initialBook) Store.ensureBookInLibrary(user, initialBook);
      const item = {
        id,
        title: data.get("title").trim(),
        description: data.get("description").trim(),
        bookIds: existing?.bookIds || (initialBook ? [initialBook.id] : []),
        date: existing?.date || now(),
      };
      const index = user.lists.findIndex((l) => l.id === id);
      if (index >= 0)
        user.lists[index] = {
          ...user.lists[index],
          title: item.title,
          description: item.description,
        };
      else user.lists.unshift(item);
      Store.activity(
        user,
        `${existing ? "editou" : "criou"} a lista “${item.title}”.`,
      );
    });
    d.close();
    notify("Lista salva.");
    navigate(`/lista/${id}`);
  });
}
function addToList(book) {
  const u = requireUser();
  if (!u) return;
  if (!u.lists.length) {
    listForm(null, book);
    return;
  }
  const s = select(
      "list",
      Object.fromEntries(u.lists.map((l) => [l.id, l.title])),
      u.lists[0].id,
    ),
    f = h(
      "form",
      {},
      field("Escolha a lista", s),
      submit("adicionar livro"),
      button("criar outra lista", () => {
        d.close();
        listForm(null, book);
      }),
    ),
    d = modal(`guardar “${book.title}” em uma lista`, f);
  formSubmit(f, (data) => {
    Store.updateUser(u.id, (user) => {
      const l = user.lists.find((x) => x.id === data.get("list"));
      if (!l) throw new Error("Lista não encontrada.");
      if (l.bookIds.includes(book.id))
        throw new Error("Esse livro já está nesta lista.");
      Store.ensureBookInLibrary(user, book);
      l.bookIds.push(book.id);
      Store.activity(
        user,
        `adicionou ${book.title} à lista “${l.title}”.`,
        book.id,
      );
    });
    d.close();
    notify("Livro adicionado à lista.");
    rerender();
  });
}
function listsPage(user) {
  const all = user
    ? user.lists.map((list) => ({ user, list }))
    : Store.users().flatMap((user) =>
        user.lists.map((list) => ({ user, list })),
      );
  return h(
    "div",
    {},
    heading(
      user
        ? owner(user)
          ? "minhas listas"
          : h("span", {}, "listas de ", userIdentity(user, { linkProfile: true }))
        : "listas nas páginas",
      "juntar livros é também contar uma história.",
      Store.currentUser() &&
        button("＋ criar lista", () => listForm(), "primary"),
    ),
    all.length
      ? all.map(({ user, list }) =>
          panel(
            list.title,
            h(
              "div",
              { class: "panel-body" },
              h("span", {}, "por ", userIdentity(user, { linkProfile: true })),
              renderList(list, user),
            ),
          ),
        )
      : empty(
          "nenhuma lista por aqui.",
          "Literatura russa, noites em claro, livros para reler… o tema é seu.",
        ),
  );
}
function listPage(id) {
  const user = Store.users().find((u) => u.lists.some((l) => l.id === id));
  if (!user)
    return empty("lista não encontrada.", "Ela pode ter sido removida.");
  const list = user.lists.find((l) => l.id === id),
    canEdit = owner(user),
    rows = h("div");
  list.bookIds.forEach((bookId, index) => {
    const b = Store.bookForUser(user, bookId);
    if (!b) return;
    const move = (delta) => {
      Store.updateUser(user.id, (u) => {
        const current = u.lists.find((l) => l.id === id),
          i = current.bookIds.indexOf(bookId),
          j = i + delta;
        if (j < 0 || j >= current.bookIds.length) return;
        [current.bookIds[i], current.bookIds[j]] = [
          current.bookIds[j],
          current.bookIds[i],
        ];
      });
      rerender();
    };
    const up = button(
        "↑",
        guarded(() => move(-1)),
      ),
      down = button(
        "↓",
        guarded(() => move(1)),
      );
    up.disabled = index === 0;
    down.disabled = index === list.bookIds.length - 1;
    up.setAttribute("aria-label", `Subir ${b.title}`);
    down.setAttribute("aria-label", `Descer ${b.title}`);
    rows.append(
      h(
        "div",
        { class: "row-book" },
        h("span", { class: "position" }, index + 1),
        cover(b),
        h(
          "div",
          { class: "details" },
          link(b.title, `#/livro/${b.id}`),
          h("div", { class: "muted" }, b.authors.join(", ")),
        ),
        canEdit && [
          up,
          down,
          button(
            "remover",
            guarded(async () => {
              Store.updateUser(user.id, (u) => {
                const l = u.lists.find((x) => x.id === id);
                l.bookIds = l.bookIds.filter((x) => x !== bookId);
              });
              rerender();
            }),
          ),
        ],
      ),
    );
  });
  const content = h(
    "div",
    {},
    heading(
      list.title,
      h(
        "span",
        {},
        `${list.bookIds.length} livros · por `,
        userIdentity(user, { linkProfile: true }),
      ),
      link("visitar página", `#/pagina/${user.username}`),
    ),
    h("p", { class: "multiline" }, list.description),
    rows.childElementCount
      ? rows
      : empty(
          "a lista está esperando seus livros.",
          "Adicione uma obra já consultada ou procure no catálogo.",
        ),
  );
  if (canEdit) {
    const s = select(
        "book",
        {
          "": "Escolher uma obra já consultada…",
          ...Object.fromEntries(
            Object.values(Store.catalog())
              .filter((b) => !list.bookIds.includes(b.id))
              .map((b) => [b.id, b.title]),
          ),
        },
        "",
      ),
      f = h(
        "form",
        { class: "toolbar" },
        field("Adicionar livro", s),
        submit("adicionar"),
        link("buscar no catálogo", "#/livros"),
      );
    formSubmit(f, (data) => {
      const bookId = data.get("book");
      const book = Store.getBook(bookId);
      if (!book) throw new Error("Escolha um livro.");
      Store.updateUser(user.id, (u) => {
        const l = u.lists.find((x) => x.id === id);
        Store.ensureBookInLibrary(u, book);
        if (!l.bookIds.includes(bookId)) l.bookIds.push(bookId);
      });
      rerender();
    });
    content.append(
      f,
      h(
        "div",
        { class: "toolbar" },
        button("editar título e descrição", () => listForm(list)),
        button(
          "excluir lista",
          guarded(async () => {
            if (
              await confirmAction(
                `Excluir a lista “${list.title}”? Os livros continuarão no catálogo.`,
              )
            ) {
              Store.updateUser(
                user.id,
                (u) => (u.lists = u.lists.filter((l) => l.id !== id)),
              );
              navigate("/listas");
            }
          }),
          "danger",
        ),
      ),
    );
  }
  return content;
}
function postForm(kind = "journal", existing = null, bookIds = []) {
  const u = requireUser();
  if (!u) return;
  let image = existing?.image || "";
  const selected = new Set(existing?.bookIds || bookIds),
    options = h(
      "div",
      { class: "book-picker" },
      Object.values(Store.catalog()).map((b) => {
        const c = check(b.title, selected.has(b.id));
        c.querySelector("input").addEventListener("change", (e) =>
          e.target.checked ? selected.add(b.id) : selected.delete(b.id),
        );
        return c;
      }),
    );
  const f = h(
      "form",
      {},
      field(
        "Título",
        input("title", existing?.title || "", {
          required: true,
          maxlength: 160,
        }),
      ),
      field(
        "Texto",
        textarea("text", existing?.text || "", {
          required: true,
          maxlength: 20000,
          rows: 8,
        }),
      ),
      field(
        "Data",
        input("date", (existing?.date || now()).slice(0, 10), {
          type: "date",
          required: true,
        }),
      ),
      h("details", {}, h("summary", {}, "associar livros (opcional)"), options),
      h(
        "details",
        {},
        h("summary", {}, "imagem (opcional)"),
        imageEditor("Imagem da entrada", image, (v) => (image = v)),
      ),
      submit("salvar texto"),
    ),
    d = modal(
      existing
        ? "editar texto"
        : kind === "journal"
          ? "uma página do diário"
          : "um novo post",
      f,
    );
  formSubmit(f, (data) => {
    if (!data.get("title").trim() || !data.get("text").trim())
      throw new Error("Preencha o título e o texto.");
    const dateValue = new Date(`${data.get("date")}T12:00:00`);
    if (Number.isNaN(dateValue.getTime()))
      throw new Error("Informe uma data válida.");
    Store.updateUser(u.id, (user) => {
      const collection = kind === "journal" ? "journal" : "posts",
        item = {
          id: existing?.id || Store.uid(),
          title: data.get("title").trim(),
          text: data.get("text").trim(),
          date: dateValue.toISOString(),
          image,
          bookIds: [...selected],
        },
        idx = user[collection].findIndex((p) => p.id === item.id);
      if (idx >= 0) user[collection][idx] = item;
      else user[collection].unshift(item);
    });
    d.close();
    notify("Texto salvo.");
    rerender();
  });
}
function journalPage(user) {
  if (!user)
    return h(
      "div",
      {},
      heading("diário"),
      empty("entre para abrir seu diário."),
      link("entrar", "#/login", { class: "button" }),
    );
  const entries = [
      ...user.journal.map((p) => ({ ...p, kind: "journal" })),
      ...user.posts.map((p) => ({ ...p, kind: "posts" })),
    ].sort((a, b) => b.date.localeCompare(a.date)),
    texts = h(
      "div",
      {},
      entries.length
        ? entries.map((p) =>
            h(
              "section",
              { class: "panel panel-body" },
              renderPost(p, p.kind, user),
              owner(user) &&
                h(
                  "div",
                  { class: "entry-actions" },
                  button("editar", () => postForm(p.kind, p)),
                  button(
                    "excluir",
                    guarded(async () => {
                      if (await confirmAction("Excluir este texto?")) {
                        Store.updateUser(
                          user.id,
                          (u) =>
                            (u[p.kind] = u[p.kind].filter(
                              (x) => x.id !== p.id,
                            )),
                        );
                        rerender();
                      }
                    }),
                    "danger",
                  ),
                ),
            ),
          )
        : empty(
            "o caderno está em branco.",
            "Um livro, vários livros, ou nada a ver com livros. Escreva.",
          ),
    );
  return h(
    "div",
    {},
    heading(
      owner(user)
        ? "meu diário"
        : h("span", {}, "diário de ", userIdentity(user, { linkProfile: true })),
      "leituras acontecem. algumas coisas merecem ser escritas.",
    ),
    owner(user) &&
      h(
        "div",
        { class: "toolbar" },
        button("＋ entrada no diário", () => postForm("journal"), "primary"),
        button("＋ post pessoal", () => postForm("posts")),
      ),
    h(
      "div",
      { class: "two-column" },
      h(
        "aside",
        {},
        panel(
          "atividade automática",
          renderActivity(user.activity, user.username),
        ),
      ),
      texts,
    ),
  );
}
function shelfPage(user, status) {
  if (!user)
    return empty(
      "página não encontrada.",
      "Entre ou visite a página de um leitor.",
    );
  const items = userBooks(
    user,
    (e) =>
      status === "todos" ||
      (status === "favoritos" ? e.favorite : e.status === status),
  );
  return h(
    "div",
    {},
    heading(
      h(
        "span",
        {},
        `${status === "todos" ? "Todos os livros" : status === "favoritos" ? "Favoritos" : STATUS[status] || "Estante"} · `,
        userIdentity(user, { linkProfile: true }),
      ),
      `${items.length} livros nesta seleção`,
      link("voltar à página", `#/pagina/${user.username}`),
    ),
    h(
      "div",
      { class: "toolbar" },
      Object.entries({ todos: "Todos", ...STATUS, favoritos: "Favoritos" }).map(
        ([k, v]) =>
          link(v, `#/estante/${k}?user=${user.username}`, { class: "button" }),
      ),
    ),
    booksGrid(items, user.ratings),
  );
}
function adminPage(query) {
  const admin = Store.currentUser();
  if (admin?.role !== "admin")
    return h(
      "div",
      { class: "error-box" },
      "Esta área é restrita ao administrador.",
      link("voltar à home", "#/home"),
    );
  const inspect = query.get("view");
  if (inspect) {
    const u = Store.userByName(inspect);
    return u ? home(u, { inspect: true }) : empty("conta não encontrada.");
  }
  const all = Store.users(),
    sum = (key) =>
      all.reduce(
        (n, u) =>
          n +
          (Array.isArray(u[key]) ? u[key].length : Object.keys(u[key]).length),
        0,
      ),
    rows = all.map((u) =>
      h(
        "tr",
        {},
        h(
          "td",
          {},
          u.page.displayName,
          h("br"),
          h("small", {}, userIdentity(u, { username: true, linkProfile: true })),
        ),
        h("td", {}, u.role),
        h("td", {}, u.library.length),
        h("td", {}, u.reviews.length),
        h("td", {}, u.lists.length),
        h("td", {}, u.posts.length + u.journal.length),
        h("td", {}, date(u.createdAt)),
        h(
          "td",
          {},
          link("visitar página", `#/pagina/${u.username}`),
          h("br"),
          link("visualizar como usuário", `#/admin?view=${u.username}`),
          h("br"),
          u.role !== "admin" &&
            button(
              "resetar conta",
              guarded(async () => {
                if (
                  await confirmAction(
                    `Resetar a conta de ${u.page.displayName}? Isso apagará biblioteca, notas, resenhas, listas, textos e personalização. A conta e a senha serão mantidas.`,
                  )
                ) {
                  Store.resetUser(u.id);
                  notify("Conta resetada.");
                  rerender();
                }
              }),
              "danger",
            ),
        ),
      ),
    );
  return h(
    "div",
    {},
    heading(
      "administração",
      "contas e números deste navegador. sem interferir nas páginas.",
    ),
    h(
      "p",
      { class: "notice" },
      "As permissões desta demonstração são verificadas apenas no cliente. Um backend será necessário para autenticação e autorização reais.",
    ),
    h(
      "div",
      { class: "toolbar" },
      [
        [all.length, "usuários"],
        [sum("library"), "livros nas bibliotecas"],
        [sum("ratings"), "avaliações"],
        [sum("reviews"), "resenhas"],
        [sum("lists"), "listas"],
        [sum("posts") + sum("journal"), "textos"],
      ].map(([n, t]) => h("span", { class: "tag" }, `${n} ${t}`)),
    ),
    h(
      "div",
      { class: "table-wrap" },
      h(
        "table",
        {},
        h(
          "thead",
          {},
          h(
            "tr",
            {},
            [
              "Usuário",
              "Role",
              "Livros",
              "Resenhas",
              "Listas",
              "Textos",
              "Criada em",
              "Ações",
            ].map((t) => h("th", {}, t)),
          ),
        ),
        h("tbody", {}, rows),
      ),
    ),
  );
}

async function render(route, active) {
  setBackgroundMusic(
    (route.parts[0] === "pagina"
      ? Store.userByName(route.parts[1])
      : Store.userByName(route.query.get("user"))) || Store.currentUser(),
  );
  const main = h("main", { id: "main", class: "page-content", tabindex: "-1" }),
    site = h(
      "div",
      { class: "site" },
      renderHeader(route),
      main,
      h(
        "footer",
        { class: "site-footer" },
        h(
          "span",
          {},
          "um livro leva a outro. uma página também.",
          h("br"),
          link("Open Library", "https://openlibrary.org", {
            target: "_blank",
            rel: "noopener noreferrer",
          }),
          " · catálogo aberto / dados pessoais locais",
        ),
        h(
          "div",
          { class: "footer-badges" },
          h("span", { class: "badge" }, "HTML + CSS"),
          h("span", { class: "badge" }, "web pessoal"),
          h("span", { class: "badge" }, "feito à mão"),
        ),
      ),
    );
  app.replaceChildren(site);
  const [name = "home", id, action] = route.parts;
  let content;
  try {
    switch (name) {
      case "home":
        content = home(Store.currentUser());
        break;
      case "login":
        content = auth(false);
        break;
      case "criar-pagina":
        content = auth(true);
        break;
      case "conta":
        content = await accountPage();
        break;
      case "amigos":
        content = await friendsPage(route.query);
        break;
      case "usuarios":
        content = peoplePage(route.query);
        break;      case "catalogo":
        content = route.query.get("media") === "albums"
          ? albumCatalogPage(route.query, active)
          : catalogPage(route.query, active);
        break;
      case "livros":
        content = catalogPage(route.query, active);
        break;
      case "albuns":
        content = albumCatalogPage(route.query, active);
        break;
      case "album":
        content = albumPage(id, route.query, active);
        break;
      case "colecao-albuns":
        content = albumShelfPage(selectedUser(route.query), id);
        break;
      case "lista-albuns":
        content = albumListPage(id);
        break;
      case "livro":
        content = bookPage(id, active);
        break;
      case "pagina": {
        const u = Store.userByName(id);
        if (!u) {
          content = empty(
            "essa página ainda não existe.",
            "Quem sabe seja o endereço da sua próxima página?",
          );
          break;
        }
        const pageMedia = route.query.get("media") === "albums" ? "albums" : "books";
        if (action === "editar") {
          content = owner(u)
            ? renderEditor(u, pageMedia)
            : h(
                "div",
                { class: "error-box" },
                "Apenas o dono desta página pode editá-la.",
                link("entrar", "#/login"),
              );
        } else {
          if (pageMedia === "books") await hydrateUserLibrary(u);
          const friendship = await friendshipProfileState(u);
          main.classList.add("personal-route");
          content = h(
            "div",
            {},
            h(
              "div",
              { class: "personal-controls" },
              link(pageMedia === "albums" ? "← álbuns" : "← livros", pageMedia === "albums" ? "#/albuns" : "#/livros"),
              h(
                "div",
                { class: "media-page-switch", role: "group", "aria-label": "Área da página" },
                link("Livros", `#/pagina/${u.username}`, { class: `button ${pageMedia === "books" ? "active" : ""}` }),
                link("Álbuns", `#/pagina/${u.username}?media=albums`, { class: `button ${pageMedia === "albums" ? "active" : ""}` }),
              ),
              owner(u) &&
                link(
                  "editar minha página",
                  `#/pagina/${u.username}/editar${pageMedia === "albums" ? "?media=albums" : ""}`,
                  { class: "button" },
                ),
              link("amigos", `#/amigos?user=${u.username}`, { class: "button" }),
              h("small", {}, userIdentity(u, { username: true, linkProfile: true })),
            ),
            mediaUser(u, pageMedia).page.customCode.mode === "visual"
              ? renderPersonalPage(u, { media: pageMedia, friendship })
              : await advancedFrame(
                  mediaUser(u, pageMedia),
                  mediaUser(u, pageMedia).page.customCode,
                  { friendship },
                ),
          );
        }
        break;
      }
      case "listas":
        content =
          route.query.get("media") === "albums"
            ? albumListsPage(selectedUser(route.query))
            : listsPage(selectedUser(route.query));
        break;
      case "lista":
        content = listPage(id);
        break;
      case "diario":
        content = journalPage(selectedUser(route.query));
        break;
      case "resenhas":
        content =
          route.query.get("media") === "albums"
            ? albumReviewsPage(selectedUser(route.query))
            : reviewsPage(selectedUser(route.query));
        break;
      case "estante":
        content = shelfPage(selectedUser(route.query), id);
        break;
      case "admin":
        content = adminPage(route.query);
        break;
      default:
        content = h(
          "div",
          {},
          empty("essa página se perdeu entre os livros."),
          link("voltar à home", "#/home"),
        );
    }
    if (active()) {
      main.append(content);
      positionBackgroundMusic(site);
      document.title = `${name === "pagina" ? Store.userByName(id)?.page.title || "Página" : name === "livro" ? Store.getBook(id)?.title || "Livro" : name === "albuns" ? "Álbuns" : name === "livros" ? "Livros" : name} · ${SITE_CONFIG.name}`;
      window.scrollTo(0, 0);
    }
  } catch (e) {
    if (active())
      main.replaceChildren(
        h(
          "div",
          { class: "error-box" },
          h("h2", {}, "Não foi possível abrir esta página."),
          h("p", {}, e.message),
          link("voltar à home", "#/home"),
        ),
      );
    console.error(e);
  }
}
async function boot() {
  try {
    await Store.bootstrapStorage();
    startRouter(render);
  } catch (e) {
    app.replaceChildren(
      h(
        "div",
        { class: "site page-content error-box" },
        h("h1", {}, "Não foi possível iniciar a MinhaEstante."),
        h("p", {}, e.message),
        h(
          "p",
          {},
          "Confira se o servidor está rodando. Quando o servidor não estiver disponível, os dados locais não são apagados.",
        ),
      ),
    );
  }
}
boot();
addEventListener("storage", (e) => {
  if ([Store.KEYS.users, Store.KEYS.session].includes(e.key)) rerender();
});
document.querySelector(".skip").addEventListener("click", (e) => {
  e.preventDefault();
  document.getElementById("main")?.focus();
});
document.addEventListener("click", (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = event.target.closest?.("a");
  const href = anchor?.getAttribute("href") || "";
  const match = href.match(/^#\/(livro|album)\/([^?]+)(?:\?user=([^&]+))?/);
  if (!match) return;
  event.preventDefault();
  const [, type, rawId, rawUser = ""] = match;
  const mediaId = decodeURIComponent(rawId);
  const username = rawUser ? decodeURIComponent(rawUser) : "";
  if (type === "album") openAlbumStyled(mediaId, username || Store.currentUser()?.username || "");
  else openBookModal(mediaId);
});

addEventListener("booksite:openmedia", (event) => {
  const { type, id, username } = event.detail || {};
  if (!id) return;
  if (type === "album") openAlbumStyled(id, username || Store.currentUser()?.username || "");
  else openBookModal(id);
});

addEventListener("booksite:friend-action", (event) => {
  guarded(() => runFriendAction(event.detail || {}))();
});

app.addEventListener("click", (event) => {
  const control = event.target.closest?.("[data-friend-action]");
  if (!control) return;
  const wrapper = control.closest("[data-friend-target-id]");
  event.preventDefault();
  guarded(() =>
    runFriendAction({
      action: control.dataset.friendAction || "",
      targetId: wrapper?.dataset.friendTargetId || "",
      targetName: wrapper?.dataset.friendTargetName || "",
      friendshipId: control.dataset.friendshipId || "",
    }),
  )();
});

registerBookTools();
