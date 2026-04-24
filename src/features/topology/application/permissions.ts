import { config } from '@grafana/runtime';

/**
 * Determines whether the current user can edit topology data.
 *
 * - Admin → always yes
 * - Editor with email in allow list → yes
 * - Otherwise → no
 */
export function canEditTopology(editAllowList: readonly string[] | undefined): boolean {
  const user = config.bootData.user;

  // Anonymous users must not get edit access even if their org role is Admin
  if (!user.isSignedIn) {
    return false;
  }

  if ((user.orgRole as string) === 'Admin' || user.isGrafanaAdmin) {
    return true;
  }

  if ((user.orgRole as string) === 'Editor' && editAllowList !== undefined) {
    const normalizedEmail = user.email.toLowerCase().trim();
    return editAllowList.some(
      (allowed) => allowed.toLowerCase().trim() === normalizedEmail,
    );
  }

  return false;
}
