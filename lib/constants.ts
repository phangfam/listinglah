/**
 * App-wide constants shared across the client and API routes.
 *
 * Keep non-route values here rather than exporting them from route files —
 * Next.js only allows route handlers/config to be exported from `route.ts`,
 * and re-exporting other values triggers a build type error.
 */

/** Number of free generations allowed before an upgrade is required. */
export const FREE_LIMIT = 3;

/**
 * Validate that a string is a properly formatted email address.
 * Shared by the email-gate UI (client) and the /api/lead route (server) so
 * both apply the exact same rule. Intentionally simple: one @, a dot in the
 * domain, no whitespace — enough to catch typos without rejecting valid mail.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
