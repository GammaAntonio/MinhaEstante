import { BookService } from './api.js';
import { userByName } from './storage.js';
import { navigate } from './router.js';

// Integração opcional. Navegadores sem WebMCP continuam usando a interface normal.
function showRoute(path) {
  return new Promise((resolve) => {
    window.addEventListener(
      'hashchange',
      () => requestAnimationFrame(() => requestAnimationFrame(resolve)),
      { once: true },
    );
    navigate(path);
  });
}
export function registerBookTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  const definitions = [
    {
      name: 'search_books',
      title: 'Pesquisar livros',
      description:
        'Pesquisa o catálogo compartilhado e abre os resultados na interface. Usa Open Library primeiro e o mesmo cache da busca visual. Não altera a biblioteca pessoal.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', minLength: 1, maxLength: 200 },
          type: { type: 'string', enum: ['q', 'title', 'author', 'isbn'] },
        },
        required: ['query'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input) {
        if (
          !input ||
          typeof input.query !== 'string' ||
          !input.query.trim() ||
          input.query.length > 200 ||
          (input.type && !['q', 'title', 'author', 'isbn'].includes(input.type))
        )
          throw new Error('Informe uma busca de 1 a 200 caracteres e um tipo válido.');
        const query = input.query.trim(),
          type = input.type || 'q',
          result = await BookService.search(query, type);
        await showRoute(`/livros?q=${encodeURIComponent(query)}&type=${type}`);
        return {
          source: result.source,
          total: result.total,
          warning: result.warning || '',
          books: result.books.map((b) => ({ id: b.id, title: b.title, authors: b.authors })),
        };
      },
    },
    {
      name: 'open_personal_page',
      title: 'Visitar página pessoal',
      description:
        'Abre uma página pessoal existente. Apenas navega; não altera dados, sessão ou personalização.',
      inputSchema: {
        type: 'object',
        properties: { username: { type: 'string', pattern: '^[a-z0-9_-]{3,30}$' } },
        required: ['username'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input) {
        if (
          !input ||
          typeof input.username !== 'string' ||
          !/^[a-z0-9_-]{3,30}$/.test(input.username)
        )
          throw new Error('Username inválido.');
        const user = userByName(input.username);
        if (!user) throw new Error('Página não encontrada.');
        await showRoute(`/pagina/${user.username}`);
        return { username: user.username, title: user.page.title };
      },
    },
  ];
  for (const tool of definitions) {
    try {
      Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {});
    } catch {
      /* Recurso experimental e inteiramente opcional. */
    }
  }
}
