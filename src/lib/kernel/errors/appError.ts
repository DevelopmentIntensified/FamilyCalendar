/**
 * The one error type services throw for EXPECTED failures (bad input, missing
 * row, no permission, conflict, rate limit). The HTTP builders in
 * `kernel/http` turn it into `{ error: message, ...extra }` with `status`.
 * Anything that is not an AppError is a fault: logged, auto-filed, 500.
 *
 * Doc: src/lib/kernel/README.md#errors
 */
export type AppErrorCode =
	| 'invalid'
	| 'unauthorized'
	| 'forbidden'
	| 'notFound'
	| 'conflict'
	| 'tooMany'
	| 'unavailable';

const STATUS_BY_CODE: Readonly<Record<AppErrorCode, number>> = {
	invalid: 400,
	unauthorized: 401,
	forbidden: 403,
	notFound: 404,
	conflict: 409,
	tooMany: 429,
	unavailable: 503
};

/** Extra JSON fields merged into the error body, e.g. `{ openSessionId }` on a 409. */
export type AppErrorExtra = Readonly<Record<string, string | number | boolean | null>>;

export class AppError extends Error {
	readonly code: AppErrorCode;
	readonly status: number;
	readonly extra: AppErrorExtra;

	constructor(code: AppErrorCode, message: string, extra: AppErrorExtra = {}) {
		super(message);
		this.name = 'AppError';
		this.code = code;
		this.status = STATUS_BY_CODE[code];
		this.extra = extra;
	}
}

export function invalid(message: string, extra?: AppErrorExtra): AppError {
	return new AppError('invalid', message, extra);
}

export function unauthorized(message = 'Unauthorized'): AppError {
	return new AppError('unauthorized', message);
}

export function forbidden(message = 'Forbidden', extra?: AppErrorExtra): AppError {
	return new AppError('forbidden', message, extra);
}

export function notFound(message = 'Not found', extra?: AppErrorExtra): AppError {
	return new AppError('notFound', message, extra);
}

export function conflict(message: string, extra?: AppErrorExtra): AppError {
	return new AppError('conflict', message, extra);
}

export function tooMany(message: string, extra?: AppErrorExtra): AppError {
	return new AppError('tooMany', message, extra);
}

export function unavailable(message: string, extra?: AppErrorExtra): AppError {
	return new AppError('unavailable', message, extra);
}

export function isAppError(value: unknown): value is AppError {
	return value instanceof AppError;
}

/** The `{ error, ...extra }` body every JSON error response carries (house contract). */
export function errorBody(
	error: AppError
): Readonly<Record<string, string | number | boolean | null>> {
	return { ...error.extra, error: error.message };
}
