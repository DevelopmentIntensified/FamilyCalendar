/**
 * family join state: the `/family/join/[code]` page's one button.
 *
 * A successful join shows the welcome panel and then moves on after the
 * approved beat; a refusal keeps the page where it is, with the server's
 * sentence and the note that a fresh link is the way forward. The redirect and
 * the scheduler are injected, so the class runs in node and the page keeps no
 * logic.
 *
 * Doc: ./README.md#public-interface
 */
import { systemScheduler, type Scheduler } from '$lib/kernel/time/scheduler';
import type { FamilyApi } from './family.api';
import {
	FAMILY_JOIN_NETWORK_FAILURE,
	FAMILY_JOIN_REDIRECT_MS
} from './family.join.rules';

export class FamilyJoinState {
	joining = $state(false);
	/** The join refusal (the server's copy, or the page's network sentence). */
	error = $state('');
	/** The welcome panel is up and the redirect is pending. */
	success = $state(false);

	private readonly api: FamilyApi;
	private readonly code: string;
	private readonly redirect: () => void;
	private readonly schedule: Scheduler;

	constructor(
		api: FamilyApi,
		code: string,
		redirect: () => void,
		schedule: Scheduler = systemScheduler
	) {
		this.api = api;
		this.code = code;
		this.redirect = redirect;
		this.schedule = schedule;
	}

	/** Accept the code; on success welcome the person and leave after the beat. */
	async join(): Promise<void> {
		if (this.joining) return;
		this.joining = true;
		this.error = '';
		const result = await this.api.joinFamily(this.code);
		this.joining = false;
		if (!result.ok) {
			this.error = result.status === 0 ? FAMILY_JOIN_NETWORK_FAILURE : result.error;
			return;
		}
		this.success = true;
		this.schedule(() => this.redirect(), FAMILY_JOIN_REDIRECT_MS);
	}
}
