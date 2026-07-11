/**
 * App-wide constants shared across the client and API routes.
 *
 * Keep non-route values here rather than exporting them from route files —
 * Next.js only allows route handlers/config to be exported from `route.ts`,
 * and re-exporting other values triggers a build type error.
 */

/** Number of free generations allowed before an upgrade is required. */
export const FREE_LIMIT = 3;
