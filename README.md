# MinhaEstante

Um catálogo compartilhado de livros e álbuns conectado a páginas pessoais com identidade própria. HTML5, CSS, JavaScript Vanilla, Fetch API e persistência em arquivos JSON pelo servidor Node. Sem frameworks ou build; o servidor também cuida de autenticação, contas, amizades, uploads e adapta as consultas ao MusicBrainz. Não há banco de dados remoto.

## Abrir no Microsoft Visual Studio

Abra a solução **`MinhaEstante.sln`** para usar o botão verde ▶ ou **F5**. O projeto Node.js incluído inicia o servidor estático e abre o site, sem instalar pacotes ou compilar a aplicação.

1. No Microsoft Visual Studio: **Arquivo → Abrir → Projeto/Solução** e escolha `MinhaEstante.sln`.
2. Edite `index.html`, `styles.css` e os módulos `.js` no Gerenciador de Soluções.
3. Pressione **F5** (ou ▶). O endereço é **http://127.0.0.1:4183/**.
4. Atualize o navegador depois de salvar os arquivos. **Shift+F5** para o servidor iniciado pelo depurador.

Se aparecer “Selecione um item de inicialização válido”, você está no modo de pasta: abra `MinhaEstante.sln` pelo menu acima. Caso haja mais de um projeto, clique com o botão direito em **MinhaEstante → Definir como Projeto de Inicialização**. O suporte Node.js do Visual Studio já está instalado neste computador, e o projeto localiza o Node instalado ou o runtime local do Codex automaticamente.

Como alternativa, abra **Exibir → Terminal** na pasta e execute `node server.mjs` com Node.js no PATH. Use somente um servidor na porta 4183: encerre o servidor manual antes de iniciar pelo Visual Studio.

Neste computador também há `iniciar.ps1`, que procura Node.js instalado ou o runtime local do Codex. Execute `.\iniciar.ps1` no PowerShell para iniciar o servidor e abrir o navegador. Ele não altera a política de execução do Windows nem instala programas. O servidor roda somente no computador local. Se o PowerShell bloquear scripts, use o comando `node server.mjs` ou outro servidor estático; não é necessário mudar a política de segurança.

Se Node não estiver no PATH, mas o runtime do Codex ainda estiver instalado, execute no terminal PowerShell:

```powershell
& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.mjs
```

**Visual Studio Code é outro programa.** Nele é possível usar a extensão Live Server sobre `index.html`; a configuração da porta está incluída em `.vscode/settings.json`. Qualquer servidor estático serve para os dois editores. Não abra `index.html` por `file://`, pois módulos JavaScript precisam de HTTP.

O `server.mjs` é o backend da aplicação nesta versão: autenticação, persistência, contas, amizades, uploads e proxy musical passam por ele. Com Node no PATH, `npm start` também funciona sem instalar pacotes. Use `Ctrl+C` para parar o servidor iniciado em primeiro plano.

## Música do perfil

Em **Editar minha página → Editar música → Colocar arquivo MP3**, escolha um MP3 do computador de até 50 MB, marque a repetição se desejar e salve. O arquivo fica guardado em `data/audio/` nesta instalação; o perfil guarda apenas a referência ao arquivo, sem colocar áudio em LocalStorage ou base64. Aparece somente o botão **Ouvir / Pausar**. **Não tocar música** desativa a reprodução sem apagar a seleção. O teste de música permite ouvir antes de salvar.

Cada perfil guarda sua própria música. A opção funciona também nos modos de código avançado, sem liberar o acesso do código pessoal ao armazenamento. O som para ao sair do perfil ou fechar a prévia. Contas antigas sem música continuam funcionando. Remover música altera o rascunho e só é aplicado após salvar.

## Contas e autenticação

Nenhuma senha em texto puro é enviada ao navegador nem fica dentro de `users.json`. O servidor guarda somente hashes `scrypt` em `data/auth.json`, que não é servido por HTTP. Login aceita nome de usuário ou e-mail e usa cookie de sessão `HttpOnly`.

