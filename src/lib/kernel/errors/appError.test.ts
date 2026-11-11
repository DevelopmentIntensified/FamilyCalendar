import { describe, expect, it } from 'vitest';
import {
	AppError,
	conflict,
	errorBody,
	forbidden,
	invalid,
	isAppError,
	notFound,
	tooMany,
	unauthorized,
	unavailable
} from './appError';

describe('AppError', () => {
	it.each([
		[invalid('Title is required'), 400, 'Title is required'],
		[unauthorized(), 401, 'Unauthorized'],
		[forbidden(), 403, 'Forbidden'],
		[notFound('Task not found'), 404, 'Task not found'],
		[conflict('Session already open'), 409, 'Session already open'],
		[tooMany('Too many reports. Try again shortly.'), 429, 'Too many reports. Try again shortly.'],
		[unavailable('AI is off'), 503, 'AI is off']
	])('maps %s to its HTTP status and keeps the message', (error, status, message) => {
		expect(error.status).toBe(status);
		expect(error.message).toBe(message);
		expect(isAppError(error)).toBe(true);
	});

	it('puts extra fields in the body without letting them override `error`', () => {
		const error = conflict('A phone session is already open', {
			openSessionId: 's1',
			error: 'spoofed'
		});
		expect(errorBody(error)).toEqual({
			error: 'A phone session is already open',
			openSessionId: 's1'
		});
	});

	it('does not treat plain errors as expected failures', () => {
		expect(isAppError(new Error('boom'))).toBe(false);
		expect(new AppError('invalid', 'x')).toBeInstanceOf(Error);
	});
});
