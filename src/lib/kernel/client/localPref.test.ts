import { describe, expect, it } from 'vitest';
import { localPref } from './localPref';

function fakeStorage(initial: Record<string, string> = {}) {
	const entries = new Map(Object.entries(initial));
	return {
		entries,
		getItem: (key: string) => entries.get(key) ?? null,
		setItem: (key: string, value: string) => {
			entries.set(key, value);
		},
		removeItem: (key: string) => {
			entries.delete(key);
		}
	};
}

const parseString = (raw: unknown): string | null => (typeof raw === 'string' ? raw : null);

describe('localPref', () => {
	it('reads back what was written', () => {
		const storage = fakeStorage();
		const pref = localPref({
			key: 'calendar.view',
			version: 1,
			fallback: 'week',
			parse: parseString,
			storage
		});

		pref.write('month');

		expect(storage.entries.get('calendar.view')).toBe(JSON.stringify({ v: 1, value: 'month' }));
		expect(pref.read()).toBe('month');
	});

	it('falls back when the stored version is not the current one', () => {
		const storage = fakeStorage({
			'calendar.view': JSON.stringify({ v: 0, value: 'month' })
		});
		const pref = localPref({
			key: 'calendar.view',
			version: 1,
			fallback: 'week',
			parse: parseString,
			storage
		});

		expect(pref.read()).toBe('week');
	});

	it('falls back on junk JSON', () => {
		const storage = fakeStorage({ 'calendar.view': '{not json' });
		const pref = localPref({
			key: 'calendar.view',
			version: 1,
			fallback: 'week',
			parse: parseString,
			storage
		});

		expect(pref.read()).toBe('week');
	});

	it('falls back when parse rejects the value', () => {
		const storage = fakeStorage({
			'calendar.view': JSON.stringify({ v: 1, value: 42 })
		});
		const pref = localPref({
			key: 'calendar.view',
			version: 1,
			fallback: 'week',
			parse: parseString,
			storage
		});

		expect(pref.read()).toBe('week');
	});

	it('never throws with a storage that refuses access', () => {
		const refusing = {
			getItem: () => {
				throw new Error('denied');
			},
			setItem: () => {
				throw new Error('denied');
			},
			removeItem: () => {
				throw new Error('denied');
			}
		};
		const pref = localPref({
			key: 'calendar.view',
			version: 1,
			fallback: 'week',
			parse: parseString,
			storage: refusing
		});

		expect(pref.read()).toBe('week');
		expect(() => pref.write('month')).not.toThrow();
		expect(() => pref.clear()).not.toThrow();
	});

	it('falls back when there is no storage at all (SSR)', () => {
		const pref = localPref({
			key: 'calendar.view',
			version: 1,
			fallback: 'week',
			parse: parseString,
			storage: null
		});

		expect(pref.read()).toBe('week');
		expect(() => pref.write('month')).not.toThrow();
		expect(() => pref.clear()).not.toThrow();
	});

	it('clear removes the stored value', () => {
		const storage = fakeStorage({
			'calendar.view': JSON.stringify({ v: 1, value: 'month' })
		});
		const pref = localPref({
			key: 'calendar.view',
			version: 1,
			fallback: 'week',
			parse: parseString,
			storage
		});

		pref.clear();

		expect(storage.entries.has('calendar.view')).toBe(false);
		expect(pref.read()).toBe('week');
	});
});
