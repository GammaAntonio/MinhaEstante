import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initStorage,
  currentUser,
  userByName,
  updateUser,
  resetUser,
  setBookStatus,
  toggleFavorite,
  rateBook,
  removeBookFromShelf,
  getBook,
  read,
  KEYS,
  write,
} from '../storage.js';
import { SEED_BOOKS, blankUser, THEMES } from '../data.js';
import { deduplicate, normalizeOL, normalizeGoogle, BookService } from '../api.js';
import { parseCustomization } from '../editor.js';
import { publicPageData, userBooks } from '../personal.js';
import { safeURL } from '../ui.js';
import { mediaVariant, copyAppearance } from '../page-media.js';

class MemoryStorage {
  data = new Map();
  getItem(k) {
    return this.data.get(k) ?? null;
  }
  setItem(k, v) {
    this.data.set(k, String(v));
  }
  removeItem(k) {
    this.data.delete(k);
  }
  clear() {
    this.data.clear();
  }
}
globalThis.localStorage = new MemoryStorage();
const reset = () => {
  localStorage.clear();
  initStorage();
  const all = read(KEYS.users, []);
  if (!all.some((u) => u.username === 'maria')) {
    const maria = blankUser('maria', 'Maria Carolina');
    maria.page.customization = structuredClone(THEMES['Rosa envelhecido']);
    all.push(maria);
  }
  if (!all.some((u) => u.username === 'admin')) all.push(blankUser('admin', 'Administrador', 'admin'));
  write(KEYS.users, all);
};
const signIn = (username) => write(KEYS.session, userByName(username).id);
const signOut = () => localStorage.removeItem(KEYS.session);
test('perfis padrão começam sem conteúdo pessoal de obras', () => {
  reset();
  assert.equal(userByName('antonio').library.length, 0);
  assert.deepEqual(userByName('antonio').ratings, {});
  assert.equal(userByName('antonio').reviews.length, 0);
  assert.equal(userByName('antonio').lists.length, 0);
  assert.equal(userByName('antonio').posts.length, 0);
  assert.equal(userByName('antonio').journal.length, 0);
  assert.equal(userByName('antonio').activity.length, 0);
  assert.equal(userByName('maria').library.length, 0);
  assert.equal(userByName('maria').reviews.length, 0);
  assert.notEqual(
    userByName('antonio').page.customization.primaryColor,
    userByName('maria').page.customization.primaryColor,
  );
});

test('Livros e Álbuns mantêm aparências independentes e podem ser padronizados', () => {
  reset();
  const u = userByName('antonio');
  const books = mediaVariant(u.page, 'books');
  const albums = mediaVariant(u.page, 'albums');
  books.customization.primaryColor = '#111111';
  albums.customization.primaryColor = '#abcdef';
  assert.notEqual(books.customization.primaryColor, albums.customization.primaryColor);
  copyAppearance(u.page, 'books', 'albums');
  assert.equal(mediaVariant(u.page, 'albums').customization.primaryColor, '#111111');
  mediaVariant(u.page, 'albums').customization.fontFamily = 'Verdana';
  assert.notEqual(mediaVariant(u.page, 'books').customization.fontFamily, 'Verdana');
});
test('biblioteca, favoritos, notas e atividade ficam isolados por conta', () => {
  reset();
  signIn('maria');
  const antonio = JSON.stringify(userByName('antonio')),
    book = getBook(SEED_BOOKS[0].id);
  setBookStatus(book, 'lidos');
  rateBook(book, 4.5);
  toggleFavorite(book);
  assert.equal(currentUser().library[0].status, 'lidos');
  assert.equal(currentUser().ratings[book.id], 4.5);
  assert.equal(currentUser().library[0].favorite, true);
  assert.equal(currentUser().activity.length, 3);
  signOut();
  signIn('maria');
  assert.equal(currentUser().ratings[book.id], 4.5);
  assert.equal(JSON.stringify(userByName('antonio')), antonio);
});
test('notas fora de 0.5–5 são recusadas sem mutação', () => {
  reset();
  signIn('antonio');
  const before = JSON.stringify(currentUser());
  assert.throws(() => rateBook(SEED_BOOKS[0], 3.7));
  assert.throws(() => rateBook(SEED_BOOKS[0], 8));
  assert.equal(JSON.stringify(currentUser()), before);
});
test('avaliar ou resenhar garante uma entrada persistente na estante', () => {
  reset();
  signIn('antonio');
  const book = getBook(SEED_BOOKS[0].id);

  rateBook(book, 5);
  let user = currentUser();
  assert.equal(user.library.length, 1);
  assert.equal(user.library[0].bookId, book.id);
  assert.equal(user.library[0].book.title, book.title);

  removeBookFromShelf(book.id);
  updateUser(currentUser().id, (draft) => {
    draft.reviews.push({
      id: 'review-without-library',
      bookId: book.id,
      rating: 5,
      text: 'resenha',
      date: '2026-01-01T00:00:00.000Z',
    });
    draft.ratings[book.id] = 5;
  });
  user = currentUser();
  assert.equal(user.library.length, 1);
  assert.equal(user.library[0].bookId, book.id);
  assert.equal(userBooks(user)[0].title, book.title);
});
test('bootstrap repara avaliações e resenhas antigas sem entrada na library', () => {
  reset();
  const all = read(KEYS.users, []);
  const antonio = all.find((user) => user.username === 'antonio');
  const book = SEED_BOOKS[1];
  antonio.library = [];
  antonio.ratings[book.id] = 4.5;
  antonio.reviews.push({
    id: 'legacy-review',
    bookId: book.id,
    rating: 4.5,
    text: 'legada',
    date: '2026-01-01T00:00:00.000Z',
  });
  localStorage.setItem(KEYS.users, JSON.stringify(all));

  initStorage();
  const repaired = userByName('antonio');
  assert.equal(repaired.library.length, 1);
  assert.equal(repaired.library[0].bookId, book.id);
  assert.equal(repaired.library[0].book.title, book.title);
});
test('listas legadas reparam entrada na estante e removem IDs duplicados', () => {
  reset();
  signIn('antonio');
  const book = getBook(SEED_BOOKS[0].id);
  updateUser(currentUser().id, (u) => {
    u.library = [];
    u.lists.push({ id: 'legacy-list', title: 'lista', bookIds: [book.id, book.id] });
  });
  const user = currentUser();
  assert.deepEqual(user.lists[0].bookIds, [book.id]);
  assert.equal(user.library.length, 1);
  assert.equal(user.library[0].bookId, book.id);
  assert.equal(user.library[0].book.title, book.title);
});

