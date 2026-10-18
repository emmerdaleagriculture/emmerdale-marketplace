import { isNativeApp } from '@/lib/app/isApp';

/**
 * Open a URL in the system's in-app browser (SFSafariViewController /
 * Custom Tabs) inside the frame, where Apple Pay and Google Pay work; a
 * plain navigation elsewhere. Resolves when the sheet is dismissed in the
 * frame (the page then refreshes itself to pick up the result).
 */
export async function openInAppBrowser(url: string): Promise<'closed' | 'navigated'> {
  if (!isNativeApp()) {
    window.location.assign(url);
    return 'navigated';
  }
  const { Browser } = await import('@capacitor/browser');
  await new Promise<void>((resolve) => {
    let done = false;
    let handle: { remove: () => Promise<void> } | null = null;
    const finish = () => {
      if (done) return;
      done = true;
      handle?.remove().catch(() => {});
      resolve();
    };
    Browser.addListener('browserFinished', finish)
      .then((h) => {
        handle = h;
        if (done) h.remove().catch(() => {});
      })
      .catch(() => {});
    Browser.open({ url, presentationStyle: 'popover' }).catch(() => finish());
  });
  return 'closed';
}
