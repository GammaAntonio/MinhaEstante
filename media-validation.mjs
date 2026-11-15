import sharp from "sharp";

sharp.cache(false);
sharp.concurrency(1);

const imageFormats = {
  png: ["png", "image/png"],
  jpeg: ["jpg", "image/jpeg"],
  gif: ["gif", "image/gif"],
  webp: ["webp", "image/webp"],
};

export async function normalizeImage(bytes, declaredType) {
  if (!Object.values(imageFormats).some(([, type]) => type === declaredType)) return null;
  // Identify raster containers before handing bytes to libvips.
  const png = bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  const jpeg = bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"));
  const gif = /^GIF8[79]a$/.test(bytes.toString("ascii", 0, 6));
  const webp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!png && !jpeg && !gif && !webp) return null;
  try {
    const image = sharp(bytes, { animated: true, limitInputPixels: 8_000_000, failOn: "warning" });
    const { format, width, height, pages = 1 } = await image.metadata();
    const match = imageFormats[format];
    if (!match || match[1] !== declaredType || width > 4096 || height > 4096 || pages > 120) return null;
    const body = await image.timeout({ seconds: 8 }).toFormat(format).toBuffer();
    return { body, ext: match[0], type: match[1] };
  } catch {
    return null;
  }
}

const mpeg1Rates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const mpeg2Rates = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];

export function validateMp3(bytes) {
  let start = 0;
  if (bytes.toString("ascii", 0, 3) === "ID3") {
    if (bytes.length < 10 || bytes[3] < 2 || bytes[3] > 4 || bytes.subarray(6, 10).some(b => b > 127)) return false;
    start = 10 + bytes.subarray(6, 10).reduce((size, b) => size * 128 + b, 0);
    if (bytes[3] === 4 && (bytes[5] & 0x10)) start += 10;
  }
  let end = bytes.length;
  if (end >= 128 && bytes.toString("ascii", end - 128, end - 125) === "TAG") end -= 128;
  let frames = 0;
  while (start + 4 <= end) {
    const [a, b, c, d] = bytes.subarray(start, start + 4);
    const version = (b >> 3) & 3;
    const rateIndex = (c >> 2) & 3;
    const bitrate = (version === 3 ? mpeg1Rates : mpeg2Rates)[c >> 4];
    if (a !== 255 || (b & 0xe0) !== 0xe0 || (b & 6) !== 2 || version === 1 ||
        !bitrate || rateIndex === 3 || (d & 3) === 2) return false;
    const rate = [44100, 48000, 32000][rateIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
    start += Math.floor((version === 3 ? 144000 : 72000) * bitrate / rate) + ((c >> 1) & 1);
    frames++;
  }
  return frames >= 3 && start === end;
}
