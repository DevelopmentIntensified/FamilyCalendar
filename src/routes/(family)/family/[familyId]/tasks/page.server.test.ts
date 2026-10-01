import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isRedirect } from '@sveltejs/kit';

/**
 * Issue 124 — the second family-tasks page.
 *
 * `/family/tasks` is the approved board (issue 101). `/family/[familyId]/tasks`
 * was a near-copy of it that called `firstName(...)` — a name that is defined
 * nowhere in the file — so the page threw a ReferenceError the moment a task
 * row rendered, and the family detail page linked straight to it. Issue 098
 * left it open because that slice was fenced off from the family-tasks
 * subtree; the prototype (`family-tasks.html`) calls it out by name: "One of
 * them should be deleted."
 *
 * It is gone. The path survives as a redirect so a bookmark or an old link
 * lands on the real board instead of on a crash, and the detail page points at
 * the canonical route directly.
 */

/** SAFETY: this load reads only `params` and `locals`, and never returns —
 *  it always throws a redirect, which is what every case below asserts. */
const load = (await import('./+page.server')).load as unknown as (event: {
	params: { familyId: string };
	locals: { user: { id: string } | null };
}) => Promise<void>;

const ROUTE_DIR = join(process.cwd(), 'src', 'routes', '(family)', 'family', '[familyId]', 'tasks');

describe('the duplicate family-tasks route is gone, not broken', () => {
	it('redirects the old per-family path to the approved board', async () => {
		let thrown: unknown;
		try {
			await load({ params: { familyId: 'fam-1' }, locals: { user: { id: 'user-1' } } });
		} catch (e) {
			thrown = e;
		}

		expect(isRedirect(thrown)).toBe(true);
		expect(thrown).toMatchObject({ status: 308, location: '/family/tasks' });
	});

	it('redirects a signed-out visitor to sign-in rather than the board', async () => {
		let thrown: unknown;
		try {
			await load({ params: { familyId: 'fam-1' }, locals: { user: null } });
		} catch (e) {
			thrown = e;
		}

		expect(isRedirect(thrown)).toBe(true);
		expect(thrown).toMatchObject({ location: '/login' });
	});

	it('has no page of its own left to crash — the second board cannot come back', () => {
		expect(existsSync(join(ROUTE_DIR, '+page.svelte'))).toBe(false);
	});

	it('is not what the family detail page links to', () => {
		const detail = readFileSync(
			join(process.cwd(), 'src', 'routes', '(family)', 'family', '[familyId]', '+page.svelte'),
			'utf8'
		);
		expect(detail).toContain('href="/family/tasks"');
		expect(detail).not.toMatch(/href="\/family\/\{[^}]+\}\/tasks"/);
	});
});