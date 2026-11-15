# MinhaEstante

## Direção visual

O MinhaEstante é uma biblioteca e discoteca pessoal. Delicious Library 2 é a referência principal. A prévia recebeu o Apple Design Award em 2007, e o produto foi lançado em 2008.

O centro da página é a estante. Capas e metadados identificam os itens. À esquerda ficam departamentos e autores. À direita, a ficha acompanha o foco ou a passagem do cursor e oferece acesso ao registro completo. No catálogo, Estante favorece reconhecimento visual, Lista favorece leitura rápida e Cover Flow oferece exploração em perspectiva sob demanda.

Papel marfim, tinta vinho, réguas finas e títulos serifados definem o catálogo. A prateleira é uma linha de apoio. A madeira histórica inspira a ideia de organizar objetos por fileira. Superfícies escuras ficam concentradas no reprodutor e no Cover Flow.

## Pesquisa de referência

| Referência | Observação e aplicação |
| --- | --- |
| [Delicious Library, Ars Technica, 2004](https://arstechnica.com/gadgets/2004/11/delicious-library/) e [prévia de Delicious Library 2, AppleInsider, 2008](https://appleinsider.com/articles/08/03/03/exclusive_preview_delicious_monsters_delicious_library_2_0) | A coleção ganha forma pelo agrupamento de objetos reconhecíveis. O navegador de coleções, a área de capas e a ficha têm funções próprias. A captura de uso [de 2009](https://raul7.hatenadiary.org/entry/20090925/1253898809) mostra essa divisão com clareza. |
| [Barnes & Noble, 2005](https://www.webdesignmuseum.org/gallery/barnes-noble-in-2005), [comparação de 2007](https://blog.v3.russellheimlich.com/two-website-makeovers-barnes-noble-and-newsweek/) e [Boxes and Arrows, 2002](https://boxesandarrows.com/the-evolving-homepage-the-growth-of-three-booksellers/) | A comparação visual separa a vitrine editorial, a busca e os departamentos. Na web, a entrada do acervo pode orientar tanto a busca direta quanto a descoberta por capas. |
| [Fnac, arquivo de 2008](https://web.archive.org/web/2008*/www.fnac.com/) | Referência de curadoria cultural indicada no briefing. As capturas do arquivo não foram confirmadas visualmente. |
| [LibraryThing, abril de 2009](https://blog.librarything.com/2009/04/), [WIRED, 2010](https://www.wired.com/2010/01/catalog-your-books-online/), [Shelfari, 2007](https://techcrunch.com/2007/01/18/keep-an-eye-on-shelfari/) e [Open Library](https://openlibrary.org/dev/docs/ui) | A estante visual e o catálogo resolvem tarefas complementares. A ficha mantém autoria, primeira publicação, registros de edição e os vínculos com o acervo pessoal. A documentação da Open Library pode mudar, então funciona como referência funcional. |
| [Skoob, arquivo de 2009](https://web.archive.org/web/2009*/www.skoob.com.br/) e [Estante Virtual, arquivo de 2009](https://web.archive.org/web/2009*/www.estantevirtual.com.br/) | Referências brasileiras de pertencimento e descoberta. A inspeção dos índices não confirmou capturas históricas renderizadas. |
| [iTunes](https://www.webdesignmuseum.org/exhibitions/itunes-website) e [manual de canais do Wii](https://csassets.nintendo.com/noaext/image/private/t_KA_PDF/WiiChEng?_a=DATAg1AAZAA0) | A discoteca reúne reprodução e exploração. O movimento indica seleção, abertura ou troca de área. Teclado e movimento reduzido têm caminhos equivalentes. |

## Comportamento

O player preserva a visualização dentro da janela de reprodução. O Cover Flow abre sob demanda, preserva navegação por setas e permite abrir a ficha. Fotografias publicadas mantêm ampliação e varal interativo. Perfis continuam usando suas configurações pessoais. Capas indisponíveis usam a apresentação textual do registro.

## Portal e perfis

O catálogo editorial pertence à plataforma. O perfil reúne identidade, acervo e aparência do dono. Fotografias ornamentais e o varal pertencem ao contexto pessoal. Adesivos decoram uma região do cabeçalho em coordenadas relativas, com ponteiro transparente na publicação.

O perfil abriga o reprodutor quadrado em Ouvindo agora. O status de coleção aparece separado. Os presets analisam a faixa local por AnalyserNode e usam Canvas 2D. Fontes sem análise recebem indicação de ambiente. Movimento de navegação usa a articulação de um livro, o deslocamento lateral de uma caixa e a aproximação de um canal.

## Referências de interação e acabamento

- A lombada e a abertura discreta da capa nas vistas de catálogo seguem a ideia do [Perspective Book](https://spell.sh/docs/perspective-book). O recorte quadrado e a separação entre visual e transporte dialogam com o [Spotify Card do Spell UI](https://spell.sh/docs/spotify-card).
- O arraste horizontal do Cover Flow usa o foco em uma capa como na [Circular Gallery](https://reactbits.dev/components/circular-gallery). A navegação mantém setas, toque e links. A implementação é original em CSS e JavaScript Vanilla. A licença do React Bits inclui Commons Clause. [Repositório e licença](https://github.com/DavidHDev/react-bits)
- [Refero](https://styles.refero.design/) e [Inspora](https://www.inspora.design/websites) servem como referência de hierarquia editorial e da relação entre catálogo, fotografia e tipografia. Os tons, a densidade e o acervo continuam sendo os do MinhaEstante.
- Flip e Draggable oferecem continuidade e controle de arraste. O Cover Flow preserva seus elementos e atualiza as transformações CSS das capas existentes. [GSAP Flip](https://gsap.com/docs/v3/Plugins/Flip/) · [GSAP Draggable](https://gsap.com/docs/v3/Plugins/Draggable/)
- O scroll nativo mantém o mesmo comportamento entre catálogo, perfil e modal. A interação só faz sentido no seletor de capas, então Lenis não foi incorporado. [Lenis](https://lenis.dev/)
