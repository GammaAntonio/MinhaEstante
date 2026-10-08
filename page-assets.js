const MAX_PAGE_ASSET_BYTES = 8 * 1024 * 1024;
const ALLOWED_PAGE_ASSET_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

async function apiJSON(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {}
  if (!response.ok)
    throw new Error(payload?.error || `Falha no servidor (${response.status}).`);
  return payload;
}

export async function listPageAssets() {
  const payload = await apiJSON("/api/persistence/page-assets");
  return Array.isArray(payload?.assets) ? payload.assets : [];
}

export async function uploadPageAsset(file) {
  if (!(file instanceof File)) throw new Error("Escolha uma imagem.");
  if (file.size <= 0) throw new Error("A imagem está vazia.");
  if (file.size > MAX_PAGE_ASSET_BYTES)
    throw new Error("A imagem deve ter no máximo 8 MB.");
  if (!ALLOWED_PAGE_ASSET_TYPES.has(file.type))
    throw new Error("Use PNG, JPG, WEBP ou GIF. SVG não é aceito.");

  return apiJSON("/api/persistence/page-assets", {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "X-File-Name": encodeURIComponent(file.name || "imagem"),
    },
    body: file,
  });
}

export async function deletePageAsset(assetId) {
  const id = String(assetId || "").trim();
  if (!id) throw new Error("Imagem inválida.");
  return apiJSON(`/api/persistence/page-assets/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function copyPageAssetURL(url) {
  const value = String(url || "");
  if (!value) throw new Error("URL da imagem indisponível.");
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}
