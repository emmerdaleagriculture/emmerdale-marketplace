import { NextResponse } from 'next/server';

/**
 * /.well-known/assetlinks.json (rewritten here in next.config): the Android
 * side of app links (PRD task 10). The release signing certificate's SHA-256
 * comes from Play Console → App integrity (Play App Signing), set as
 * ANDROID_CERT_SHA256 (comma-separated if more than one). Until it is set
 * the file lists no fingerprints and Android treats the links as web links.
 */
const PACKAGE = (process.env.ANDROID_PACKAGE_NAME ?? 'com.emmerdaleagriculture.app').trim();

export function GET() {
  const prints = (process.env.ANDROID_CERT_SHA256 ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s));
  const body = [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: PACKAGE, sha256_cert_fingerprints: prints },
    },
  ];
  return NextResponse.json(body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
  });
}
