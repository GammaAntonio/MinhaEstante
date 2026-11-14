export const MAX_STICKERS = 24;
const icon = /^(pixelarticons|openmoji):[a-z0-9]+(?:-[a-z0-9]+)*$/;
const asset = /^\/api\/persistence\/page-assets\/file\/[A-Za-z0-9_-]{1,100}\/[a-f0-9-]{36}\.(png|jpg|webp|gif)$/i;
export function cleanStickers(values) {
  if (!Array.isArray(values)) return [];
  const bounded = (n, min, max, fallback) => Number.isFinite(n) ? Math.min(max, Math.max(min,n)) : fallback;
  return values.slice(0, MAX_STICKERS).filter(v => v && typeof v.src === "string" &&
    v.src.length <= 120 && (icon.test(v.src) || asset.test(v.src))).map(v => ({
    src: v.src, x: bounded(v.x,0,100,50), y: bounded(v.y,0,100,50),
    size: bounded(v.size,4,35,15), angle: bounded(v.angle,-180,180,0),
    opacity: bounded(v.opacity,0.15,1,1), locked: v.locked === true,
    attribution: v.src.startsWith("openmoji:") ? "OpenMoji · CC BY-SA 4.0" :
      v.src.startsWith("pixelarticons:") ? "Pixelarticons · MIT" : "",
  }));
}
