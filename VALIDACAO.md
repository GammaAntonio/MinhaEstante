# Validação da versão local

Verificado em 6 de outubro de 2026.

- Pasta `MinhaEstante` aberta no Microsoft Visual Studio Community 2026.
- Servidor estático respondeu HTTP 200 em `http://127.0.0.1:4173`.
- Verificação de sintaxe em todos os módulos JavaScript.
- 15 testes automatizados aprovados: criação de conta, login/logout, persistência e isolamento, notas, permissões, reset do administrador, URLs, parser, dados públicos, normalização, deduplicação, cache, fallback e erro de rede.
- Pelo navegador: login Antonio; busca real por **Dostoiévski** com resultados da Open Library; abertura de obra; estante Lidos; nota **4,5**; resenha salva; lista criada; duas obras adicionadas; ordem alterada e mantida após recarregar; diário manual salvo.
- Editor visual: parser reconheceu fundo preto, vinho, Georgia, blog, sidebar direita e ocultar estatísticas; configuração persistiu após recarregar.
- Editor avançado: base do layout atual exibida em prévia. JavaScript executado dentro do iframe comprovou **localStorage bloqueado**, **DOM principal bloqueado** e **ausência de senha em pageData**. Código de teste removido do rascunho; base salva e retorno ao editor visual verificado.
- Maria permaneceu sem livros, notas, resenhas, listas ou textos depois das alterações de Antonio.
- Admin mostrou contagens por conta; visualização da home de Maria preservou a sessão de administrador.
- Modo do zero salvo e renderizado com placeholders e componentes. Restauração da versão anterior retornou ao visual sem apagar os conteúdos. Confirmações usam diálogos internos acessíveis.
- Tela estreita de 390 px: largura de conteúdo igual à área visível, sem transbordamento horizontal; configuração de viewport restaurada após o teste.
- Ferramentas opcionais WebMCP registradas e testadas: busca e abertura de página com entradas válidas, além de busca vazia e página inexistente com falha controlada.

Limites: não há backend, sincronização entre dispositivos ou autenticação de produção. Google Books depende das cotas do serviço; o caminho de fallback foi testado com respostas controladas. As imagens e os metadados externos dependem dos provedores. O teste não constitui auditoria de segurança de produção.
# Inicialização no Microsoft Visual Studio

Álbuns e MP3 por álbum (06/10/2026): 23 testes automatizados passaram; build da solução Visual Studio terminou com código 0. No navegador, MusicBrainz retornou Ciano/Fresno (2006), com 14 faixas completas, e Nevermind/Nirvana (1991), com 12 faixas da edição selecionada. Capas reais carregaram pelo Cover Art Archive. Status Ouvido, nota 4,5 e favorito persistiram após reload. Resenha e lista de álbuns foram criadas; links pessoais carregam o usuário responsável pelo MP3.

MP3 sintético de 1,56 s enviado e salvo no álbum, persistindo em IndexedDB após reload. Com o áudio do perfil em repetição, abrir o álbum produziu `album.paused=false` e `background.paused=true`; ao terminar, `album.ended=true` e `background.paused=false`. O áudio do álbum não repete. A reprodução automática bloqueada pelo navegador exibe Ouvir. Ambos os uploads aceitam até 50 MB. O fallback iTunes, deduplicação/cache, múltiplos discos e isolamento entre livros/álbuns/contas foram verificados por testes com respostas controladas. Dados e MP3 continuam locais ao navegador.

Ao concluir, as referências aos áudios sintéticos foram removidas do perfil e do álbum. A busca real de livros por 1984/George Orwell retornou 279 obras pela Open Library. Resenha e lista estão identificadas como demonstração local.

MP3 por arquivo (06/10/2026): o campo de link foi substituído por Colocar arquivo MP3 (até 30 MB), com armazenamento do Blob no IndexedDB e referência individual no perfil. No navegador, um MP3 de silêncio gerado para teste foi enviado, salvo e reproduzido após recarregar (`paused=false`, duração 1,56 s, repetição ativada, fonte blob). A opção Não tocar música preservou o arquivo e eliminou o áudio da página. A seleção de teste foi removida ao terminar. O navegador precisa de um clique em Ouvir para iniciar o som.

Música (06/10/2026): aba Editar música adicionada com link direto de áudio, habilitação por perfil, repetição, teste e remoção. 18 testes automatizados passaram. No navegador, um WAV local de teste reproduziu com `paused=false`, `loop=true` e `controls=false`; o botão Pausar funcionou, o link persistiu após recarregar e o controle apareceu no perfil. O áudio temporário foi removido e a configuração voltou a ficar vazia. Não há extração de áudio do YouTube nem pesquisa de músicas. A disponibilidade de cada link externo depende do host do arquivo.

Verificação adicional em 06/10/2026: criada e aberta a solução `MinhaEstante.sln`, com o projeto Node.js `MinhaEstante.njsproj`. A validação via MSBuild terminou com código 0. O Visual Studio carregou o projeto e iniciou a depuração de `server.mjs` com o runtime Node local; o processo foi criado pelo `devenv.exe`. Após encerrar o servidor anterior, o novo servidor retornou HTTP 200 em `http://127.0.0.1:4173/`, com o documento MinhaEstante. O projeto mantém a mesma origem para preservar o LocalStorage. Abra a solução para usar F5.
