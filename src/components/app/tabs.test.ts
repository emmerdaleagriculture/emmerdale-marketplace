import { describe, expect, it } from 'vitest';
import { activeTab, BOOKS_TAB, CONTRACTOR_TABS, CUSTOMER_TABS, isTabRoot, tabsFor } from './tabs';

describe('tabsFor', () => {
  it('gives each side its bar and nobody else one', () => {
    expect(tabsFor('customer')).toBe(CUSTOMER_TABS);
    expect(tabsFor('contractor')).toBe(CONTRACTOR_TABS);
    expect(tabsFor('both')).toBe(CONTRACTOR_TABS);
    expect(tabsFor('account')).toBeNull();
    expect(tabsFor(null)).toBeNull();
  });
});

describe('activeTab', () => {
  it('lights the tab an inner screen belongs to', () => {
    expect(activeTab(CUSTOMER_TABS, '/my/abc123')?.key).toBe('jobs');
    expect(activeTab(CUSTOMER_TABS, '/start/complete')?.key).toBe('home');
    expect(activeTab(CONTRACTOR_TABS, '/quote/tok')?.key).toBe('jobs');
    expect(activeTab(CONTRACTOR_TABS, '/jobs/new')?.key).toBe('jobs');
    expect(activeTab(CONTRACTOR_TABS, '/privacy')).toBeNull();
    expect(activeTab(CONTRACTOR_TABS, '/app/diary')?.key).toBe('diary');
    expect(activeTab(CONTRACTOR_TABS, '/won/abc/photos')?.key).toBe('diary');
    expect(activeTab(CONTRACTOR_TABS, '/account')?.key).toBe('dashboard');
    expect(activeTab(CONTRACTOR_TABS, '/account/settings')?.key).toBe('dashboard');
    expect(activeTab(CONTRACTOR_TABS, '/app/earnings')?.key).toBe('earnings');
  });
  it('does not confuse /my with /messages', () => {
    expect(activeTab(CUSTOMER_TABS, '/messages')?.key).toBe('messages');
  });
});

describe('isTabRoot', () => {
  it('is only the tab pages themselves', () => {
    expect(isTabRoot(CUSTOMER_TABS, '/my')).toBe(true);
    expect(isTabRoot(CUSTOMER_TABS, '/my/abc')).toBe(false);
    expect(isTabRoot(CONTRACTOR_TABS, '/account')).toBe(true);
    expect(isTabRoot(CONTRACTOR_TABS, '/account/settings')).toBe(false);
  });
});

describe('Books tab', () => {
  it('only contractors with Books get it, after Earnings', () => {
    const withBooks = tabsFor('contractor', { books: true })!;
    expect(withBooks.map((t) => t.key)).toEqual(['dashboard', 'earnings', 'books', 'diary', 'info', 'messages', 'jobs']);
    expect(tabsFor('contractor')).toBe(CONTRACTOR_TABS);
    expect(tabsFor('customer', { books: true })).toBe(CUSTOMER_TABS);
    expect(CONTRACTOR_TABS).not.toContain(BOOKS_TAB);
  });
  it('lights Books, not Dashboard, on its pages', () => {
    const tabs = tabsFor('contractor', { books: true })!;
    expect(activeTab(tabs, '/account/books')?.key).toBe('books');
    expect(activeTab(tabs, '/account/books/bank/3')?.key).toBe('books');
    expect(activeTab(tabs, '/account/settings')?.key).toBe('dashboard');
    expect(isTabRoot(tabs, '/account/books')).toBe(true);
  });
});

describe('Info tab', () => {
  it('is on both bars and lights for every Info page', () => {
    for (const tabs of [CUSTOMER_TABS, CONTRACTOR_TABS]) {
      expect(tabs.map((t) => t.key)).toContain('info');
      expect(activeTab(tabs, '/info')?.key).toBe('info');
      expect(activeTab(tabs, '/info/weeds/common-ragwort')?.key).toBe('info');
      expect(isTabRoot(tabs, '/info')).toBe(true);
      expect(isTabRoot(tabs, '/info/calendar')).toBe(false);
    }
  });
});
