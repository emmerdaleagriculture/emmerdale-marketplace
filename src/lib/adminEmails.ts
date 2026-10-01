/**
 * The ADMIN_EMAILS allowlist (spec §7.1, §12.5). Admin routes are gated on
 * this rather than a JWT claim: simpler, no claim-stamping, and admin DB
 * writes use the service-role client anyway. Kept free of any server-only
 * import so the middleware can use it too.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}
