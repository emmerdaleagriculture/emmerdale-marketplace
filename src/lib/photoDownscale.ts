/**
 * Client-side photo downscaling: phone camera JPEGs run 3–8MB; contractors
 * need to see a gateway, not print a poster. Resize to max 1600px and
 * re-encode as JPEG before upload so two photos cost ~1MB of upload on rural
 * mobile signal instead of ~10.
 *
 * Any failure (HEIC the browser can't decode, canvas quirks) returns the
 * original file untouched — a worse upload beats a lost photo.
 *
 * Decoding goes through an <img>, not createImageBitmap: on iOS Safari,
 * createImageBitmap can resolve with a 1×1 bitmap instead of rejecting when
 * it runs short of memory (seen 2026-10-06 with four 12MP photos picked at
 * once — six of eight arrived as 775-byte blank JPEGs). The <img> route also
 * honours EXIF orientation the same way the page will display the photo.
 */
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;
/**
 * A decode that comes back smaller than this on a side is the browser
 * giving up, not a photo. A real downscaled photo is never under this many
 * bytes either; the server holds the same line (messagePhotos.ts).
 */
const MIN_DIMENSION = 16;
export const PHOTO_MIN_BYTES = 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  const done = img.decode
    ? img.decode().then(() => img)
    : new Promise<HTMLImageElement>((resolve, reject) => {
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image failed to load'));
      });
  return done.finally(() => URL.revokeObjectURL(url));
}

export async function downscalePhoto(file: File, maxDimension = MAX_DIMENSION): Promise<File> {
  try {
    const img = await loadImage(file);
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    if (width < MIN_DIMENSION || height < MIN_DIMENSION) return file;

    const scale = Math.min(1, maxDimension / Math.max(width, height));
    if (scale === 1 && file.type === 'image/jpeg') return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    // Hand the canvas memory back now rather than at the next GC: a phone
    // picking four photos in a row is working close to Safari's limit.
    canvas.width = 0;
    canvas.height = 0;
    if (!blob || blob.size < PHOTO_MIN_BYTES) return file;

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/**
 * One at a time, not Promise.all: decoding four camera photos concurrently
 * is what pushed Safari past its image memory and produced the blanks.
 */
export async function downscalePhotos(files: File[], maxDimension = MAX_DIMENSION): Promise<File[]> {
  const out: File[] = [];
  for (const f of files) out.push(await downscalePhoto(f, maxDimension));
  return out;
}
