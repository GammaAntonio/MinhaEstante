// Validação de assinatura compartilhada pelo navegador e pelo servidor.
// MIME é apenas metadado: não substitui a extensão e os bytes do arquivo.
export function hasMP3Signature(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33)
    return true;
  if (bytes.length < 4) return false;
  const version = (bytes[1] >> 3) & 3;
  const layer = (bytes[1] >> 1) & 3;
  const bitrate = bytes[2] >> 4;
  const sampleRate = (bytes[2] >> 2) & 3;
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 &&
    version !== 1 && layer === 1 && bitrate !== 15 && sampleRate !== 3 &&
    (bytes[3] & 3) !== 2;
}
