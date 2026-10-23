import { describe, it, expect } from 'vitest';
import { actionErrorCopy } from './actionError';

describe('actionErrorCopy (issue 195)', () => {
	it('returns the server message verbatim when the server named the problem', () => {
		expect(actionErrorCopy('save', 'End date is before start', 400)).toBe(
			'End date is before start'
		);
	});

	it('names creating and wants a retry without a status', () => {
		expect(actionErrorCopy('create')).toBe(
			"Couldn't create the event. Check your connection (a VPN can block it), then try again."
		);
	});

	it('names saving', () => {
		expect(actionErrorCopy('save')).toBe(
			"Couldn't save your changes. Check your connection (a VPN can block it), then try again."
		);
	});

	it('names duplicating', () => {
		expect(actionErrorCopy('duplicate')).toBe(
			"Couldn't duplicate the event. Check your connection (a VPN can block it), then try again."
		);
	});

	it('names deleting', () => {
		expect(actionErrorCopy('delete')).toBe(
			"Couldn't delete the event. Check your connection (a VPN can block it), then try again."
		);
	});

	it('says to sign in again when the session was rejected', () => {
		expect(actionErrorCopy('create', null, 401)).toBe(
			"Couldn't create the event. Your session expired. Sign in, then try again."
		);
		expect(actionErrorCopy('delete', null, 403)).toBe(
			"Couldn't delete the event. Your session expired. Sign in, then try again."
		);
	});

	it('wants the fields rechecked on a validation reply the server did not explain', () => {
		expect(actionErrorCopy('save', null, 400)).toBe(
			"Couldn't save your changes. Check the details you entered, then try again."
		);
	});

	it('still wants a retry on a plain server failure', () => {
		expect(actionErrorCopy('duplicate', null, 500)).toBe(
			"Couldn't duplicate the event. Check your connection (a VPN can block it), then try again."
		);
	});
});
