/**
 * admin contract: the one shape the admin nav's badge counts travel in.
 *
 * `GET /api/admin`'s body and the `(admin)` layout data are the same two
 * numbers, so they share one schema and one type: the badges and the JSON
 * cannot disagree (README Invariant). The goldens pin the values
 * (`admin.http.db.test.ts`); a count is never negative, so the schema is the
 * kernel's whole number.
 *
 * Doc: ./README.md#invariants
 */
import { wholeNumber, z } from '$lib/kernel/validation/validators';

/**
 * Open rows per admin register: bug reports without a `resolvedAt`, unmatched
 * phrases with `resolved = false`. A leg whose count fails reads 0 rather than
 * failing the page or the call, so both fields are always present and always
 * whole.
 */
export const AdminCounts = z.object({
	openBugs: wholeNumber('Invalid open bug count'),
	openPhrases: wholeNumber('Invalid open phrase count')
});
export type AdminCounts = z.infer<typeof AdminCounts>;
