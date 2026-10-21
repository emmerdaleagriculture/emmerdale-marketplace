import { Capacitor } from '@capacitor/core';
import { isNativeApp } from '@/lib/app/isApp';

/**
 * True only when the native Camera plugin is really in this build. An older
 * app build without it (or any plugin failure) falls back to the ordinary
 * file input, which iOS and Android also show as Take Photo / Library.
 */
export function nativeCamera(): boolean {
  if (!isNativeApp()) return false;
  try {
    return Capacitor.isPluginAvailable('Camera');
  } catch {
    return false;
  }
}

function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
import { downscalePhotos } from '@/lib/photoDownscale';

/**
 * A photo for the job, from the phone's camera or library in the frame
 * (the Camera plugin's own prompt), then through the same downscale the
 * website's job flow uses. Returns null when the person cancels.
 */
export async function pickPhoto(): Promise<File | null> {
  if (!isNativeApp()) return null;
  try {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
    // Base64, not a file URI: the app frame loads the live website, so the
    // page's origin is https://www.emmerdaleagriculture.com and it cannot
    // fetch() the capacitor:// / file:// path a Uri result points at. The
    // fetch failed silently and the photo never appeared.
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.Base64,
      source: CameraSource.Prompt,
      quality: 85,
      width: 2000,
      correctOrientation: true,
      promptLabelHeader: 'Add a photo',
      promptLabelPhoto: 'From your library',
      promptLabelPicture: 'Take a photo',
    });
    if (!photo.base64String) return null;
    const format = (photo.format || 'jpeg').toLowerCase();
    const type = `image/${format === 'jpg' ? 'jpeg' : format}`;
    const file = new File([base64ToBlob(photo.base64String, type)], `photo.${format === 'jpeg' ? 'jpg' : format}`, { type });
    const [small] = await downscalePhotos([file]);
    return small ?? file;
  } catch (err) {
    if (/cancel/i.test(String((err as { message?: string })?.message ?? err))) return null;
    console.error('[photos] camera failed:', err);
    return null;
  }
}

/** Files from an <input type="file">, downscaled. */
export async function filesToPhotos(list: FileList | null): Promise<File[]> {
  if (!list?.length) return [];
  return downscalePhotos([...list].slice(0, 2));
}
