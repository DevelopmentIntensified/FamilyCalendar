/**
 * billing AI-allowance rules: the counter's period, the remaining count, the
 * monthly cap refusal and the free/paid split the parsing budget turns on.
 * Pure: `now` is a parameter; the repo reads and writes the counter.
 *
 * Doc: ./README.md#invariants
 */
import type { AiUsage } from './billing.contract';

/**
 * The counter's period: month 1-12 and the calendar year, in UTC. The legacy
 * code used the process-local getters on a UTC server; naming UTC keeps the
 * period independent of wherever the process runs.
 */
export function aiPeriod(now: Date): { readonly month: number; readonly year: number } {
	return { month: now.getUTCMonth() + 1, year: now.getUTCFullYear() };
}

/** `remaining = max(0, limit - used)` — an over-cap counter never reads negative. */
export function aiAllowance(used: number, limit: number): AiUsage {
	return { used, limit, remaining: Math.max(0, limit - used) };
}

/** A spent allowance refuses with the monthly cap copy; a positive one is null. */
export function aiLimitRefusal(allowance: AiUsage): string | null {
	if (allowance.remaining > 0) return null;
	return `AI feature limit reached (${allowance.limit} per month). Upgrade to unlock unlimited AI.`;
}

/** Paid = any active tier that is not the free tier; no subscription row is free. */
export function isPaidTier(tierName: string | null | undefined): boolean {
	return tierName != null && tierName !== 'free';
}
