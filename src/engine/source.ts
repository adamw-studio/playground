/** A decoded, size-capped bitmap that both the raster study and the tracer read from. */
export interface Source {
  id: string;
  name: string;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

const HEIC_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'];
const WEB_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** For the file picker. Extensions are listed too: browsers often report HEIC with an empty type. */
export const ACCEPT = [...WEB_TYPES, ...HEIC_TYPES, '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'].join(',');

const isHeic = (file: File) => HEIC_TYPES.includes(file.type) || /\.hei[cf]$/i.test(file.name);

export const isSupportedImage = (file: File) => WEB_TYPES.includes(file.type) || isHeic(file);

/** Long-side cap: keeps phone photos responsive while staying well above screen resolution. */
const MAX_SIDE = 2800;

let counter = 0;

async function fromUrl(url: string, name: string): Promise<Source> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const k = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * k));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * k));
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { id: `src-${++counter}`, name, canvas, width: canvas.width, height: canvas.height };
}

async function fromBlob(blob: Blob, name: string): Promise<Source> {
  const url = URL.createObjectURL(blob);
  try {
    return await fromUrl(url, name);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function loadSourceUrl(url: string, name: string): Promise<Source> {
  return fromUrl(url, name);
}

/**
 * Loads JPG, PNG, WebP or HEIC/HEIF. HEIC uses the browser's own decoder where there is one
 * (Safari); elsewhere a WebAssembly decoder is fetched on first use and converts it to JPEG.
 */
export async function loadSourceFile(file: File): Promise<Source> {
  if (!isSupportedImage(file)) throw new Error(`Unsupported file type: ${file.type || file.name}`);
  if (!isHeic(file)) return fromBlob(file, file.name);
  try {
    return await fromBlob(file, file.name);
  } catch {
    const { heicTo } = await import('heic-to');
    return fromBlob(await heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 }), file.name);
  }
}
