/**
 * Client-side photo downscaling: phone camera JPEGs run 3–8MB; contractors
 * need to see a gateway, not print a poster. Resize to max 1600px and
 * re-encode as JPEG before upload so two photos cost ~1MB of upload on rural
 * mobile signal instead of ~10.
 *
 * Any failure (HEIC the browser can't decode, canvas quirks) returns the
 * original file untouched — a worse upload beats a lost photo.
 */
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

export async function downscalePhoto(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.type === 'image/jpeg') {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob) return file;

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