O cadastro pede nome completo, nome de usuário, data de nascimento, cidade, e-mail, telefone, senha, confirmação e dica opcional. A idade mínima é 14 anos; nome de usuário e e-mail são únicos. Dados privados de cadastro ficam em `data/accounts.json`, separados das páginas públicas. A senha pode ser alterada somente por uma sessão autenticada; não existe recuperação de senha por e-mail nesta versão. Se a senha estiver errada e existir uma dica cadastrada, ela é devolvida ao formulário de login.

O e-mail simples de boas-vindas é opcional e não bloqueia o cadastro. Para habilitar o envio via Resend, configure as variáveis de ambiente `RESEND_API_KEY` e `WELCOME_FROM_EMAIL` antes de iniciar o servidor.

Amizades ficam em `data/friendships.json`. É possível enviar solicitação, aceitar, recusar, remover amizade e ver a lista de amigos no perfil e na rota `#/amigos`. Não existe chat ou mensagem privada.

## O que funciona

- Home pessoal, catálogo e navegação por hash.
- Busca real por título, autor, texto ou ISBN na Open Library, com paginação e cache de uma hora.
- Ficha de obra, descrição, assuntos, idiomas, ISBNs e amostra de até oito edições.
- Estantes, favoritos e notas de 0,5 a 5, incluindo meias estrelas.
- Resenhas com nota opcional, edição lida, edição do texto e exclusão.
- Listas com título, descrição, inclusão/remoção de obras e ordem manual persistida.
- Diário manual e posts, livros relacionados, imagem opcional e atividade automática separada.
- Páginas públicas dos usuários do navegador, temas, fontes, cores, texturas, sidebar e quatro estilos de mural.
- Quinze tipos de gadgets, ativação, ordem, texto livre, livro do mês e seleção de listas.
- Avatar, banner e imagem de gadget por URL ou upload reduzido com Canvas; badges por URL.
- Parser local de pedidos de aparência, com alterações propostas antes de aplicar; não utiliza IA.
- Editor avançado por seções, HTML/CSS/JS do zero, prévia isolada, versão anterior e restauração.
- Cadastro real, área Minha Conta, alteração de senha autenticada e dica de senha.
- Solicitações de amizade, lista de amigos e bloco social no perfil, sem chat ou mensagens privadas.

O catálogo e as páginas públicas são carregados do servidor desta instalação. O navegador mantém cache local para a interface, mas os dados persistentes ficam em `data/` no servidor.

## Organização

| Arquivo | Responsabilidade |
|---|---|
| `config.js` | Nome, subtítulo, cache e chave opcional do Google Books |
| `index.html` | Documento inicial e entrada do aplicativo |
| `styles.css` | Visual global, páginas pessoais, editores e responsividade |
| `app.js` | Telas, formulários, ações e navegação global |
| `router.js` | Rotas hash e proteção contra respostas de telas anteriores |
| `api.js` | `BookService`, Open Library, Google Books, normalização, deduplicação e cache |
| `storage.js` | Cache local, sessão, chamadas de conta/amizade e persistência dos dados da página |
| `data.js` | Contas iniciais, obras verificadas, temas, fontes e tipos de gadgets |
| `ui.js` | Construção de DOM, campos, capas, avisos, diálogos e validação de URLs |
| `personal.js` | Página pessoal, mural, gadgets e seleção de dados públicos |
| `editor.js` | Editor visual, parser local, imagens e controles avançados |
| `advanced.js` | Templates, componentes, documento isolado e ponte de navegação |
| `webmcp.js` | Navegação e busca estruturadas opcionais para navegadores compatíveis |
| `server.mjs` | Backend Node: autenticação, contas, amizades, persistência, uploads e arquivos estáticos |
| `tests/core.test.mjs` | Testes de dados, isolamento, URLs, busca, cache e fallback |

## LocalStorage

