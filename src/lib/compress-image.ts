// Client-side shrink to fit the attachment limit (KONZEPT §2.3 "Anhänge-UX-Trick").
// Tries WebP, falls back to JPEG where the browser cannot encode WebP (older Safari).
// Steps down quality first, then size, until the file fits.

const QUALITIES = [0.9, 0.8, 0.7, 0.6, 0.5];
const MAX_EDGE = 2560;

function load(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    img.src = url;
  });
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Returns the file unchanged if it already fits, otherwise a re-encoded WebP/JPEG ≤ maxBytes, or null. */
export async function shrinkImage(file: File, maxBytes: number): Promise<File | null> {
  const allowed = ["image/webp", "image/jpeg", "image/png"];
  if (file.size <= maxBytes && allowed.includes(file.type)) return file;

  const img = await load(file).catch(() => null);
  if (!img) return null;
  let scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const base = file.name.replace(/\.[^.]+$/, "") || "bild";

  for (let attempt = 0; attempt < 8; attempt++) {
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of QUALITIES) {
      let blob = await encode(canvas, "image/webp", q);
      if (blob && blob.type !== "image/webp") blob = await encode(canvas, "image/jpeg", q);
      if (blob && blob.size <= maxBytes) {
        const ext = blob.type === "image/webp" ? "webp" : "jpg";
        return new File([blob], `${base}.${ext}`, { type: blob.type });
      }
    }
    scale *= 0.75;
  }
  return null;
}
