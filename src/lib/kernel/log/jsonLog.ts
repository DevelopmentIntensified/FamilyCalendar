/**
 * Log port + the JSON-lines adapter. Same line format as the legacy
 * `logEvent` (issue 183): `{ ts, level, event, ...fields }`, one line per
 * call, so Vercel log search keeps working across the rewrite.
 *
 * Never log request bodies or emails (issue 169 / 029 PII rule).
 *
 * Doc: src/lib/kernel/README.md#log
 */
import type { Clock } from '../time/clock';

export type LogLevel = 'info' | 'warn' | 'error';
export type LogFields = Readonly<Record<string, string | number | boolean | null | undefined>>;

export type Log = {
	info(event: string, fields?: LogFields): void;
	warn(event: string, fields?: LogFields): void;
	error(event: string, fields?: LogFields): void;
};

export type LineWriter = (level: LogLevel, line: string) => void;

export const consoleWriter: LineWriter = (level, line) => {
	if (level === 'error') console.error(line);
	else if (level === 'warn') console.warn(line);
	else console.log(line);
};

export function createJsonLog(clock: Clock, write: LineWriter = consoleWriter): Log {
	const emit = (level: LogLevel, event: string, fields: LogFields = {}) =>
		write(level, JSON.stringify({ ts: clock.now().toISOString(), level, event, ...fields }));
	return {
		info: (event, fields) => emit('info', event, fields),
		warn: (event, fields) => emit('warn', event, fields),
		error: (event, fields) => emit('error', event, fields)
	};
}
