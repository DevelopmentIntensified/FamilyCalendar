/**
 * Pure rules for push fan-out: the two FCM message shapes, the Alert push
 * payload and its default link, who is sent to (users and tokens once each) and
 * when a dead target is pruned. Carried over from
 * `src/lib/server/services/devicePushService.test.ts` (cases named inline);
 * the README Invariants name the shapes (`data.type`, `collapse_key`, `ttl`,
 * `actorId`, #281).
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import type { AlertType } from './alerts.contract';
import {
	ALERT_PUSH_DEFAULT_LINK,
	alertPushLink,
	alertPushPayload,
	distinctTokens,
	distinctUserIds,
	eventsChangedMessage,
	isSubscriptionGone,
	shouldPruneDeviceToken,
	visibleMessage,
	type FcmSendResult
} from './alerts.push.rules';

describe('alertPushPayload: the push a new Alert fires', () => {
	it('titles the push with the actor, bodies it with the message and keeps its own link', () => {
		expect(
			alertPushPayload({
				type: 'assignment_pending',
				actorName: 'Kim',
				message: 'asked you to take "Bins"',
				link: '/calendar/day'
			})
		).toEqual({ title: 'Kim', body: 'asked you to take "Bins"', link: '/calendar/day' });
	});

	// Q-021: a push with no link of its own opens the page its type answers.
	it.each<[string, AlertType, string | null | undefined]>([
		['null', 'added_to_family', null],
		['absent', 'added_to_family', undefined]
	])(
		'taps an added_to_family push through to the family page when the link is %s',
		(_label, type, link) => {
			expect(alertPushLink(type)).toBe('/family');
			expect(alertPushPayload({ type, actorName: 'Sam', message: 'added you', link }).link).toBe(
				'/family'
			);
		}
	);

	it.each<AlertType>([
		'assignment_pending',
		'assignment_accepted',
		'assignment_declined',
		'task_completed'
	])('taps a %s push through to the tasks page when the link is absent', (type) => {
		expect(ALERT_PUSH_DEFAULT_LINK).toBe('/calendar/tasks');
		expect(alertPushLink(type)).toBe('/calendar/tasks');
		expect(alertPushPayload({ type, actorName: 'Sam', message: 'completed the bins' }).link).toBe(
			'/calendar/tasks'
		);
	});

	it('keeps an empty-string link: only null and absent take the type default', () => {
		expect(
			alertPushPayload({ type: 'task_completed', actorName: 'Sam', message: 'x', link: '' }).link
		).toBe('');
	});
});

describe('visibleMessage: a user-visible notification', () => {
	// devicePushService.test.ts:31 "sends a notification message to every token of the user"
	it('carries the tray text, the tap target and high priority', () => {
		expect(visibleMessage({ title: 'T', body: 'B', link: '/l' })).toEqual({
			notification: { title: 'T', body: 'B' },
			data: { type: 'notification', link: '/l' },
			android: { priority: 'high' }
		});
	});

	it.each<[string, string | undefined]>([
		['absent', undefined],
		['empty', '']
	])('leaves data.link out when the link is %s', (_label, link) => {
		expect(visibleMessage({ title: 'T', body: 'B', link }).data).toEqual({ type: 'notification' });
	});
});

describe('eventsChangedMessage: the silent sync nudge', () => {
	// devicePushService.test.ts:80 "sends one data-only events_changed message per token across users"
	it('is data-only, collapsed, short-lived and carries the actor (#281)', () => {
		expect(eventsChangedMessage('user-1')).toEqual({
			data: { type: 'events_changed', actorId: 'user-1' },
			android: { priority: 'high', collapse_key: 'events_changed', ttl: '600s' }
		});
	});

	it('has no notification block, so nothing shows on the phone', () => {
		expect(eventsChangedMessage('user-1').notification).toBeUndefined();
	});
});

describe('who is sent to', () => {
	// devicePushService.test.ts:80 "(users deduped)"
	it('names each user once, first occurrence first', () => {
		expect(distinctUserIds(['u2', 'u1', 'u2', 'u1', 'u3'])).toEqual(['u2', 'u1', 'u3']);
	});

	it('is empty for an empty audience', () => {
		expect(distinctUserIds([])).toEqual([]);
	});

	it('names each token once, so a device two accounts hold is never double-sent', () => {
		expect(
			distinctTokens([
				{ token: 'a' },
				{ token: 'b' },
				{ token: 'a' }
			])
		).toEqual(['a', 'b']);
	});
});

describe('when a dead target is pruned', () => {
	// devicePushService.test.ts:46 "prunes tokens FCM reports unregistered, keeps the rest"
	it.each<[FcmSendResult, boolean]>([
		['unregistered', true],
		['sent', false],
		['failed', false]
	])('shouldPruneDeviceToken(%s) is %s', (result, expected) => {
		expect(shouldPruneDeviceToken(result)).toBe(expected);
	});

	// README: a 404/410 from the push service deletes that caller's subscription row; other failures are logged.
	it.each<[string, unknown, boolean]>([
		['a 404', { statusCode: 404 }, true],
		['a 410', { statusCode: 410 }, true],
		['an Error carrying a 410', Object.assign(new Error('gone'), { statusCode: 410 }), true],
		['a 400', { statusCode: 400 }, false],
		['a 429', { statusCode: 429 }, false],
		['a 500', { statusCode: 500 }, false],
		['a string status', { statusCode: '410' }, false],
		['an object with no status', {}, false],
		['a plain Error', new Error('network down'), false],
		['null', null, false],
		['a string', 'boom', false]
	])('isSubscriptionGone(%s) is %s', (_label, error, expected) => {
		expect(isSubscriptionGone(error)).toBe(expected);
	});
});