- `booksite_users`: contas e seus conteúdos separados por ID.
- `booksite_current_user`: apenas o ID da sessão simulada.
- `booksite_api_cache`: respostas públicas da API, com expiração de uma hora e limite de entradas.
- `booksite_catalog_cache`: obras normalizadas consultadas, necessárias para a biblioteca offline.
- `booksite_recent`: últimas obras consultadas.

A inicialização só cria as contas quando o armazenamento ainda não existe. Não apaga dados ao atualizar a página. Falhas de gravação mostram mensagem; não são reportadas como sucesso. O limite de armazenamento é definido pelo navegador. Use imagens pequenas. Limpar os dados do site apaga as contas e conteúdos locais. `localhost` e `127.0.0.1`, assim como portas diferentes, são origens distintas; mantenha o mesmo endereço para reencontrar seus dados.

## Catálogo e APIs

A interface usa somente o modelo normalizado de `BookService`. Um **Work** representa a obra e define sua rota (`OL…W`). Uma **Edition** representa uma publicação e aparece dentro da ficha; não ganha uma página duplicada a cada ISBN. Livros conhecidos apenas pelo Google têm ID `google-{volumeId}` até uma correspondência segura com uma obra.

Normalização reúne título, autores, descrição, datas, editoras, ISBNs, páginas, idiomas, assuntos e capa. A deduplicação compara Work, ISBN-13, ISBN-10 e título/autor normalizados. As capas usam Cover ID, OLID ou ISBN. Dados mínimos das obras de demonstração estão disponíveis sem rede; os detalhes reais são carregados ao abrir a obra.