test('usuário não pode editar ou resetar outra conta', () => {
  reset();
  signIn('maria');
  assert.throws(() => updateUser(userByName('antonio').id, (u) => (u.role = 'admin')));
  assert.throws(() => resetUser(userByName('antonio').id));
  assert.equal(userByName('antonio').role, 'user');
});
test('reset do admin limpa apenas a conta selecionada, sem trocar sessão', () => {
  reset();
  signIn('admin');
  const maria = JSON.stringify(userByName('maria'));
  resetUser(userByName('antonio').id);
  assert.equal(userByName('antonio').library.length, 0);
  assert.equal(userByName('antonio').password, undefined);
  assert.equal(userByName('antonio').passwordHash, undefined);
  assert.equal(currentUser().username, 'admin');
  assert.equal(JSON.stringify(userByName('maria')), maria);
  assert.throws(() => resetUser(currentUser().id));
});
test('URLs rejeitam execução de script e SVG em data URL', () => {
  assert.equal(safeURL('javascript:alert(1)'), '');
  assert.equal(safeURL('data:image/svg+xml,<svg onload=alert(1)>', { image: true }), '');
  assert.equal(safeURL('https://example.com/image.png'), 'https://example.com/image.png');
  assert.equal(
    safeURL('data:image/png;base64,YQ==', { image: true }),
    'data:image/png;base64,YQ==',
  );
});
test('parser local reconhece fundo, fonte, mural, sidebar e gadgets', () => {
  const changes = parseCustomization(
    'quero fundo preto, detalhes vinho, Georgia nos títulos, mural blog, sidebar na direita e esconder as estatísticas',
    {},
  );
  assert(changes.some((c) => c.key === 'backgroundColor' && c.value === '#111111'));
  assert(changes.some((c) => c.key === 'headingFont' && c.value === 'Georgia'));
  assert(changes.some((c) => c.key === 'wallStyle' && c.value === 'blog'));
  assert(changes.some((c) => c.key === 'sidebarPosition' && c.value === 'right'));
  assert(changes.some((c) => c.gadget === 'stats' && !c.value));
  assert.equal(parseCustomization('<script>alert(1)</script>', {}).length, 0);
});
test('dados de template são cópias públicas sem senha, role, sessão ou código', () => {
  reset();
  const u = userByName('antonio');
  u.lists.push({ id: 'lista', title: 'original', description: '', bookIds: [], date: '' });
  const
    data = publicPageData(u);
  assert.equal(data.user.password, undefined);
  assert.equal(data.user.role, undefined);
  assert.equal(data.user.id, undefined);
  assert.equal(data.customCode, undefined);
  data.user.displayName = 'alterado';
  data.lists[0].title = 'alterada';
  assert.notEqual(userByName('antonio').page.displayName, 'alterado');
  assert.notEqual(u.lists[0].title, 'alterada');
});

