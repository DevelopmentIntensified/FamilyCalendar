/**
 * AI port + in-memory adapter. Services reach the model through `ctx.ai`, so
 * no module imports a provider and a test scripts exactly what comes back.
 *
 * One completion per call, the shape the legacy `services/llm.ts` callers use:
 * a system prompt, a user prompt, and a parsed JSON object — or `null` for
 * every failure the legacy adapter swallowed (no key, a refused request, a
 * reply without string content, invalid JSON). Callers validate the object;
 * `null` is never retried here.
 *
 * Doc: src/lib/kernel/README.md#ai
 */
import type { JsonValue } from '../validation/validators';

/** One JSON-mode completion: the parsed object, or `null` (the legacy failure value). */
export type ChatJson = Record<string, JsonValue> | null;

export type AiCall = {
	readonly system: string;
	readonly user: string;
};

export type Ai = {
	/** Whether a key is configured at all; `chatJson` answers `null` without one. */
	configured(): boolean;
	chatJson(system: string, user: string): Promise<ChatJson>;
};

export type MemoryAi = Ai & {
	/** Every completion asked for, in order (tests). */
	readonly calls: AiCall[];
	/** Queues what the next completions answer, in order; past the queue every call answers `null`. */
	script(...replies: ChatJson[]): void;
};

export function createMemoryAi(options: { readonly configured?: boolean } = {}): MemoryAi {
	const configured = options.configured ?? true;
	const calls: AiCall[] = [];
	const queued: ChatJson[] = [];
	return {
		calls,
		configured: () => configured,
		chatJson: async (system, user) => {
			calls.push({ system, user });
			return queued.shift() ?? null;
		},
		script: (...replies) => {
			queued.push(...replies);
		}
	};
}
