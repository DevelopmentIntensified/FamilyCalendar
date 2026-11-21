import { describe, expect, it } from 'vitest';
import { createFetchOutboundHttp } from './fetchOutboundHttp.server';

type Call = { readonly url: string; readonly init: RequestInit };

function recordingFetcher(body = '[]', status = 200) {
	const calls: Call[] = [];
	const fetcher: typeof fetch = async (input, init) => {
		calls.push({ url: String(input), init: init ?? {} });
		return new Response(body, { status });
	};
	return { calls, fetcher };
}

describe('createFetchOutboundHttp', () => {
	it('passes the method, headers, body and a timeout signal to fetch', async () => {
		const { calls, fetcher } = recordingFetcher('[{"display_name":"Paris"}]');
		const http = createFetchOutboundHttp({}, fetcher);

		const response = await http.request({
			url: 'https://nominatim.openstreetmap.org/search?q=Paris',
			headers: { 'User-Agent': 'FamilyPlanz/1.0 (test@familyplanz.com)' }
		});

		expect(response).toEqual({ status: 200, ok: true, body: '[{"display_name":"Paris"}]' });
		expect(calls[0].url).toBe('https://nominatim.openstreetmap.org/search?q=Paris');
		expect(calls[0].init.method).toBe('GET');
		expect(calls[0].init.headers).toEqual({
			'User-Agent': 'FamilyPlanz/1.0 (test@familyplanz.com)'
		});
		expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
	});

	it('carries a POST body and its method', async () => {
		const { calls, fetcher } = recordingFetcher('{}');
		const http = createFetchOutboundHttp({}, fetcher);

		await http.request({
			url: 'https://example.test/api',
			method: 'POST',
			body: '{"q":1}',
			headers: { 'content-type': 'application/json' }
		});

		expect(calls[0].init.method).toBe('POST');
		expect(calls[0].init.body).toBe('{"q":1}');
	});

	it('reports a non-2xx status as a response, not a throw', async () => {
		const { fetcher } = recordingFetcher('nope', 503);
		const http = createFetchOutboundHttp({}, fetcher);

		await expect(http.request({ url: 'https://example.test/down' })).resolves.toEqual({
			status: 503,
			ok: false,
			body: 'nope'
		});
	});

	it('propagates a network failure so the caller answers its legacy empty result', async () => {
		const fetcher: typeof fetch = async () => {
			throw new Error('network down');
		};
		const http = createFetchOutboundHttp({}, fetcher);

		await expect(http.request({ url: 'https://example.test/a' })).rejects.toThrow('network down');
	});
});
