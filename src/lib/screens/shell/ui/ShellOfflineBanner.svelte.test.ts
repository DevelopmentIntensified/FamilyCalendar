/**
 * The offline banner's three states as the user reads them: the offline
 * explanation only while actually offline, the pending sentence, and the
 * "Synced N changes." receipt — with singular/plural copy.
 *
 * Doc: ../README.md#invariants
 */
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { manualScheduler } from '$lib/kernel/testing/manualScheduler';
import type { ShellOfflinePort } from '../shell.contract';
import { ShellOfflineState } from '../shell.offline.state.svelte.js';
import ShellOfflineBanner from './ShellOfflineBanner.svelte';

afterEach(cleanup);

function offlinePortOf(pending: number): ShellOfflinePort {
	return {
		isOnline: () => true,
		pendingCount: async () => pending,
		subscribe: () => () => {}
	};
}

function stateOf(pending: number): ShellOfflineState {
	return new ShellOfflineState(offlinePortOf(pending), {
		schedule: manualScheduler().schedule
	});
}

describe('ShellOfflineBanner', () => {
	it('shows the pending sentence without claiming offline', () => {
		const state = stateOf(0);
		state.pending = 2;
		render(ShellOfflineBanner, { props: { state, stacked: true } });
		expect(screen.getByRole('status')).toHaveTextContent('2 changes waiting to sync.');
		expect(screen.queryByText(/You're offline/)).toBeNull();
	});

	it('explains the offline cache and the automatic sync while offline', () => {
		const state = stateOf(0);
		state.online = false;
		render(ShellOfflineBanner, { props: { state } });
		expect(screen.getByRole('status')).toHaveTextContent("You're offline");
		expect(screen.getByRole('status')).toHaveTextContent('sync automatically');
	});

	it('stays out of the way with nothing to say, and singularises the receipt', () => {
		const quiet = stateOf(0);
		render(ShellOfflineBanner, { props: { state: quiet, stacked: true } });
		expect(screen.queryByRole('status')).toBeNull();
		cleanup();

		const synced = stateOf(0);
		synced.synced = 1;
		render(ShellOfflineBanner, { props: { state: synced } });
		expect(screen.getByRole('status')).toHaveTextContent('Synced 1 change.');
	});
});
