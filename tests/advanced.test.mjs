import test from "node:test";
import assert from "node:assert/strict";
import {
  openMediaMessageDetail,
  upgradeLegacyGeneralHtml,
  isLegacyDefaultHeader,
  isLegacyManagedWallHtml,
} from "../advanced.js";
import { readFile } from "node:fs/promises";

const nonce = "frame-nonce";
const message = (overrides = {}) => ({
  channel: "booksite-page",
  nonce,
  type: "booksite:openmedia",
  mediaType: "album",
  id: "album-123",
  username: "antonio",
  ...overrides,
});

test("ponte avançada aceita somente mensagens válidas de livro ou álbum", () => {
  assert.deepEqual(openMediaMessageDetail(message(), nonce), {
    type: "album",
    id: "album-123",
    username: "antonio",
  });
  assert.deepEqual(
    openMediaMessageDetail(
      message({ mediaType: "book", id: "OL8126317W", username: undefined }),
      nonce,
    ),
    { type: "book", id: "OL8126317W", username: "" },
  );
});

test("ponte avançada rejeita origem lógica, nonce e dados incompatíveis", () => {
  assert.equal(openMediaMessageDetail(null, nonce), null);
  assert.equal(openMediaMessageDetail(message({ channel: "outro" }), nonce), null);
  assert.equal(openMediaMessageDetail(message({ nonce: "incorreto" }), nonce), null);
  assert.equal(openMediaMessageDetail(message({ type: "navigate" }), nonce), null);
  assert.equal(openMediaMessageDetail(message({ mediaType: "video" }), nonce), null);
  assert.equal(openMediaMessageDetail(message({ id: "" }), nonce), null);
  assert.equal(openMediaMessageDetail(message({ username: { admin: true } }), nonce), null);
});

test("Geral antigo vira dinâmico sem apagar HTML manual", () => {
  const legacyGeneral = `<div class="personal-wrap pattern-textured" style="--primary:#324e37;--secondary:#202f69;--link:#202f69;--outside:#324e37;--page:#000000;--panel:#202f69;--text:#ffffff;--font:'Tahoma';--heading:'Georgia';--side-width:200px;position:relative">
  <div class="pepsi-rain"><img src="/pepsi.png"></div>
  <article class="personal">
    {{header}}
    <div class="personal-layout left">{{sidebar}}{{wall}}</div>
    {{footer}}
  </article>
</div>`;

  const upgraded = upgradeLegacyGeneralHtml(legacyGeneral);
  assert.match(upgraded, /pattern-\{\{backgroundPattern\}\}/);
  assert.match(upgraded, /style="\{\{defaultThemeStyle\}\};position:relative"/);
  assert.match(upgraded, /personal-layout \{\{sidebarPosition\}\}/);
  assert.match(upgraded, /pepsi-rain/);
  assert.match(upgraded, /\/pepsi\.png/);
});

test("Header padrão antigo é reconhecido", () => {
  assert.equal(
    isLegacyDefaultHeader(
      '<header class="personal-header left has-banner"><img src="data:image/webp;base64,abc" class="personal-banner"><div class="personal-header-content"><h1>discoteca</h1><p>subtitulo</p></div></header>',
    ),
    true,
  );
});

test("Header customizado não é tratado como padrão", () => {
  assert.equal(
    isLegacyDefaultHeader(
      '<header class="personal-header left meu-header"><div class="personal-header-content"><h1>{{user.title}}</h1><p>{{user.subtitle}}</p></div><span>custom</span></header>',
    ),
    false,
  );
});

test("Wall padrão antigo é reconhecido", () => {
  assert.equal(
    isLegacyManagedWallHtml(
      '<main class="personal-wall">{{books}}\n{{posts}}\n{{favorites}}\n{{activity}}</main>',
    ),
    true,
  );
});

test("Wall customizado é preservado", () => {
  assert.equal(
    isLegacyManagedWallHtml(
      '<main class="personal-wall"><div class="meu-bloco">oi</div>{{books}}</main>',
    ),
    false,
  );
});

test("base padrão usa tokens dinâmicos nas configurações do sistema", async () => {
  const source = await readFile(new URL("../advanced.js", import.meta.url), "utf8");
  assert.match(source, /pattern-\{\{backgroundPattern\}\}/);
  assert.match(source, /style="\{\{defaultThemeStyle\}\}"/);
  assert.match(source, /personal-layout \{\{sidebarPosition\}\}/);
  assert.match(source, /header:\s*baseSection\("\{\{defaultHeader\}\}"\)/);
  assert.doesNotMatch(source, /pattern-\$\{c\.backgroundPattern\}/);
  assert.doesNotMatch(source, /style="\$\{themeStyle\(user\)\}"/);
  assert.doesNotMatch(source, /personal-layout \$\{c\.sidebarPosition\}/);
});

test("base padrão não duplica conteúdo de álbuns no mural", async () => {
  const source = await readFile(new URL("../advanced.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\$\{wall\.join\("\\n"\)\}\\n\{\{albumContent\}\}/);
  assert.match(source, /`<main class="personal-wall">\\n\$\{wall\.join\("\\n"\)\}\\n<\/main>`/);
});
