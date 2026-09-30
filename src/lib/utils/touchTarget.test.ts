import { describe, it, expect } from 'vitest';
import { measureBox, MIN_TOUCH } from './touchTarget';

// Numbers, not vibes. Each row is the class chain → the border-box height a
// browser derives from it (Tailwind v3 defaults: 16px root, rem spacing scale,
// `normal` line-height ≈ 1.2em for the system sans stack).
const HEIGHTS: [string, number][] = [
	['px-1.5 py-1 text-[11px]', 21.2],
	['rounded-md border border-slate-200 px-1.5 py-1 text-[11px] font-medium', 23.2],
	['rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium', 23.2],
	['rounded-md px-2.5 py-1.5 text-[11px] font-semibold', 25.2],
	['rounded-md px-1.5 py-1 text-[11px] text-slate-400', 21.2],
	['px-2 py-0.5 text-[10px] font-medium', 16],
	['px-1.5 py-1 text-[11px] font-semibold leading-tight', 21.75],
	['rounded-md px-1.5 py-1 text-[11px] min-h-11', 44],
	['rounded-full border px-3.5 text-sm font-medium min-h-[44px]', 44]
];

describe('measureBox', () => {
	it.each(HEIGHTS)('measures %s as %spx', (className, expected) => {
		expect(measureBox(className).height).toBeCloseTo(expected, 2);
	});

	it('prefers an explicit h-* over content height', () => {
		expect(measureBox('flex h-11 w-11 items-center').height).toBe(44);
	});

	it('reports width only when the chain pins it', () => {
		expect(measureBox('flex h-11 w-11 shrink-0 items-center').width).toBe(44);
		expect(measureBox('px-1.5 py-1 text-[11px]').width).toBeNull();
	});

	it('ignores tokens it cannot resolve instead of guessing', () => {
		expect(measureBox('h-full w-screen py-1 text-[11px]').height).toBeCloseTo(21.2, 2);
	});
});

describe('MIN_TOUCH', () => {
	it('is the 44px WCAG 2.5.5 / Apple HIG minimum', () => {
		expect(MIN_TOUCH).toBe(44);
	});
});