- [Open Library Search API](https://openlibrary.org/dev/docs/api/search): fonte primária, campos explícitos e busca sob demanda, sem carregar milhares de obras.
- [Works e edições](https://openlibrary.org/dev/docs/api/books): endpoints `/works/{id}.json` e `/works/{id}/editions.json`.
- [Capas da Open Library](https://openlibrary.org/dev/docs/api/covers): tamanho M na grade e L na ficha. Falhas usam apresentação textual, sem ícone quebrado.
- [Google Books](https://developers.google.com/books/docs/v1/using): fallback quando a Open Library não encontra a busca, está indisponível ou faltam metadados. Complementos só são aceitos quando há correspondência de identidade.
- [DiceBear](https://www.dicebear.com/how-to-use/http-api/): avatar de iniciais por username; falhas preservam a letra em CSS.

`GOOGLE_BOOKS_API_KEY` em `config.js` está vazia. Open Library não depende dessa chave. O Google pode impor cotas ou exigir chave; sua indisponibilidade não impede o catálogo principal. Chaves de frontend são públicas, portanto restrinja uma eventual chave por origem e API no provedor. Não comite segredos.

As chamadas são serializadas e espaçadas; o cache evita repetição. A interface distingue carregamento, vazio, erro, fallback e resultados locais quando não há conexão. Títulos, traduções e capas dependem dos registros dos provedores; não há garantia de uma edição em português para cada obra.

## Personalização e gadgets

Use **editar minha página**. Alterações ficam em rascunho até salvar; a prévia não substitui a versão salva. Mural: grade, lista, compacto ou blog; seleção independente de livros, favoritos, textos, resenhas, listas e atividade. Abaixo de 760 px, a sidebar vai para baixo e as grades diminuem sem transformar o site em um aplicativo móvel.

Gadgets: sobre mim, lendo agora, estantes, favoritos, listas, resenhas, atividade, posts, tags, livro do mês, texto livre, imagem, links, badges e estatísticas. As setas mudam a ordem. Texto livre sempre é texto, nunca HTML. URLs aceitam somente HTTP/HTTPS; uploads aceitam PNG, JPEG, WebP ou GIF, até 5 MB, e são reduzidos para até 1200×800. GIF enviado é convertido para imagem estática; uma URL de GIF pode preservar animação.

Exemplo para o parser: `fundo preto, detalhes vinho, Georgia nos títulos, mural blog, sidebar na direita e esconder as estatísticas`. Regras não reconhecidas não são executadas.

Para adicionar um tema, crie uma entrada em `THEMES` em `data.js`. Para adicionar um gadget, inclua seu tipo em `GADGETS` e seu renderizador em `gadgetBody` de `personal.js`; acrescente os campos necessários no editor e uma migração para usuários existentes.

## Editar base

O segundo arquivo de requisitos amplia o primeiro: HTML/CSS/JS livres são permitidos **apenas no modo avançado isolado**.

- **Visual:** configurações e gadgets controlam a renderização.
- **Base:** parte da representação do layout atual; edite Geral, Header, Sidebar, Mural, Posts, Livros, Resenhas, Listas e Rodapé. Cada seção tem HTML/CSS/JS e restauração própria.
- **Do zero:** três campos para HTML, CSS e JavaScript, com confirmação antes de substituir o rascunho.

Somente um modo controla a página por vez. Voltar ao visual mantém o código como rascunho. Cada salvamento avançado guarda a versão anterior sem criar histórico recursivo. A rota `#/pagina/{username}/editar` sempre usa a interface fixa do aplicativo, mesmo quando o template da página quebra.

Os templates aceitam `{{user.displayName}}`, `{{user.bio}}`, `{{user.title}}`, `{{library}}`, `{{favorites}}`, `{{currentlyReading}}`, `{{recentReviews}}` e `{{content}}`. Componentes: `<book-currently-reading>`, `<book-favorites>`, `<book-reviews limit="5">`, `<book-lists>`, `<page-posts>` e `<page-activity>`, com suas tags de fechamento.

No iframe: `pageData.user`, `library`, `reading`, `favorites`, `reviews`, `lists`, `posts` e `activity`. `pageAPI` oferece funções de leitura que retornam cópias. Nunca inclui senha, role, ID de sessão ou dados privados de outras contas. `BASE_GALLERY` prepara a futura galeria de layouts sem implementá-la agora.

### Limite de isolamento

O iframe usa **somente `sandbox="allow-scripts"`**, sem `allow-same-origin`, formulários, popups ou navegação superior. Uma CSP interna bloqueia requisições Fetch, scripts externos, frames, plugins e formulários. Imagens e CSS inline são permitidos. Os dados entregues são públicos e copiados. Mensagens de navegação só são aceitas do iframe correto, com identificador de instância e lista restrita de rotas; não existe mensagem que escreva dados ou execute ações administrativas. Não há `eval` nem `new Function` no aplicativo.

Não remova o sandbox nem acrescente `allow-same-origin`. O isolamento de origem protege dados, mas código personalizado pode consumir recursos ou quebrar sua própria apresentação. Para uma versão pública, use origem separada para templates, limites de recursos, políticas no servidor e autorização real. O editor fixo permite recuperar a apresentação.

## Rotas

O catálogo agora tem **Livros / Álbuns**. Álbuns usam MusicBrainz (release-group como identidade e release para faixas), Cover Art Archive para capas e iTunes como fallback. As consultas são feitas ao enviar a busca, com cache e intervalo mínimo de 1,1 segundo. O pequeno adaptador em `music-proxy.mjs` identifica a aplicação no User-Agent exigido pelo MusicBrainz; execute pelo `server.mjs` ou pelo projeto do Visual Studio.

Rotas musicais: `#/albuns`, `#/album/{id}`, `#/colecao-albuns/{todos|ouvido|ouvindo|quero-ouvir|favoritos}`, `#/listas?media=albums`, `#/lista-albuns/{id}` e `#/resenhas?media=albums`. Notas gerais de 0,5 a 5, notas por faixa, favoritos, coleção, resenhas e listas ficam separados dos livros por usuário.

Dentro do álbum, **Editar música deste álbum → Colocar arquivo MP3** aceita até 50 MB. Salve o arquivo para associá-lo ao seu perfil naquele álbum. Links vindos da página pessoal levam `?user={username}` para reproduzir o MP3 daquela pessoa. O áudio do álbum pausa o do perfil e o retoma ao terminar, pausar ou sair do álbum. Se o navegador bloquear reprodução automática, pressione **Ouvir**. Arquivos ficam em `data/audio/` e a referência fica nos dados desta instalação. Ao copiar o projeto inteiro, incluindo `data/`, os MP3 associados acompanham a instalação.

Templates avançados também recebem `pageData.albums`, `favoriteAlbums`, `currentlyListening`, `albumReviews` e `albumLists`, além dos placeholders `{{favoriteAlbums}}`, `{{recentAlbums}}`, `{{currentlyListening}}` e `{{albumContent}}`. Bases novas incluem o conteúdo musical; bases já personalizadas podem inserir `{{albumContent}}` no Mural.

`#/home`, `#/login`, `#/criar-pagina`, `#/conta`, `#/amigos`, `#/livros`, `#/albuns`, `#/livro/{id}`, `#/album/{id}`, `#/pagina/{username}`, `#/pagina/{username}?media=albums`, `#/pagina/{username}/editar`, `#/listas`, `#/lista/{id}`, `#/diario`, `#/resenhas`, `#/estante/{todos|lidos|lendo|quero-ler|favoritos|abandonados}`, `#/colecao-albuns/{todos|ouvido|ouvindo|quero-ouvir|favoritos}`, `#/admin`.

Listas, diário, resenhas e estantes podem receber `?user=antonio` para mostrar outro leitor. `#/admin?view=maria` exibe a home dela sem alterar a sessão do administrador.

## Testes

```text
node --test tests/*.test.mjs
```

Não exigem instalar dependências e usam armazenamento em memória, separado do navegador. O relatório `VALIDACAO.md` registra também o fluxo testado no navegador. O fallback é verificado com respostas controladas, pois quotas e disponibilidade externas variam.

## Próximas integrações, sem reescrever o visual

A autenticação local já é feita pelo servidor com `scrypt`, cookie `HttpOnly` e autorização das gravações. Uma evolução futura pode mover os dados para um banco SQL e os uploads para armazenamento dedicado sem alterar o visual da aplicação. Mantenha o ID estável das obras e álbuns durante essa migração.

## Livros e Álbuns em áreas separadas

A interface agora trata as duas mídias como páginas irmãs:

- `#/livros` — catálogo de livros (Open Library + Google Books fallback).
- `#/albuns` — catálogo de álbuns (MusicBrainz + Cover Art Archive + iTunes fallback).
- `#/colecao-albuns` — coleção pessoal de álbuns.

Os atalhos **Livros / Álbuns** fazem navegação real entre as páginas, em vez de trocar apenas um filtro dentro do mesmo catálogo. As rotas antigas de catálogo continuam aceitas como compatibilidade.

Clicar em capa ou título de livro/álbum abre uma janela de detalhes sem tirar o usuário da página atual. O modal de álbum mantém capa, player local já existente, nota geral, resenha, versões e tracklist. Cada faixa pode receber nota própria de 0,5 a 5; essas notas ficam em `user.albums.trackRatings` e não alteram automaticamente a nota geral do disco.

## Aparência independente por mídia

Cada página pessoal mantém duas configurações em `page.mediaPages`:

- `page.mediaPages.books`
- `page.mediaPages.albums`

O editor mostra **Livros / Álbuns** no topo. Título da página, subtítulo, bio, imagens, paleta, fontes, mural, gadgets e código avançado podem ser diferentes. O botão de padronização copia apenas apresentação/configuração, nunca livros, álbuns, notas, resenhas ou listas.

O formato antigo (`page.customization`, `page.gadgets`, `page.customCode` etc.) é preservado como espelho da configuração de Livros para compatibilidade. Na inicialização, dados anteriores são migrados sem apagar conteúdo do usuário.
