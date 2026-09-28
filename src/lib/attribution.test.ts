import { describe, expect, it } from 'vitest';
import { channelOf, leadAttribution, sourceFromReferrer, UNATTRIBUTED } from './attribution';

describe('sourceFromReferrer', () => {
  it('classifies search engines, social and other sites', () => {
    expect(sourceFromReferrer('https://www.google.com/')).toBe('search');
    expect(sourceFromReferrer('https://www.google.co.uk/search?q=x')).toBe('search');
    expect(sourceFromReferrer('https://www.bing.com/')).toBe('search');
    expect(sourceFromReferrer('android-app://com.google.android.googlequicksearchbox/')).toBe('search');
    expect(sourceFromReferrer('https://l.facebook.com/l.php?u=x')).toBe('social:facebook');
    expect(sourceFromReferrer('https://m.facebook.com/')).toBe('social:facebook');
    expect(sourceFromReferrer('https://l.instagram.com/')).toBe('social:instagram');
    expect(sourceFromReferrer('https://hampshirepaddockmanagement.com/x')).toBe('ref:hampshirepaddockmanagement.com');
  });

  it('says nothing for our own pages, none, or junk', () => {
    expect(sourceFromReferrer('https://www.emmerdaleagriculture.com/')).toBe('');
    expect(sourceFromReferrer('')).toBe('');
    expect(sourceFromReferrer(null)).toBe('');
    expect(sourceFromReferrer('not a url')).toBe('');
    expect(sourceFromReferrer('http://localhost:3000/')).toBe('');
  });
});

describe('channelOf', () => {
  it('keeps gclid first and tagged sources as they were', () => {
    expect(channelOf({ gclid: 'x', utm_source: 'fb', referrer: 'https://facebook.com' })).toBe('Google Ads');
    expect(channelOf({ utm_source: 'fb', referrer: 'https://google.com' })).toBe('Meta — Facebook');
  });

  it('lets the referrer replace an internal hand-off tag', () => {
    expect(channelOf({ utm_source: 'site:home', referrer: 'https://m.facebook.com/' })).toBe('Facebook — untagged');
    expect(channelOf({ utm_source: 'site:home', referrer: 'https://www.google.com/' })).toBe('Organic search');
    expect(channelOf({ utm_source: 'site:home', referrer: 'https://www.emmerdaleagriculture.com/' })).toBe('Internal — home page');
    expect(channelOf({ utm_source: 'site:home' })).toBe('Internal — home page');
  });

  it('uses the referrer when untagged, else unattributed', () => {
    expect(channelOf({ referrer: 'https://www.google.com/' })).toBe('Organic search');
    expect(channelOf({})).toBe(UNATTRIBUTED);
  });

  it('labels the sources the browser now stores on submissions', () => {
    expect(channelOf({ utm_source: 'search' })).toBe('Organic search');
    expect(channelOf({ utm_source: 'ref:example.org' })).toBe('Referral — example.org');
  });
});

describe('leadAttribution', () => {
  it('labels a Facebook lead-ad as paid Meta', () => {
    const a = leadAttribution('facebook', {});
    expect(a).toMatchObject({ utm_source: 'fb', utm_medium: 'lead-ad' });
    expect(channelOf(a)).toBe('Meta — Facebook');
  });

  it('carries an enquiry form visit through, referrer included', () => {
    const a = leadAttribution('hay', {
      attribution: { utm_source: 'site:home', utm_medium: 'organic', referrer: 'https://m.facebook.com/' },
    });
    expect(a.referrer).toBe('https://m.facebook.com/');
    expect(channelOf(a)).toBe('Facebook — untagged');
  });

  it('is empty, not invented, when the lead recorded nothing', () => {
    expect(channelOf(leadAttribution('tractor-hire', { details: 'x' }))).toBe(UNATTRIBUTED);
    expect(channelOf(leadAttribution('hay', null))).toBe(UNATTRIBUTED);
  });
});
