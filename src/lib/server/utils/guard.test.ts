import { describe, it, expect, vi } from 'vitest';
import { guard } from './guard';

describe('guard', () => {
	it('returns the data with no error on success', async () => {
		const result = await guard('tasks', [], async () => [1, 2]);
		expect(result).toEqual({ data: [1, 2], error: null });
	});

	it('returns the fallback plus the label when the loader throws', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const result = await guard('meals', [], async () => {
				throw new Error('relation "meals" does not exist');
			});
			expect(result).toEqual({ data: [], error: 'meals' });
			expect(err).toHaveBeenCalledOnce();
		} finally {
			err.mockRestore();
		}
	});

	it('survives non-Error throws', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const result = await guard('verse', null, async () => {
				// eslint-disable-next-line @typescript-eslint/only-throw-error
				throw 'string failure';
			});
			expect(result).toEqual({ data: null, error: 'verse' });
		} finally {
			err.mockRestore();
		}
	});
});
