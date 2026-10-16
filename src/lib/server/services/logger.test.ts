import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureError, logEvent } from './logger';

describe('logger.logEvent', () => {
	let lines: { stream: 'log' | 'warn' | 'error'; line: string }[];

	beforeEach(() => {
		lines = [];
		vi.spyOn(console, 'log').mockImplementation((line) => lines.push({ stream: 'log', line }));
		vi.spyOn(console, 'warn').mockImplementation((line) => lines.push({ stream: 'warn', line }));
		vi.spyOn(console, 'error').mockImplementation((line) => lines.push({ stream: 'error', line }));
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it.each([
		['debug', 'log'],
		['info', 'log'],
		['warn', 'warn'],
		['error', 'error']
	] as const)('emits %s as single-line JSON on console.%s', (level, stream) => {
		logEvent(level, 'test_event', { userId: 'u1' });

		expect(lines).toHaveLength(1);
		expect(lines[0].stream).toBe(stream);
		const parsed = JSON.parse(lines[0].line);
		expect(parsed.event).toBe('test_event');
		expect(parsed.level).toBe(level);
		expect(typeof parsed.ts).toBe('string');
		expect(new Date(parsed.ts).toISOString()).toBe(parsed.ts);
		expect(parsed.userId).toBe('u1');
	});

	it('always parses back as exactly one line (no formatting embedded)', () => {
		logEvent('info', 'deliberate_newline', { note: 'a\nb' });
		const line = lines[0].line;
		expect(line.indexOf('\n')).toBe(-1);
		expect(JSON.parse(line)).toMatchObject({ event: 'deliberate_newline' });
	});

	it('works with no context', () => {
		logEvent('info', 'bare_event');
		expect(JSON.parse(lines[0].line)).toMatchObject({ event: 'bare_event', level: 'info' });
	});
});

describe('logger.captureError', () => {
	beforeEach(() => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('forwards an Error as structured console.error with type/message/stack', () => {
		const err = new Error('boom');
		captureError(err, { route: '/api/health' });

		expect(console.error).toHaveBeenCalledTimes(1);
		const record = JSON.parse(vi.mocked(console.error).mock.calls[0][0]);
		expect(record).toMatchObject({
			level: 'error',
			event: 'captured_error',
			route: '/api/health',
			error_type: 'Error',
			message: 'boom'
		});
		expect(typeof record.stack).toBe('string');
	});

	it('handles non-Error throwables without crashing', () => {
		captureError('just a string');
		const record = JSON.parse(vi.mocked(console.error).mock.calls[0][0]);
		expect(record).toMatchObject({ event: 'captured_error', message: 'just a string' });
	});
});
