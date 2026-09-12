// src/components/AppDownloadLinks.tsx
//
// Store badges for the footer (or anywhere else). Deliberately renders
// nothing at all until the store URLs exist, so this can be merged and
// deployed before the apps are live without showing dead links.
//
// Fill in the two constants when the listings go live. The App Store URL is
// on the app's App Store Connect page; the Play URL is
// https://play.google.com/store/apps/details?id=com.emmerdaleagriculture.app
//
// Badge artwork: both stores require their own official badge images and
// forbid recolouring or redrawing them. Download from
//   Apple: developer.apple.com/app-store/marketing/guidelines/#downloadOnAppstore
//   Google: play.google.com/intl/en_us/badges/
// and drop them in public/ as app-store-badge.svg and google-play-badge.png.

import Image from 'next/image';
import s from './AppDownloadLinks.module.css';

const APP_STORE_URL = '';   // e.g. 'https://apps.apple.com/gb/app/.../id0000000000'
const PLAY_STORE_URL = '';  // e.g. 'https://play.google.com/store/apps/details?id=com.emmerdaleagriculture.app'

export function AppDownloadLinks() {
  if (!APP_STORE_URL && !PLAY_STORE_URL) return null;

  return (
    <div className={s.wrap}>
      <p className={s.label}>Get the app</p>
      <ul className={s.badges}>
        {APP_STORE_URL && (
          <li>
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
              <Image
                src="/app-store-badge.svg"
                alt="Download on the App Store"
                width={140}
                height={47}
              />
            </a>
          </li>
        )}
        {PLAY_STORE_URL && (
          <li>
            <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">
              <Image
                src="/google-play-badge.png"
                alt="Get it on Google Play"
                width={158}
                height={47}
              />
            </a>
          </li>
        )}
      </ul>
    </div>
  );
}
