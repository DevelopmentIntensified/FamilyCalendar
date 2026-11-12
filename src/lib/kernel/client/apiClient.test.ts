import { describe, expect, it } from 'vitest';
import { createApiClient, type Fetcher } from './apiClient';

type Call = { url: string; init?: RequestInit };

function fakeFetch(respond: (url: string, init?: RequestInit) => Response): {
	fetcher: Fetcher;
	calls: Call[];
} {
	const calls: Call[] = [];
	return {
		calls,
		fetcher: async (url, init) => {
			calls.push({ url, init });
			return respond(url, init);
		}
	};
}

const json = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});

describe('createApiClient — success', () => {
	it('sends JSON and returns the parsed reply', async () => {
		const { fetcher, calls } = fakeFetch(() => json({ task: { id: 't1' } }));

		const result = await createApiClient(fetcher).request<{ task: { id: string } }>(
			'PUT',
			'/api/tasks/t1',
			{ completed: true }
		);

		expect(result).toEqual({ ok: true, data: { task: { id: 't1' } } });
		expect(calls).toEqual([
			{
				url: '/api/tasks/t1',
				init: {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: '{"completed":true}'
				}
			}
		]);
	});

	it('sends no body and no content type when there is nothing to send', async () => {
		const { fetcher, calls } = fakeFetch(() => json({ ok: true }));

		await createApiClient(fetcher).request('GET', '/api/tasks');

		expect(calls).toHaveLength(1);
		expect(calls[0].init?.method).toBe('GET');
		expect(calls[0].init?.headers).toBeUndefined();
		expect(calls[0].init?.body).toBeUndefined();
	});

	it('returns data undefined for an empty reply', async () => {
		const { fetcher } = fakeFetch(() => new Response(null, { status: 204 }));

		const result = await createApiClient(fetcher).request('DELETE', '/api/tasks/t1');

		expect(result).toEqual({ ok: true, data: undefined });
	});
});

describe('createApiClient — error copy', () => {
	it('uses the message the server sent', async () => {
		const { fetcher } = fakeFetch(() => json({ error: 'End date is before start' }, 400));

		const result = await createApiClient(fetcher).request('POST', '/api/events');

		expect(result).toEqual({ ok: false, status: 400, error: 'End date is before start' });
	});

	it('asks the person to sign in again when the session was rejected', async () => {
		for (const status of [401, 403]) {
			const { fetcher } = fakeFetch(() => json({}, status));

			const result = await createApiClient(fetcher).request('PUT', '/api/tasks/t1');

			expect(result).toEqual({
				ok: false,
				status,
				error: 'Your session expired. Sign in, then try again.'
			});
		}
	});

	it('asks for a connection check when the server failed', async () => {
		const { fetcher } = fakeFetch(() => json({}, 503));

		const result = await createApiClient(fetcher).request('POST', '/api/tasks');

		expect(result).toEqual({
			ok: false,
			status: 503,
			error: 'Check your connection (a VPN can block it), then try again.'
		});
	});

	it('asks for the fields to be rechecked on an unexplained 4xx', async () => {
		const { fetcher } = fakeFetch(() => json({}, 422));

		const result = await createApiClient(fetcher).request('POST', '/api/tasks');

		expect(result).toEqual({
			ok: false,
			status: 422,
			error: 'Check the details you entered, then try again.'
		});
	});

	it('names a fetch that never reached the server as a network problem', async () => {
		const client = createApiClient(async () => {
			throw new TypeError('Failed to fetch');
		});

		expect(await client.request('GET', '/api/tasks')).toEqual({
			ok: false,
			status: 0,
			error: 'Network problem. Try again.'
		});
	});

	it('treats a non-JSON error reply as unnamed rather than throwing', async () => {
		const { fetcher } = fakeFetch(
			() => new Response('<html>Bad gateway</html>', { status: 502 })
		);

		const result = await createApiClient(fetcher).request('GET', '/api/tasks');

		expect(result).toEqual({
			ok: false,
			status: 502,
			error: 'Check your connection (a VPN can block it), then try again.'
		});
	});
});
