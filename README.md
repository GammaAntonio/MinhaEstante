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

## Persistência PostgreSQL

O servidor usa PostgreSQL via pg. Execute npm ci, configure DATABASE_URL ou as variáveis PGHOST, PGPORT, PGDATABASE e PGUSER e inicialize o banco antes de npm start. Node pode carregar um arquivo privado com node --env-file=.env server.mjs. Os arquivos de mídia continuam em data/audio e data/page-assets. MINHAESTANTE_DATA_DIR pode apontar para um diretório de mídia separado em um teste.

Em bancos já migrados, aplique `database/migrations/003-auth-sessions.sql` em uma transação como proprietário do esquema antes de iniciar o servidor atualizado. Conceda SELECT, INSERT e DELETE sobre `auth_sessions` ao papel da aplicação. A atualização autentica sessões por tokens opacos de 30 dias e pede um novo login aos usuários que ainda têm o cookie assinado antigo. Sair revoga a sessão atual. A troca de senha confirma a senha atual e encerra as demais sessões. Em produção, o backend usa o protocolo e o IP encaminhados pelo Caddy, que deve substituir cabeçalhos de encaminhamento de clientes não confiáveis. Mantenha o Node acessível apenas na interface local.

Aplique também 004 e 005 na mesma parada de manutenção. A 004 atribui imagens antigas ao dono do diretório e MP3 antigos ao único perfil ou acervo que os referencia. Um MP3 sem atribuição inequívoca continua disponível e conta no limite da instância. A 005 adiciona restauração de senhas, visibilidade de amizades e solicitações de exclusão. Conceda SELECT, INSERT, UPDATE e DELETE em `password_resets`, SELECT, INSERT e UPDATE em `account_privacy`, e SELECT e INSERT em `account_deletion_requests`. A aplicação não precisa ser proprietária dessas tabelas.

Em um banco vazio, execute node scripts/migrate-json-to-postgres.mjs /caminho/data --dry-run. Depois rode o mesmo comando sem --dry-run e execute node scripts/verify-migration.mjs /caminho/data antes de abrir o serviço para gravações. O verificador reconstrói os quatro conjuntos de registros, compara por valor e confere o inventário de mídias. Uma repetição com os mesmos registros apenas confirma a paridade. Uma origem divergente interrompe a operação.

No DBeaver, escolha PostgreSQL, host do banco 127.0.0.1 e porta 5432. Ative SSH com host 147.15.126.191, porta 22, usuário opc e a chave SSH existente. Use um papel próprio somente leitura para inspeção. As credenciais devem ficar no gerenciador local do DBeaver.

A rotina scripts/backup-database.sh gera dump, arquivos de mídia e checksums. Configure PGDATABASE, MEDIA_DIR, BACKUP_DIR e OFFSITE_DIR montado em armazenamento independente. Passe explicitamente ao script os arquivos da unit, credenciais protegidas e Caddy para incluí-los. Agende a rotina só após testar a restauração em ambiente separado. scripts/restore-database.sh recebe a pasta do backup e um diretório novo para os arquivos, e exige um banco vazio.

Durante corte ou retorno, pare a aplicação para impedir gravações concorrentes. Se o PostgreSQL já recebeu gravações públicas, use a versão anterior compatível com PostgreSQL ou exporte e reconcilie os dados antes de voltar ao backend JSON. O snapshot JSON anterior ao corte serve para recuperar uma implantação que ainda não recebeu tráfego de escrita.

## Dados da conta e recuperação da página

Em **Minha conta**, use **Baixar meus dados (JSON)** para exportar o cadastro, o perfil, as relações de amizade e o inventário das imagens da página. Os binários de mídia são servidos à parte. Cidade e telefone são opcionais. Novos perfis usam o nome de usuário como nome público inicial e o titular pode alterar a apresentação no editor.

Em páginas com HTML, CSS e JavaScript personalizados, **Abrir sem código personalizado** renderiza o perfil pelo editor visual. É possível acessar esse modo diretamente com `?seguro=1` ou `?media=albums&seguro=1`. O conteúdo salvo fica disponível para edição, prévia e restauração pelo titular.

O iframe aceita scripts do perfil em origem opaca. Popups, formulários e chamadas de API ficam bloqueados. As imagens podem usar uploads da própria aplicação, dados embutidos ou os provedores de catálogo declarados no código. Uma imagem de outro host pode ser enviada pelo editor. Use links externos nos controles confiáveis do perfil.

Em **Minha conta**, a opção de ocultar amizades retira esse vínculo da visão pública dos dois perfis. Cada participante ainda vê seus próprios vínculos. Solicitações de exclusão exigem a senha atual e ficam registradas em `account_deletion_requests` para tratamento pelo operador, inclusive nas cópias e mídias associadas.

Configure `PASSWORD_RESET_ORIGIN` com o endereço HTTPS oficial e forneça `RESEND_API_KEY` e `WELCOME_FROM_EMAIL` por arquivo de ambiente protegido ou credencial de serviço. O remetente precisa estar verificado no provedor. Sem essas configurações a interface informa que o envio está indisponível. Links expiram em 30 minutos, são de uso único e a redefinição encerra as sessões da conta.

O painel **Armazenamento** mostra o inventário atribuído à conta por tipo. Os limites padrão são 5 MiB por imagem, 50 MiB por MP3, 100 MiB em imagens, 300 imagens, 20 MP3 e 500 MiB por conta. A instância tem limite total de 512 MiB e reserva 3 GiB livres no disco. Os limites de contagem e os totais são configuráveis por `MEDIA_AUDIO_COUNT`, `MEDIA_IMAGE_COUNT`, `MEDIA_IMAGES_MIB`, `MEDIA_ACCOUNT_MIB` e `MEDIA_INSTANCE_MIB`. O servidor processa um upload por vez. Arquivos antigos permanecem disponíveis.
