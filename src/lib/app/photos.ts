import * as Sentry from '@sentry/nextjs';
import { isNativeApp } from '@/lib/app/isApp';
import { downscalePhotos } from '@/lib/photoDownscale';

/**
 * Whether the photo buttons use the native Camera plugin. Off for now: in
 * build 1.0.0 (3) on iOS the plugin call failed before showing anything,
 * and pickPhoto() swallowed the error, so tapping a photo box did nothing.
 * The screens fall back to their <input type="file" accept="image/*">,
 * which iOS shows as its own Take Photo / Photo Library sheet and Android
 * as its chooser: native UI, no plugin. Turn this back on once a
 * device test of pickPhoto() passes (failures now reach Sentry).
 */
export function nativeCamera(): boolean {
  return false;
}

function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

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
    Sentry.captureException(err, { tags: { area: 'app-photos' } });
    return null;
  }
}

/** Files from an <input type="file">, downscaled. */
export async function filesToPhotos(list: FileList | null): Promise<File[]> {
  if (!list?.length) return [];
  return downscalePhotos([...list].slice(0, 2));
}
