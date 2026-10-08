import { SITE_CONFIG } from './config.js';
import { read, write, KEYS, cacheBooks, catalog, getBook } from './storage.js';

const normalize = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const strip = (s) =>
  String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const arr = (v) => (Array.isArray(v) ? v : []);
let queue = Promise.resolve(),
  lastRequest = 0;
const pending = new Map();
const coverFallbacks = new Map();
async function fetchJSON(url) {
  if (pending.has(url)) return pending.get(url);
  const task = (async () => {
    const cached = read(KEYS.api, {})[url];
    if (cached && Date.now() - cached.time < SITE_CONFIG.cacheTTL) return cached.data;
    if (globalThis.navigator?.onLine === false)
      throw new Error('Você está offline. Os livros já consultados continuam disponíveis.');
    // A API pública da Open Library pede moderação; não fazer buscas a cada tecla.
    const operation = queue
      .catch(() => {})
      .then(async () => {
        const delay = 1100 - (Date.now() - lastRequest);
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
        lastRequest = Date.now();
        const controller = new AbortController(),
          timer = setTimeout(() => controller.abort(), 14000);
        try {
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok)
            throw new Error(
              `O serviço respondeu ${response.status}. Tente novamente em alguns instantes.`,
            );
          const data = await response.json();
          const entries = Object.entries(read(KEYS.api, {}))
            .filter(([, v]) => Date.now() - v.time < SITE_CONFIG.cacheTTL)
            .slice(-45);
          // Falhar ao gravar cache não deve transformar uma busca bem-sucedida em erro.
          try {
            write(KEYS.api, { ...Object.fromEntries(entries), [url]: { time: Date.now(), data } });
          } catch {}
          return data;
        } catch (e) {
          if (e.name === 'AbortError')
            throw new Error('A consulta demorou demais. Tente novamente.');
          throw e;
        } finally {
          clearTimeout(timer);
        }
      });
    queue = operation;
    return operation;
  })();
  pending.set(url, task);
  try {
    return await task;
  } finally {
    pending.delete(url);
  }
}
export function normalizeOL(d) {
  const work = String(d.key || '')
    .split('/')
    .pop();
  const edition = d.editions?.docs?.[0];
  const editionId = edition?.key?.split('/').pop() || d.edition_key?.[0] || '';
  const isbns = arr(d.isbn),
    coverId = d.cover_i || edition?.cover_i;
  const coverUrl = coverId
    ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg?default=false`
    : editionId
      ? `https://covers.openlibrary.org/b/olid/${editionId}-M.jpg?default=false`
      : isbns[0]
        ? `https://covers.openlibrary.org/b/isbn/${isbns[0]}-M.jpg?default=false`
        : '';
  return {
    id: work,
    source: 'openlibrary',
    openLibraryWorkId: work,
    openLibraryEditionId: editionId,
    googleVolumeId: '',
    title: d.title || 'Título não informado',
    subtitle: d.subtitle || '',
    authors: arr(d.author_name),
    description: typeof d.description === 'string' ? d.description : d.description?.value || '',
    firstPublishYear: d.first_publish_year || null,
    publishedDate: '',
    publishers: arr(d.publisher).slice(0, 6),
    isbn10: isbns.filter((x) => x.length === 10).slice(0, 10),
    isbn13: isbns.filter((x) => x.length === 13).slice(0, 10),
    pageCount: d.number_of_pages_median || null,
    languages: arr(d.language).slice(0, 10),
    subjects: arr(d.subject).slice(0, 14),
    coverUrl,
    editionCount: d.edition_count || null,
  };
}
export function normalizeGoogle(d) {
  const v = d.volumeInfo || {},
    ids = v.industryIdentifiers || [];
  return {
    id: `google-${d.id}`,
    source: 'google',
    openLibraryWorkId: '',
    openLibraryEditionId: '',
    googleVolumeId: d.id,
    title: v.title || 'Título não informado',
    subtitle: v.subtitle || '',
    authors: arr(v.authors),
    description: strip(v.description),
    firstPublishYear: parseInt(v.publishedDate) || null,
    publishedDate: v.publishedDate || '',
    publishers: v.publisher ? [v.publisher] : [],
    isbn10: ids.filter((x) => x.type === 'ISBN_10').map((x) => x.identifier),
    isbn13: ids.filter((x) => x.type === 'ISBN_13').map((x) => x.identifier),
    pageCount: v.pageCount || null,
    languages: v.language ? [v.language] : [],
    subjects: arr(v.categories),
    coverUrl: (v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || '').replace(
      'http:',
      'https:',
    ),
    editionCount: 1,
  };
}
export function sameBook(a, b) {
  if (a.openLibraryWorkId && a.openLibraryWorkId === b.openLibraryWorkId) return true;
  for (const type of ['isbn13', 'isbn10'])
    if (arr(a[type]).some((x) => arr(b[type]).includes(x))) return true;
  return (
    normalize(a.title) === normalize(b.title) &&
    a.authors?.length &&
    b.authors?.length &&
    normalize(a.authors[0]) === normalize(b.authors[0])
  );
}
export function supplement(a, b) {
  const result = { ...a };
  for (const key of [
    'description',
    'coverUrl',
    'pageCount',
    'publishedDate',
    'firstPublishYear',
    'openLibraryEditionId',
    'googleVolumeId',
  ])
    if (!result[key]) result[key] = b[key];
  for (const key of ['isbn10', 'isbn13', 'languages', 'publishers', 'subjects'])
    if (!result[key]?.length) result[key] = b[key] || [];
  return result;
}
export function deduplicate(books) {
  const out = [];
  for (const b of books) {
    const i = out.findIndex((x) => sameBook(x, b));
    if (i < 0) out.push(b);
    else if (b.source === 'openlibrary' && out[i].source !== 'openlibrary')
      out[i] = supplement(b, out[i]);
    else out[i] = supplement(out[i], b);
  }
  return out;
}
export const OpenLibraryService = {
  async search(query, type = 'q', page = 1) {
    const params = new URLSearchParams({
      [type]: query,
      limit: String(SITE_CONFIG.pageSize),
      page: String(page),
      lang: 'pt',
      fields:
        'key,title,subtitle,author_name,first_publish_year,cover_i,edition_key,edition_count,isbn,language,subject,publisher,number_of_pages_median',
    });
    const d = await fetchJSON(`https://openlibrary.org/search.json?${params}`);
    return { books: arr(d.docs).map(normalizeOL), total: d.numFound ?? d.num_found ?? 0 };
  },
  async details(book) {
    const id = book.openLibraryWorkId;
    if (!/^OL\d+W$/.test(id)) return book;
    const work = await fetchJSON(`https://openlibrary.org/works/${id}.json`);
    let editions = [],
      editionError = '';
    try {
      const result = await fetchJSON(`https://openlibrary.org/works/${id}/editions.json?limit=8`);
      editions = arr(result.entries).map((e) => ({
        id: e.key?.split('/').pop(),
        title: e.title,
        language: arr(e.languages)
          .map((x) => x.key?.split('/').pop())
          .join(', '),
        publishers: arr(e.publishers),
        publishedDate: e.publish_date || '',
        pageCount: e.number_of_pages || null,
        isbn10: arr(e.isbn_10),
        isbn13: arr(e.isbn_13),
      }));
    } catch (e) {
      editionError = e.message;
    }
    const first = editions[0];
    let authors = book.authors || [];
    if (!authors.length)
      for (const author of arr(work.authors).slice(0, 3)) {
        try {
          const key = author.author?.key;
          if (/^\/authors\/OL\d+A$/.test(key)) {
            const d = await fetchJSON(`https://openlibrary.org${key}.json`);
            if (d.name) authors.push(d.name);
          }
        } catch {}
      }
    return {
      ...book,
      source: 'openlibrary',
      title: book.title || work.title,
      authors,
      description:
        typeof work.description === 'string'
          ? work.description
          : work.description?.value || book.description,
      subjects: arr(work.subjects).slice(0, 16),
      coverUrl: work.covers?.find((x) => x > 0)
        ? `https://covers.openlibrary.org/b/id/${work.covers.find((x) => x > 0)}-M.jpg?default=false`
        : book.coverUrl,
      editions,
      editionError,
      openLibraryEditionId: first?.id || book.openLibraryEditionId,
      publishers: book.publishers?.length ? book.publishers : first?.publishers || [],
      pageCount: book.pageCount || first?.pageCount || null,
      isbn10: book.isbn10?.length ? book.isbn10 : first?.isbn10 || [],
      isbn13: book.isbn13?.length ? book.isbn13 : first?.isbn13 || [],
      languages: book.languages?.length
        ? book.languages
        : [...new Set(editions.map((e) => e.language).filter(Boolean))],
      detailsAt: Date.now(),
    };
  },
};
export const GoogleBooksService = {
  async search(query, type = 'q', page = 1) {
    const operators = { q: '', title: 'intitle:', author: 'inauthor:', isbn: 'isbn:' };
    const p = new URLSearchParams({
      q: (operators[type] || '') + query,
      maxResults: String(SITE_CONFIG.pageSize),
      startIndex: String((page - 1) * SITE_CONFIG.pageSize),
      printType: 'books',
    });
    if (SITE_CONFIG.GOOGLE_BOOKS_API_KEY) p.set('key', SITE_CONFIG.GOOGLE_BOOKS_API_KEY);
    const d = await fetchJSON(`https://www.googleapis.com/books/v1/volumes?${p}`);
    return { books: arr(d.items).map(normalizeGoogle), total: d.totalItems || 0 };
  },
  async details(id) {
    const p = SITE_CONFIG.GOOGLE_BOOKS_API_KEY
      ? `?key=${encodeURIComponent(SITE_CONFIG.GOOGLE_BOOKS_API_KEY)}`
      : '';
    return normalizeGoogle(
      await fetchJSON(`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(id)}${p}`),
    );
  },
};
export const BookService = {
  async coverFallback(book) {
    if (book.fallbackCoverUrl) return book.fallbackCoverUrl;
    if (book.source === 'google') return '';
    if (coverFallbacks.has(book.id)) return coverFallbacks.get(book.id);
    const promise = (async () => {
      try {
        const isbn = book.isbn13?.[0] || book.isbn10?.[0];
        const result = await GoogleBooksService.search(
          isbn || `${book.title} ${book.authors?.[0] || ''}`,
          isbn ? 'isbn' : 'q',
        );
        const match = result.books.find((b) => sameBook(book, b));
        if (match?.coverUrl) {
          const current = getBook(book.id) || book;
          try {
            cacheBooks([{ ...current, fallbackCoverUrl: match.coverUrl }]);
          } catch {}
          return match.coverUrl;
        }
      } catch {}
      return '';
    })();
    coverFallbacks.set(book.id, promise);
    return promise;
  },
  async search(query, type = 'q', page = 1) {
    query = query.trim().slice(0, 200);
    if (!query) return { books: [], total: 0, source: 'openlibrary' };
    const normalizedISBN = query.replace(/[\s-]/g, '');
    if (type === 'q' && /^(\d{13}|\d{9}[\dXx])$/.test(normalizedISBN)) {
      type = 'isbn';
      query = normalizedISBN;
    }
    if (type === 'isbn') query = normalizedISBN;
    let result,
      warning = '';
    try {
      result = await OpenLibraryService.search(query, type, page);
    } catch (e) {
      warning = e.message;
    }
    let source = 'openlibrary';
    if (!result?.books.length) {
      try {
        const fallback = await GoogleBooksService.search(query, type, page);
        if (fallback.books.length) {
          result = fallback;
          source = 'google';
          warning =
            'Resultados do Google Books: a Open Library não retornou resultados nesta consulta.';
        }
      } catch (e) {
        warning = warning ? `${warning} O fallback também está indisponível.` : e.message;
      }
    }
    if (!result?.books.length && warning) {
      const local = Object.values(catalog()).filter((b) =>
        normalize(
          type === 'author'
            ? b.authors.join(' ')
            : b.title + ' ' + b.authors.join(' ') + ' ' + b.isbn13.join(' '),
        ).includes(normalize(query)),
      );
      return {
        books: local,
        total: local.length,
        source: 'local',
        warning: `${warning} Exibindo somente correspondências já salvas neste navegador.`,
      };
    }
    const known = Object.values(catalog());
    const books = deduplicate(result?.books || []).map((b) => {
      const match = known.find((k) => sameBook(k, b));
      return match
        ? supplement(
            {
              ...b,
              id: match.id,
              openLibraryWorkId: match.openLibraryWorkId || b.openLibraryWorkId,
            },
            match,
          )
        : b;
    });
    cacheBooks(books);
    return { books, total: result?.total || 0, source, warning };
  },
  async details(id) {
    let book = getBook(id);
    if (!book) {
      if (/^OL\d+W$/.test(id)) book = { ...normalizeOL({ key: id }), title: '' };
      else if (/^google-[\w-]+$/.test(id)) book = await GoogleBooksService.details(id.slice(7));
      else throw new Error('Livro não encontrado. Procure uma obra no catálogo.');
    }
    if (book.detailsAt && Date.now() - book.detailsAt < SITE_CONFIG.cacheTTL) return book;
    let warning = '';
    try {
      if (book.openLibraryWorkId) book = await OpenLibraryService.details(book);
      else
        book = {
          ...book,
          ...(await GoogleBooksService.details(book.googleVolumeId)),
          detailsAt: Date.now(),
        };
    } catch (e) {
      warning = e.message;
    }
    if (!book.description || !book.coverUrl) {
      try {
        const isbn = book.isbn13?.[0] || book.isbn10?.[0];
        const found = await GoogleBooksService.search(
          isbn || `${book.title} ${book.authors?.[0] || ''}`,
          isbn ? 'isbn' : 'q',
        );
        const match = found.books.find((b) => sameBook(book, b));
        if (match) book = supplement(book, match);
      } catch {
        /* Metadados complementares são opcionais. */
      }
    }
    book = { ...book, warning };
    cacheBooks([book]);
    return book;
  },
};