test('remover livro apaga dados pessoais em cascata e readição começa limpa', () => {
  reset();
  signIn('antonio');
  const book = getBook(SEED_BOOKS[0].id), otherId = SEED_BOOKS[1].id;
  setBookStatus(book, 'lidos');
  toggleFavorite(book);
  rateBook(book, 4.5);
  updateUser(currentUser().id, (u) => {
    u.reviews.push({ id: 'review', bookId: book.id, rating: 4.5, text: 'texto' });
    u.lists.push(
      { id: 'one', bookIds: [book.id, otherId] },
      { id: 'two', bookIds: [book.id] },
    );
    u.posts.push({ id: 'post', title: 'post preservado', bookIds: [book.id, otherId] });
    u.journal.push({ id: 'journal', title: 'diário preservado', bookIds: [book.id] });
    u.activity.push({ id: 'other', bookId: otherId, text: 'outra obra' });
    u.page.gadgets.find((g) => g.type === 'month').bookId = book.id;
    u.page.mediaPages.books.gadgets.find((g) => g.type === 'month').bookId = book.id;
  });

  removeBookFromShelf(book.id);
  let user = currentUser();
  assert.equal(user.library.some((item) => item.bookId === book.id), false);
  assert.equal(user.ratings[book.id], undefined);
  assert.equal(user.reviews.some((item) => item.bookId === book.id), false);
  assert.deepEqual(user.lists.map((list) => list.bookIds), [[otherId], []]);
  assert.equal(user.posts.length, 1);
  assert.deepEqual(user.posts[0].bookIds, [otherId]);
  assert.equal(user.journal.length, 1);
  assert.deepEqual(user.journal[0].bookIds, []);
  assert.equal(user.activity.some((item) => item.bookId === book.id), false);
  assert.equal(user.activity.some((item) => item.bookId === otherId), true);
  assert.equal(user.page.gadgets.find((g) => g.type === 'month').bookId, '');

  signOut();
  signIn('antonio');
  assert.equal(currentUser().ratings[book.id], undefined);
  setBookStatus(book, 'lendo');
  user = currentUser();
  assert.equal(user.library.find((item) => item.bookId === book.id).favorite, false);
  assert.equal(user.ratings[book.id], undefined);
  assert.equal(user.reviews.some((item) => item.bookId === book.id), false);
});
test('normalização mantém Work como identidade e edições separadas', () => {
  const b = normalizeOL({
    key: '/works/OL123W',
    title: 'Livro',
    author_name: ['Autor'],
    cover_i: 22,
    edition_key: ['OL456M'],
    isbn: ['1234567890', '1234567890123'],
  });
  assert.equal(b.id, 'OL123W');
  assert.equal(b.openLibraryEditionId, 'OL456M');
  assert.equal(b.isbn13[0], '1234567890123');
  assert.match(b.coverUrl, /\/id\/22-M/);
});
test('deduplicação une ISBN e título/autor e preserva identidade Open Library', () => {
  const a = normalizeOL({
    key: '/works/OL1W',
    title: 'Memórias',
    author_name: ['José'],
    isbn: ['1234567890123'],
  });
  const b = normalizeGoogle({
    id: 'google1',
    volumeInfo: {
      title: 'Outra edição',
      authors: ['Jose'],
      description: 'descrição',
      industryIdentifiers: [{ type: 'ISBN_13', identifier: '1234567890123' }],
    },
  });
  assert.equal(deduplicate([a, b]).length, 1);
  assert.equal(deduplicate([b, a])[0].id, 'OL1W');
  assert.equal(deduplicate([a, b])[0].description, 'descrição');
  assert.equal(deduplicate([a, { ...b, isbn13: [], title: 'Memorias' }]).length, 1);
});
test('Open Library positiva usa uma única consulta e cache; Google não é chamado', async () => {
  reset();
  const original = globalThis.fetch;
  let calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    return {
      ok: true,
      json: async () => ({
        numFound: 1,
        docs: [{ key: '/works/OL99W', title: 'Teste cache', author_name: ['Autor'] }],
      }),
    };
  };
  try {
    const one = await BookService.search('teste cache');
    const two = await BookService.search('teste cache');
    assert.equal(one.source, 'openlibrary');
    assert.equal(two.books[0].id, 'OL99W');
    assert.equal(calls.length, 1);
    assert(!calls.some((url) => url.includes('googleapis')));
  } finally {
    globalThis.fetch = original;
  }
});
test('zero resultados aciona fallback Google Books', async () => {
  reset();
  const original = globalThis.fetch;
  let calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    return {
      ok: true,
      json: async () =>
        url.includes('openlibrary')
          ? { numFound: 0, docs: [] }
          : {
              totalItems: 1,
              items: [
                { id: 'fallback', volumeInfo: { title: 'Livro fallback', authors: ['Pessoa'] } },
              ],
            },
    };
  };
  try {
    const result = await BookService.search('livro fallback');
    assert.equal(result.source, 'google');
    assert.equal(result.books[0].id, 'google-fallback');
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = original;
  }
});
test('falha de rede preserva biblioteca e busca no catálogo local', async () => {
  reset();
  const original = globalThis.fetch,
    all = JSON.stringify(read(KEYS.users));
  globalThis.fetch = async () => {
    throw new Error('rede indisponível');
  };
  try {
    const result = await BookService.search('Memórias do subsolo');
    assert.equal(result.source, 'local');
    assert.equal(result.books[0].id, 'OL21025633W');
    assert.equal(JSON.stringify(read(KEYS.users)), all);
  } finally {
    globalThis.fetch = original;
  }
});
