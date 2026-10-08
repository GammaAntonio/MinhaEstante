import test from "node:test";
import assert from "node:assert/strict";
import { audioURL, DEFAULT_MUSIC, uploadMP3 } from "../music.js";
import { blankUser } from "../data.js";
const mp3 = () => new File(['ID3test'], 'musica.mp3', { type: 'audio/mpeg' });
test('aceita ID3 e MPEG Layer III com MIME variável; rejeita cabeçalhos incompatíveis', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    fileId: 'server:12345678-1234-1234-1234-123456789abc',
  }));
  for (const type of ['audio/mpeg', 'audio/mp3', 'application/octet-stream', '']) {
    for (const header of [[0x49, 0x44, 0x33, 4], [0xff, 0xfb, 0x90, 0],
      [0xff, 0xf3, 0x80, 0], [0xff, 0xe3, 0x80, 0], [0xff, 0xfa, 0, 0]]) {
      const result = await uploadMP3(new File([new Uint8Array(header)], 'audio.MP3', { type }));
      assert.match(result.fileId, /^server:/);
    }
  }
  for (const header of [[0xff, 0xfb], [0xff, 0xeb, 0x90, 0],
    [0xff, 0xf9, 0x90, 0], [0xff, 0xfb, 0xf0, 0], [0xff, 0xfb, 0x9c, 0],
    [0xff, 0xfb, 0x90, 2], [0xff, 0xf1, 0x50, 0],
    [0x52, 0x49, 0x46, 0x46], [0x4f, 0x67, 0x67, 0x53], [0x50, 0x4b, 3, 4]]) {
    await assert.rejects(uploadMP3(new File([new Uint8Array(header)], 'falso.mp3', {
      type: 'audio/mpeg',
    })), /válido/);
  }
});

test('upload exige confirmação persistente e nunca acessa armazenamento do navegador', async (t) => {
  let localAccesses = 0;
  const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, get() {
    localAccesses++;
    throw new Error('IndexedDB proibido no upload');
  } });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'indexedDB', original);
    else delete globalThis.indexedDB;
  });
  const fetchMock = t.mock.method(globalThis, 'fetch');
  for (const response of [
    () => { throw new TypeError('Failed to fetch'); },
    () => new Response('{}', { status: 500 }),
    () => new Response('<html>erro</html>'),
    () => Response.json({ fileId: 'local-id' }),
    () => Response.json({ fileId: 'blob:http://localhost/audio' }),
  ]) {
    fetchMock.mock.mockImplementation(response);
    const music = { ...DEFAULT_MUSIC, fileId: 'server:old', fileName: 'anterior.mp3' };
    const before = structuredClone(music);
    await assert.rejects(async () => Object.assign(music, await uploadMP3(mp3())), /Não foi possível salvar o MP3/);
    assert.deepEqual(music, before);
  }
  const fileId = 'server:12345678-1234-1234-1234-123456789abc';
  fetchMock.mock.mockImplementation(async (url, options) => {
    assert.equal(url, '/api/persistence/audio');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'audio/mpeg');
    assert.equal(await options.body.text(), 'ID3test');
    return Response.json({ fileId, fileName: 'musica.mp3', url: 'blob:unwanted', extra: 'ignored' });
  });
  assert.deepEqual(await uploadMP3(mp3()), { fileId, fileName: 'musica.mp3' });
  assert.equal(localAccesses, 0);
});

test('envio rejeita arquivo que não é MP3 e arquivos acima do limite', async () => {
  await assert.rejects(uploadMP3({ name: 'video.mp4', size: 100 }), /MP3/);
  await assert.rejects(uploadMP3({ name: 'musica.mp3', size: 55 * 1024 * 1024 + 1 }), /55 MB/);
  await assert.rejects(uploadMP3({ name: 'falso.mp3', size: 3, slice: () => new Blob(['abc']) }), /válido/);
});

test("aceita áudio HTTP(S), inclusive URLs assinadas, sem executar protocolos ativos", () => {
  assert.equal(
    audioURL(" https://example.com/song.mp3?token=demo "),
    "https://example.com/song.mp3?token=demo",
  );
  assert.equal(
    audioURL("https://example.com/audio/123"),
    "https://example.com/audio/123",
  );
  for (const url of [
    "",
    "javascript:alert(1)",
    "data:audio/mp3;base64,AA",
    "file:///song.mp3",
    "https://user:secret@example.com/song.mp3",
  ])
    assert.equal(audioURL(url), null);
});
test("explica e rejeita links do YouTube que não fornecem áudio direto", () => {
  for (const url of [
    "https://youtu.be/abcdefghijk",
    "https://www.youtube.com/watch?v=abcdefghijk",
    "https://music.youtube.com/watch?v=abcdefghijk",
    "https://www.youtube-nocookie.com/embed/abcdefghijk",
  ])
    assert.equal(audioURL(url), null);
});
test("novos perfis começam sem música e não compartilham configurações", () => {
  const a = blankUser("A", "a");
  const b = blankUser("B", "b");
  assert.deepEqual(a.page.music, DEFAULT_MUSIC);
  a.page.music.url = "https://example.com/a.mp3";
  a.page.music.enabled = true;
  assert.deepEqual(b.page.music, DEFAULT_MUSIC);
});
