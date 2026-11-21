import { describe, expect, it } from 'vitest';
import { createMemoryHttp } from './outboundHttp';

describe('createMemoryHttp', () => {
	it('records every request in call order', async () => {
		const http = createMemoryHttp();
		http.reply('https://example.test/a');
		http.reply('https://example.test/b');

		await http.request({
			url: 'https://example.test/a',
			headers: { 'user-agent': 'FamilyPlanz/1.0 (test@familyplanz.com)' }
		});
		await http.request({ url: 'https://example.test/b', method: 'POST', body: '{"q":1}' });

		expect(http.calls).toEqual([
			{
				url: 'https://example.test/a',
				headers: { 'user-agent': 'FamilyPlanz/1.0 (test@familyplanz.com)' }
			},
			{ url: 'https://example.test/b', method: 'POST', body: '{"q":1}' }
		]);
	});

	it('answers the scripted body and status', async () => {
		const http = createMemoryHttp();
		http.reply('https://example.test/ok', { body: '[{"display_name":"Paris"}]' });
		http.reply('https://example.test/down', { status: 503 });

		await expect(http.request({ url: 'https://example.test/ok' })).resolves.toEqual({
			status: 200,
			ok: true,
			body: '[{"display_name":"Paris"}]'
		});
		await expect(http.request({ url: 'https://example.test/down' })).resolves.toEqual({
			status: 503,
			ok: false,
			body: ''
		});
	});

	it('lets a later reply replace an earlier one', async () => {
		const http = createMemoryHttp();
		http.reply('https://example.test/a', { status: 500 });
		http.reply('https://example.test/a', { body: 'ok' });

		expect(await http.request({ url: 'https://example.test/a' })).toEqual({
			status: 200,
			ok: true,
			body: 'ok'
		});
	});

	it('throws for a URL the test never scripted', async () => {
		await expect(createMemoryHttp().request({ url: 'https://example.test/miss' })).rejects.toThrow(
			'No scripted HTTP reply for https://example.test/miss'
		);
	});
});
