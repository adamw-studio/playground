/** A decoded, size-capped bitmap that both the raster study and the tracer read from. */
export interface Source {
  id: string;
  name: string;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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

export function loadSourceUrl(url: string, name: string): Promise<Source> {
  return fromUrl(url, name);
}

export async function loadSourceFile(file: File): Promise<Source> {
  if (!ACCEPTED_TYPES.includes(file.type)) throw new Error(`Unsupported file type: ${file.type || 'unknown'}`);
  const url = URL.createObjectURL(file);
  try {
    return await fromUrl(url, file.name);
  } finally {
    URL.revokeObjectURL(url);
  }
}
