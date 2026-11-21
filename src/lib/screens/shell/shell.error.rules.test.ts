/**
 * Pure error-view rules, carried from the legacy error page
 * (`src/routes/+error.svelte:6-23,60-73`) and its issue-261 test
 * (`src/routes/error.svelte.test.ts`): 4xx shows the server's reason and never
 * claims a notification; 5xx claims one and offers the report CTA; 404 keeps
 * its own copy.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { shellErrorView } from './shell.error.rules';

describe('picks 404, 4xx and 5xx copy', () => {
	it.each([
		{
			status: 404,
			message: 'Not Found',
			expected: {
				tone: 'muted',
				title: "We can't find that page",
				body: 'The link may be mistyped, or the page moved. Your calendar and tasks are safe.',
				showReport: false
			}
		},
		{
			status: 404,
			message: null,
			expected: {
				tone: 'muted',
				title: "We can't find that page",
				body: 'The link may be mistyped, or the page moved. Your calendar and tasks are safe.',
				showReport: false
			}
		},
		{
			status: 403,
			message: 'No access to this event',
			expected: {
				tone: 'warning',
				title: "We can't open that",
				body: 'No access to this event',
				showReport: false
			}
		},
		{
			status: 400,
			message: '',
			expected: {
				tone: 'warning',
				title: "We can't open that",
				body: 'This page isn’t available to you.',
				showReport: false
			}
		},
		{
			status: 401,
			message: null,
			expected: {
				tone: 'warning',
				title: "We can't open that",
				body: 'This page isn’t available to you.',
				showReport: false
			}
		},
		{
			status: 500,
			message: 'Internal Error',
			expected: {
				tone: 'warning',
				title: 'Something went wrong',
				body: "We've been notified automatically and will look into it. Your data is safe — try going back to your calendar.",
				showReport: true
			}
		},
		{
			status: 502,
			message: undefined,
			expected: {
				tone: 'warning',
				title: 'Something went wrong',
				body: "We've been notified automatically and will look into it. Your data is safe — try going back to your calendar.",
				showReport: true
			}
		}
	])('$status with message $message', ({ status, message, expected }) => {
		expect(shellErrorView(status, message)).toEqual(expected);
	});
});
