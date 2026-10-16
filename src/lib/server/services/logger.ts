/**
 * Structured JSON logging — issue 183.
 *
 * Every logEvent call emits a single line of parseable JSON
 * {ts, level, event, ...context} so Vercel logs become searchable
 * by event name. PII scrubbing is issue #169's job — do not log
 * request bodies here.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = Record<string, unknown>;

interface LogRecord {
	ts: string;
	level: LogLevel;
	event: string;
	[key: string]: unknown;
}

function emit(level: LogLevel, record: LogRecord): void {
	const line = JSON.stringify(record);
	if (level === 'error') console.error(line);
	else if (level === 'warn') console.warn(line);
	else console.log(line);
}

/**
 * Log one structured event as a single-line JSON record.
 *
 * - `ts`: UTC ISO 8601 timestamp
 * - `level`: 'debug' | 'info' | 'warn' | 'error'
 * - `event`: machine-readable id, e.g. 'pricing_view'
 * - remaining fields come from `context` — never request bodies.
 */
export function logEvent(level: LogLevel, event: string, context: LogContext = {}): void {
	const record: LogRecord = {
		ts: new Date().toISOString(),
		level,
		event,
		...context
	};
	emit(level, record);
}

/**
 * Error-capture seam. Today this forwards to structured console.error.
 * When @sentry/sveltekit is installed (issue 183 follow-up), the first
 * line of this function becomes `Sentry.captureException(err, { extra: ctx })`.
 */
export function captureError(err: unknown, ctx: LogContext = {}): void {
	let details: LogContext;
	if (err instanceof Error) {
		details = { error_type: err.name, message: err.message, stack: err.stack };
	} else {
		details = { message: String(err) };
	}
	logEvent('error', 'captured_error', { ...ctx, ...details });
}
