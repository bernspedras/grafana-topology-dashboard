jest.mock('@grafana/runtime', () => ({
  config: {
    bootData: {
      user: {
        isSignedIn: true,
        orgRole: 'Admin',
        isGrafanaAdmin: false,
        email: 'admin@example.com',
      },
    },
  },
}));

import { config } from '@grafana/runtime';
import { OrgRole } from '@grafana/data';
import { canEditTopology } from './permissions';

// Helper to reset user state before each test
function setUser(overrides: Partial<typeof config.bootData.user>): void {
  Object.assign(config.bootData.user, {
    isSignedIn: true,
    orgRole: OrgRole.Viewer,
    isGrafanaAdmin: false,
    email: 'user@example.com',
    ...overrides,
  });
}

describe('canEditTopology', () => {
  it('returns false for anonymous (not signed in) users', () => {
    setUser({ isSignedIn: false, orgRole: OrgRole.Admin });
    expect(canEditTopology([])).toBe(false);
  });

  it('returns true for Admin orgRole', () => {
    setUser({ orgRole: OrgRole.Admin });
    expect(canEditTopology(undefined)).toBe(true);
  });

  it('returns true for Grafana admin regardless of orgRole', () => {
    setUser({ orgRole: OrgRole.Viewer, isGrafanaAdmin: true });
    expect(canEditTopology(undefined)).toBe(true);
  });

  it('returns true for Editor whose email is in the allow list', () => {
    setUser({ orgRole: OrgRole.Editor, email: 'editor@example.com' });
    expect(canEditTopology(['editor@example.com'])).toBe(true);
  });

  it('returns false for Editor whose email is not in the allow list', () => {
    setUser({ orgRole: OrgRole.Editor, email: 'other@example.com' });
    expect(canEditTopology(['editor@example.com'])).toBe(false);
  });

  it('returns false for Editor when allow list is undefined', () => {
    setUser({ orgRole: OrgRole.Editor, email: 'editor@example.com' });
    expect(canEditTopology(undefined)).toBe(false);
  });

  it('returns false for Viewer even if email is in the allow list', () => {
    setUser({ orgRole: OrgRole.Viewer, email: 'viewer@example.com' });
    expect(canEditTopology(['viewer@example.com'])).toBe(false);
  });

  it('matches emails case-insensitively', () => {
    setUser({ orgRole: OrgRole.Editor, email: 'Editor@Example.COM' });
    expect(canEditTopology(['editor@example.com'])).toBe(true);
  });

  it('trims whitespace from emails when matching', () => {
    setUser({ orgRole: OrgRole.Editor, email: '  editor@example.com  ' });
    expect(canEditTopology([' editor@example.com '])).toBe(true);
  });

  it('returns false for Editor with an empty allow list', () => {
    setUser({ orgRole: OrgRole.Editor, email: 'editor@example.com' });
    expect(canEditTopology([])).toBe(false);
  });
});
