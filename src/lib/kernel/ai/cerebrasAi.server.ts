/**
 * Real `Ai`: the Cerebras JSON-mode chat completion behind the legacy
 * `services/llm.ts` — same endpoint, same request body, same `null` for every
 * failure. Called directly so the kernel takes no SDK dependency and a test
 * injects `fetcher` instead of mocking a module.
 *
 * Config is a parameter, never `process.env` (rule R6): src/lib/app reads
 * `CEREBRAS_API_KEY`, `CEREBRAS_MODEL` and `CEREBRAS_API_URL` and builds this
 * adapter.
 *
 * Doc: src/lib/kernel/README.md#ai
 */
import { z, type JsonValue } from '../validation/validators';
import type { Ai, ChatJson } from './ai';

export type CerebrasAiConfig = {
	/** Cerebras API key (`CEREBRAS_API_KEY`); `null` means not configured. */
	readonly apiKey: string | null;
	/** Model id (`CEREBRAS_MODEL`, legacy default `gpt-oss-120b`). */
	readonly model: string;
	/** Overrides the public endpoint (`CEREBRAS_API_URL`). */
	readonly apiUrl?: string;
};

export const CEREBRAS_DEFAULT_API_URL = 'https://api.cerebras.ai/v1/chat/completions';

/** The completion body as far as this adapter reads it. */
type ChatCompletionBody = {
	readonly choices?: readonly { readonly message?: { readonly content?: unknown } }[];
};

/**
 * One JSON-mode completion. Any failure — no key, a network error, a non-2xx,
 * a body without string content, content that is not JSON — answers `null`,
 * exactly as the legacy adapter did; the caller validates and logs.
 */
export function createCerebrasAi(
	config: CerebrasAiConfig,
	fetcher: typeof fetch = fetch
): Ai {
	return {
		configured: () => Boolean(config.apiKey),

		async chatJson(system: string, user: string): Promise<ChatJson> {
			const apiKey = config.apiKey;
			if (!apiKey) return null;

			try {
				const response = await fetcher(config.apiUrl ?? CEREBRAS_DEFAULT_API_URL, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${apiKey}`
					},
					body: JSON.stringify({
						model: config.model,
						messages: [
							{ role: 'system', content: system },
							{ role: 'user', content: user }
						],
						response_format: { type: 'json_object' }
					})
				});
				if (!response.ok) return null;

				const payload: ChatCompletionBody = await response.json();
				const content = z.string().safeParse(payload.choices?.[0]?.message?.content);
				if (!content.success) return null;
				// SAFETY: the legacy adapter returned whatever JSON.parse produced; callers validate it against their contract.
				return JSON.parse(content.data) as Record<string, JsonValue>;
			} catch {
				// The legacy failure value: an unreadable reply is "no answer", not a fault.
				return null;
			}
		}
	};
}
