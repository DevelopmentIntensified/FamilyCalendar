import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';
import {
	findVerifiedUsersByPrefix,
	MEMBER_SEARCH_MIN_QUERY,
	MEMBER_SEARCH_MAX_QUERY,
	type MemberSearchResult
} from '$lib/server/db/actions/memberSearch';

/**
 * Type-ahead for the create-family member picker (issue 100).
 *
 * A separate door from `/api/family/search`, which cannot serve this page for
 * two independent reasons: it refuses any caller who is not already a member of
 * the family in the query string, and on the create page there is no family to
 * be a member of; and it matches exactly, on purpose, so it never becomes a
 * user-enumeration oracle. Rather than weaken that guard, this endpoint carries
 * its own: the same length floor and row cap as the query, plus a rate limit,
 * plus no ordering.
 *
 * It deliberately carries no member-limit logic. `canAddFamilyMember` already
 * exists and is the call 076 should use; writing a second one here would be the
 * drift 100 exists to stop.
 */

/** 20 searches per 5 minutes per client: enough to type-ahead, not to crawl. */
const RATE_SCOPE = 'family-member-search';
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 5 * 60 * 1000;

export interface MemberSearchDeps {
	/** The search itself, injected so the door can be tested without a database. */
	find(
		query: string,
		options: { callerId: string; excludeUserIds?: string[] }
	): Promise<MemberSearchResult>;
	/** The rate-limit gate; defaults to the in-memory sliding window. */
	gate?(key: string): boolean;
}

export const GET = async (
	event: RequestEvent,
	deps: MemberSearchDeps = { find: findVerifiedUsersByPrefix }
): Promise<Response> => {
	if (!event.locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const gate =
		deps.gate ??
		((key: string) => rateLimit(clientKey(event.request, key), RATE_LIMIT, RATE_WINDOW_MS));

	if (!gate(RATE_SCOPE)) {
		return json({ error: 'Too many searches. Try again shortly.' }, { status: 429 });
	}

	// The floor and the cap are enforced here, before the query is spent, and
	// read from the same constants the query reads.
	const term = (event.url.searchParams.get('q') ?? '').trim();
	if (term.length < MEMBER_SEARCH_MIN_QUERY) {
		return json(
			{ error: `Type at least ${MEMBER_SEARCH_MIN_QUERY} characters to look someone up.` },
			{ status: 400 }
		);
	}
	if (term.length > MEMBER_SEARCH_MAX_QUERY) {
		return json({ error: 'That search is too long.' }, { status: 400 });
	}

	const excludeUserIds = event.url.searchParams.getAll('exclude').filter(Boolean);
	const result = await deps.find(term, {
		callerId: event.locals.user.id,
		excludeUserIds
	});

	// The query refuses short terms itself too; this door is simply never the
	// caller that gets there, and answers empty rather than leaking the reason.
	return json({ users: result.ok ? result.users : [] });
};
