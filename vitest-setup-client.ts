import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// required for svelte5 + jsdom as jsdom does not support matchMedia
Object.defineProperty(window, 'matchMedia', {
	writable: true,
	enumerable: true,
	value: vi.fn().mockImplementation((query) => ({
		matches: false,
		media: query,
		onchange: null,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn()
	}))
});

// element.animate for svelte 5.57 transitions under jsdom (issue 197)
if (!Element.prototype.animate) {
	Object.defineProperty(Element.prototype, 'animate', {
		writable: true,
		enumerable: true,
		value(keyframes, options) {
			const animation = {
				keyframes,
				options,
				finished: Promise.resolve(),
				currentTime: options?.duration ?? null,
				effect: null,
				id: 'shim',
				pending: false,
				replaceState: 'active',
				oncancel: null,
				onfinish: null,
				onremove: null,
				cancel: vi.fn(),
				finish: () => {
					animation.pending = false;
					animation.onfinish?.();
				},
				play: vi.fn(),
				pause: vi.fn(),
				reverse: vi.fn(),
				updatePlaybackRate: vi.fn(),
				commitStyles: vi.fn(),
				getKeyframes: () => keyframes,
				getTiming: () => options ?? {},
				getEffect: () => animation.effect
			};
			setTimeout(() => animation.finish(), options?.duration ?? 0);
			return animation;
		}
	});
}

// add more mocks here if you need them
