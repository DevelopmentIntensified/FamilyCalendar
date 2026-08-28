import { describe, it, expect } from 'vitest';
import { pushFailureText } from './pushClient';

describe('pushFailureText', () => {
	it('defaults to the generic message when no reason is known', () => {
		expect(pushFailureText()).toBe("Couldn't enable notifications.");
		expect(pushFailureText('error')).toBe("Couldn't enable notifications.");
	});

	it('explains each specific failure reason', () => {
		expect(pushFailureText('unsupported')).toContain('support');
		expect(pushFailureText('no-server-key')).toContain('configured');
		expect(pushFailureText('permission-denied')).toContain('blocked');
		expect(pushFailureText('server-rejected')).toContain('rejected');
	});
});