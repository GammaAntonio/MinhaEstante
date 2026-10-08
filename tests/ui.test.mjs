import test from "node:test";
import assert from "node:assert/strict";
import { bookCard } from "../ui.js";

class FakeNode {
  constructor(tag = "#text", text = "") {
    this.tagName = tag;
    this.textContent = text;
    this.children = [];
    this.attributes = {};
    this.className = "";
  }

  append(...children) {
    this.children.push(...children);
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  addEventListener() {}
}

globalThis.Node = FakeNode;
globalThis.document = {
  createElement: (tag) => new FakeNode(tag),
  createTextNode: (text) => new FakeNode("#text", text),
};

test("cards de álbum expõem classes estáveis para CSS personalizado", () => {
  const card = bookCard({
    id: "album-1",
    type: "album",
    title: "Ciano",
    authors: ["Fresno"],
  });

  assert.match(card.className, /\balbum-card\b/);
  const cover = card.children[0].children[0];
  const info = card.children[1];
  assert.match(cover.className, /\balbum-cover\b/);
  assert.match(info.children[0].className, /\balbum-title\b/);
  assert.match(info.children[1].className, /\balbum-artist\b/);
});
