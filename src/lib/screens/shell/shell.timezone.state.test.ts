/**
 * `ShellTimezoneState` in node: the once-per-user localStorage gate, the
 * `'UTC'`-only condition, the browser-zone guard, and the retry the legacy code
 * never made (it wrote the flag before the request).
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import type { ShellTimezonePort } from './shell.contract';
import { ShellTimezoneState, type ShellZoneStorage } from './shell.timezone.state.svelte.js';

function memoryStorage(): ShellZoneStorage & { readonly values: Map<string, string> } {
	const values = new Map<string, string>();
	return {
		values,
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => void values.set(key, value)
	};
}

function portOf(saves: string[], fail = false): ShellTimezonePort {
	return {
		save: async (zone) => {
			if (fail) throw new Error('refused');
			saves.push(zone);
		}
	};
}

describe('ShellTimezoneState.probe', () => {
	it('probes once per user, only while the zone is UTC, and retries after a failed save', async () => {
		const storage = memoryStorage();
		const saves: string[] = [];
		const deps = { userId: 'user-1', storage, resolveZone: () => 'America/Chicago' };

		const state = new ShellTimezoneState(portOf(saves), deps);
		expect(await state.probe('America/New_York')).toBe(false);
		expect(saves).toEqual([]);

		expect(await state.probe('UTC')).toBe(true);
		expect(saves).toEqual(['America/Chicago']);
		expect(storage.values.get('familyplanz:tzProbed:user-1')).toBe('1');

		// The flag stops the second mount.
		expect(await state.probe('UTC')).toBe(false);
		expect(saves).toHaveLength(1);
	});

	it('retries after a failed save and flags only the success', async () => {
		const storage = memoryStorage();
		const saves: string[] = [];
		const deps = { userId: 'user-2', storage, resolveZone: () => 'Europe/Berlin' };

		expect(await new ShellTimezoneState(portOf(saves, true), deps).probe('UTC')).toBe(false);
		expect(storage.values.has('familyplanz:tzProbed:user-2')).toBe(false);

		expect(await new ShellTimezoneState(portOf(saves), deps).probe('UTC')).toBe(true);
		expect(saves).toEqual(['Europe/Berlin']);
	});

	it('does nothing without a browser zone, and treats storage that throws as unprobed', async () => {
		const saves: string[] = [];
		const throwing: ShellZoneStorage = {
			getItem: () => {
				throw new Error('denied');
			},
			setItem: () => {
				throw new Error('denied');
			}
		};
		const noZone = new ShellTimezoneState(portOf(saves), {
			userId: 'user-3',
			storage: throwing,
			resolveZone: () => undefined
		});
		expect(await noZone.probe('UTC')).toBe(false);
		expect(await noZone.probe(null)).toBe(false);

		const utcBrowser = new ShellTimezoneState(portOf(saves), {
			userId: 'user-3',
			storage: throwing,
			resolveZone: () => 'UTC'
		});
		expect(await utcBrowser.probe('UTC')).toBe(false);
		expect(saves).toEqual([]);
	});
});
