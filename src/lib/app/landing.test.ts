import { describe, expect, it } from 'vitest';
import { pickLanding, roleIntent } from './landing';

describe('pickLanding', () => {
  it('opens each side on its first tab, contractor first for someone who is both', () => {
    expect(pickLanding({ contractor: true, customer: false }, null)).toBe('/invitations');
    expect(pickLanding({ contractor: false, customer: true }, null)).toBe('/app/home');
    expect(pickLanding({ contractor: true, customer: true }, 'customer')).toBe('/invitations');
  });
  it('sends a brand-new person to the role screen, carrying what they said on the welcome screen', () => {
    expect(pickLanding({ contractor: false, customer: false }, null)).toBe('/app/role');
    expect(pickLanding({ contractor: false, customer: false }, 'contractor')).toBe('/app/role?role=contractor');
  });
});

describe('roleIntent', () => {
  it('accepts only the two roles', () => {
    expect(roleIntent('contractor')).toBe('contractor');
    expect(roleIntent('customer')).toBe('customer');
    expect(roleIntent('admin')).toBeNull();
    expect(roleIntent(undefined)).toBeNull();
  });
});
