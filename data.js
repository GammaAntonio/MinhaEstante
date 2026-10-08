export const FONTS = [
  "Tahoma",
  "Verdana",
  "Arial",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Trebuchet MS",
];
export const STATUS = {
  "quero-ler": "Quero ler",
  lendo: "Lendo",
  lidos: "Lidos",
  abandonados: "Abandonados",
};
export const GADGETS = {
  about: "Sobre mim",
  reading: "Lendo agora",
  shelves: "Minhas estantes",
  favorites: "Favoritos",
  lists: "Minhas listas",
  reviews: "Últimas resenhas",
  activity: "Atividade",
  posts: "Posts recentes",
  tags: "Tags",
  month: "Livro do mês",
  text: "Texto livre",
  image: "Imagem",
  links: "Links",
  badges: "Badges",
  stats: "Estatísticas",
};
export const DEFAULT_THEME = {
  primaryColor: "#701d2c",
  secondaryColor: "#c88795",
  linkColor: "#701d2c",
  backgroundColor: "#111111",
  pageColor: "#ece9e5",
  panelColor: "#d8d5d2",
  textColor: "#101010",
  fontFamily: "Tahoma",
  headingFont: "Georgia",
  backgroundPattern: "textured",
  sidebarPosition: "left",
  sidebarWidth: "normal",
  wallStyle: "grid",
  reviewStyle: "full",
  headerStyle: "left",
  wallContent: ["books", "posts", "reviews", "lists", "activity", "favorites"],
};
export const THEMES = {
  "Emo vinho": DEFAULT_THEME,
  "Cinza 2007": {
    ...DEFAULT_THEME,
    primaryColor: "#454545",
    secondaryColor: "#acacac",
    linkColor: "#333333",
    backgroundColor: "#858585",
    backgroundPattern: "stripes",
  },
  "Preto e branco": {
    ...DEFAULT_THEME,
    primaryColor: "#161616",
    secondaryColor: "#dddddd",
    linkColor: "#202020",
    backgroundColor: "#ffffff",
    pageColor: "#ffffff",
    panelColor: "#eeeeee",
    backgroundPattern: "plain",
  },
  "Rosa envelhecido": {
    ...DEFAULT_THEME,
    primaryColor: "#805361",
    secondaryColor: "#c88795",
    linkColor: "#793c50",
    backgroundColor: "#c7c3bf",
    pageColor: "#f5eeeb",
    panelColor: "#e4d6d7",
    fontFamily: "Georgia",
    sidebarPosition: "right",
    wallStyle: "blog",
    backgroundPattern: "dots",
  },
  "Azul internet antiga": {
    ...DEFAULT_THEME,
    primaryColor: "#23496d",
    secondaryColor: "#aac4d5",
    linkColor: "#164b80",
    backgroundColor: "#223647",
    panelColor: "#c7d5dc",
    backgroundPattern: "checker",
  },
  "Verde terminal": {
    ...DEFAULT_THEME,
    primaryColor: "#163c23",
    secondaryColor: "#a1c69c",
    linkColor: "#a4dea7",
    backgroundColor: "#0b100b",
    pageColor: "#142016",
    panelColor: "#1c2c1e",
    textColor: "#d3e6d1",
    fontFamily: "Courier New",
    headingFont: "Courier New",
    wallStyle: "compact",
    backgroundPattern: "plain",
  },
};
const seed = (id, title, author, year, cover, description) => ({
  id,
  source: "local",
  openLibraryWorkId: id,
  openLibraryEditionId: "",
  googleVolumeId: "",
  title,
  subtitle: "",
  authors: [author],
  description,
  firstPublishYear: year,
  publishedDate: "",
  publishers: [],
  isbn10: [],
  isbn13: [],
  pageCount: null,
  languages: [],
  subjects: [],
  coverUrl: `https://covers.openlibrary.org/b/id/${cover}-M.jpg?default=false`,
  editionCount: null,
});
// Metadados mínimos para a demonstração offline; detalhes vêm da API ao abrir uma obra.
export const SEED_BOOKS = [
  seed(
    "OL21025633W",
    "Memórias do subsolo",
    "Fiódor Dostoiévski",
    1864,
    10445973,
    "Um narrador recluso confronta a razão, a liberdade e suas próprias contradições.",
  ),
  seed(
    "OL166894W",
    "Crime e castigo",
    "Fiódor Dostoiévski",
    1866,
    9411873,
    "Raskólnikov atravessa São Petersburgo entre o peso de uma ideia e as consequências de um crime.",
  ),
  seed(
    "OL1168083W",
    "1984",
    "George Orwell",
    1949,
    9267242,
    "Um romance sobre vigilância, linguagem e memória em uma sociedade autoritária.",
  ),
  seed(
    "OL1230613W",
    "O Estrangeiro",
    "Albert Camus",
    1942,
    13151269,
    "Meursault e o desencontro entre a experiência individual e as expectativas do mundo.",
  ),
  seed(
    "OL498556W",
    "A metamorfose",
    "Franz Kafka",
    1915,
    12820198,
    "Gregor Samsa acorda transformado; o cotidiano de sua família passa a revelar outras formas de estranhamento.",
  ),
  seed(
    "OL64365W",
    "Admirável mundo novo",
    "Aldous Huxley",
    1932,
    8231823,
    "Uma sociedade planejada para a estabilidade e a felicidade, a qualquer custo.",
  ),
];
export function blankUser(username, displayName, role = "user") {
  return {
    id:
      globalThis.crypto?.randomUUID?.() ||
      `user-${Date.now()}-${Math.random()}`,
    username,
    role,
    createdAt: new Date().toISOString(),
    page: {
      displayName,
      title: "estante de livros",
      subtitle: "meus livros e outras coisas",
      bio: "",
      avatar: "",
      banner: "",
      favoriteGenres: [],
      links: [],
      customization: structuredClone(DEFAULT_THEME),
      gadgets: Object.keys(GADGETS).map((type, position) => ({
        type,
        position,
        enabled: ["about", "reading", "shelves", "text", "links"].includes(
          type,
        ),
        text: "",
        image: "",
        bookId: "",
        listIds: [],
      })),
      badges: [],
      music: {
        url: "",
        fileId: "",
        fileName: "",
        title: "",
        enabled: false,
        loop: true,
      },
      customCode: {
        mode: "visual",
        html: "",
        css: "",
        javascript: "",
        sections: {},
        previousVersion: null,
        updatedAt: null,
      },
    },
    library: [],
    ratings: {},
    reviews: [],
    lists: [],
    journal: [],
    posts: [],
    activity: [],
    albums: {
      type: "album",
      library: [],
      ratings: {},
      trackRatings: {},
      reviews: [],
      lists: [],
      audio: {},
      snapshots: {},
    },
  };
}
export function seedUsers() {
  const antonio = blankUser("antonio", "Antonio");
  antonio.page.title = "quadrinhos na estante";
  antonio.page.subtitle = "livros, textos e algumas obsessões temporárias";
  antonio.page.bio =
    "leitor de madrugada. anotando coisas para não esquecer. este é meu pequeno canto da internet.";
  antonio.page.favoriteGenres = [
    "literatura russa",
    "existencialismo",
    "distopias",
  ];
  antonio.page.links = [
    { label: "Open Library", url: "https://openlibrary.org" },
  ];
  antonio.page.gadgets.forEach(
    (g) =>
      (g.enabled = [
        "about",
        "reading",
        "shelves",
        "text",
        "links",
        "tags",
        "stats",
      ].includes(g.type)),
  );
  antonio.page.gadgets.find((g) => g.type === "text").text =
    "";
  return [antonio];
}
