import { describe, expect, it } from 'vitest';
import {
  appVersionFromUserAgent,
  isAppStandalonePath,
  isAppUserAgent,
  platformFromUserAgent,
} from './appMode';

const IOS_APP =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 EmmerdaleApp/1.0.3';
const ANDROID_APP =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36 EmmerdaleApp/1';
const SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

describe('isAppUserAgent', () => {
  it('recognises the frame on either phone and nothing else', () => {
    expect(isAppUserAgent(IOS_APP)).toBe(true);
    expect(isAppUserAgent(ANDROID_APP)).toBe(true);
    expect(isAppUserAgent(SAFARI)).toBe(false);
    expect(isAppUserAgent(null)).toBe(false);
  });
});

describe('platformFromUserAgent', () => {
  it('tells the phones apart', () => {
    expect(platformFromUserAgent(IOS_APP)).toBe('ios');
    expect(platformFromUserAgent(ANDROID_APP)).toBe('android');
    expect(platformFromUserAgent('curl/8.0')).toBe('web');
  });
});

describe('appVersionFromUserAgent', () => {
  it('reads the version after the token', () => {
    expect(appVersionFromUserAgent(IOS_APP)).toBe('1.0.3');
    expect(appVersionFromUserAgent(ANDROID_APP)).toBe('1');
    expect(appVersionFromUserAgent(SAFARI)).toBeNull();
  });
});

describe('isAppStandalonePath', () => {
  it('keeps the tab bar off the welcome, sign-in and job-flow screens', () => {
    for (const p of ['/app', '/app/role', '/app/phone', '/app/notify', '/app/location', '/app/new-job', '/app/apply', '/login', '/start/complete', '/admin/jobs']) {
      expect(isAppStandalonePath(p)).toBe(true);
    }
    for (const p of ['/app/home', '/my', '/my/abc', '/invitations', '/messages', '/account']) {
      expect(isAppStandalonePath(p)).toBe(false);
    }
  });
});
