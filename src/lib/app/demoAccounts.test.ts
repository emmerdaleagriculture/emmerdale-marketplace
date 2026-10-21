import { describe, expect, it } from 'vitest';
import { demoEmailCode } from './demoAccounts';

describe('demoEmailCode', () => {
  const env = { DEMO_EMAIL_CODE: '482913' };
  it('gives the fixed code to the two demo addresses only', () => {
    expect(demoEmailCode('demo-customer@emmerdaleagriculture.com', env)).toBe('482913');
    expect(demoEmailCode('  Demo-Contractor@EmmerdaleAgriculture.com ', env)).toBe('482913');
    expect(demoEmailCode('demo-operator-b@emmerdaleagriculture.com', env)).toBeNull();
    expect(demoEmailCode('tom@example.com', env)).toBeNull();
  });
  it('is off when the code is unset or not six digits', () => {
    expect(demoEmailCode('demo-customer@emmerdaleagriculture.com', {})).toBeNull();
    expect(demoEmailCode('demo-customer@emmerdaleagriculture.com', { DEMO_EMAIL_CODE: '12345' })).toBeNull();
    expect(demoEmailCode('demo-customer@emmerdaleagriculture.com', { DEMO_EMAIL_CODE: 'abcdef' })).toBeNull();
  });
});
