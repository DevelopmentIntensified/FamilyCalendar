import { describe, expect, it } from 'vitest';
import { CEREBRAS_DEFAULT_API_URL, createCerebrasAi } from './cerebrasAi.server';

type Call = { readonly url: string; readonly init: RequestInit };

function recordingFetcher(
	content: string | { title: string } = '{"title":"Dentist"}',
	status = 200
) {
	const calls: Call[] = [];
	const fetcher: typeof fetch = async (input, init) => {
		calls.push({ url: String(input), init: init ?? {} });
		return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
			status,
			headers: { 'content-type': 'application/json' }
		});
	};
	return { calls, fetcher };
}

const config = { apiKey: 'csk_test_key', model: 'gpt-oss-120b' };

describe('createCerebrasAi', () => {
	it('posts the legacy Cerebras chat body and answers the parsed object', async () => {
		const { calls, fetcher } = recordingFetcher();
		const ai = createCerebrasAi(config, fetcher);

		const reply = await ai.chatJson('Extract the event.', 'Dentist Tuesday 3pm');

		expect(reply).toEqual({ title: 'Dentist' });
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe(CEREBRAS_DEFAULT_API_URL);
		expect(calls[0].init.method).toBe('POST');
		expect(calls[0].init.headers).toEqual({
			'Content-Type': 'application/json',
			Authorization: 'Bearer csk_test_key'
		});
		expect(JSON.parse(String(calls[0].init.body))).toEqual({
			model: 'gpt-oss-120b',
			messages: [
				{ role: 'system', content: 'Extract the event.' },
				{ role: 'user', content: 'Dentist Tuesday 3pm' }
			],
			response_format: { type: 'json_object' }
		});
	});

	it('honours an endpoint override', async () => {
		const { calls, fetcher } = recordingFetcher();
		const ai = createCerebrasAi(
			{ ...config, apiUrl: 'https://cerebras.example.test/v1/chat' },
			fetcher
		);

		await ai.chatJson('s', 'u');

		expect(calls[0].url).toBe('https://cerebras.example.test/v1/chat');
	});

	it('makes no request and answers null without a key', async () => {
		const { calls, fetcher } = recordingFetcher();
		const ai = createCerebrasAi({ ...config, apiKey: null }, fetcher);

		expect(ai.configured()).toBe(false);
		await expect(ai.chatJson('s', 'u')).resolves.toBeNull();
		expect(calls).toEqual([]);
	});

	it('answers null for a refused request, a non-string content and invalid JSON', async () => {
		const refused = recordingFetcher('{}', 422);
		await expect(
			createCerebrasAi(config, refused.fetcher).chatJson('s', 'u')
		).resolves.toBeNull();

		const objectContent = recordingFetcher({ title: 'Dentist' });
		await expect(
			createCerebrasAi(config, objectContent.fetcher).chatJson('s', 'u')
		).resolves.toBeNull();

		const invalidJson = recordingFetcher('not json');
		await expect(
			createCerebrasAi(config, invalidJson.fetcher).chatJson('s', 'u')
		).resolves.toBeNull();
	});

	it('answers null when the request itself throws', async () => {
		const fetcher: typeof fetch = async () => {
			throw new Error('network down');
		};

		await expect(createCerebrasAi(config, fetcher).chatJson('s', 'u')).resolves.toBeNull();
	});

	it('is configured exactly when it has a key', () => {
		expect(createCerebrasAi(config).configured()).toBe(true);
	});
});
