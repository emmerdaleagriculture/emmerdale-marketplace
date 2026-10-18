import { isNativeApp } from '@/lib/app/isApp';
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
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      source: CameraSource.Prompt,
      quality: 85,
      correctOrientation: true,
      promptLabelHeader: 'Add a photo',
      promptLabelPhoto: 'From your library',
      promptLabelPicture: 'Take a photo',
    });
    if (!photo.webPath) return null;
    const blob = await (await fetch(photo.webPath)).blob();
    const file = new File([blob], `photo.${photo.format || 'jpg'}`, { type: blob.type || 'image/jpeg' });
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
