import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/svelte';
import OfflineBanner from './OfflineBanner.svelte';

const offline = vi.hoisted(() => ({ online: true, pending: 0 }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- OfflineBanner calls isOnline/getPendingCount directly and has no injection seam, so the queue module is stubbed (the real one resolves browser globals per call).
vi.mock('$lib/kernel/client/offlineQueue', () => ({
	isOnline: () => offline.online,
	getPendingCount: () => Promise.resolve(offline.pending),
	subscribeToOnlineStatus: () => () => {}
}));

afterEach(cleanup);

// Issue 256: banner stays up while online (pending/synced) but the offline
// paragraph rendered unconditionally.
describe('OfflineBanner copy', () => {
	it('does not claim "offline" while online with changes pending', async () => {
		offline.online = true;
		offline.pending = 2;
		render(OfflineBanner);
		await waitFor(() => expect(screen.getByText(/2\s+changes waiting to sync/)).toBeInTheDocument());
		expect(screen.queryByText(/You're offline/)).not.toBeInTheDocument();
	});

	it('shows the offline explanation when offline', async () => {
		offline.online = false;
		offline.pending = 0;
		render(OfflineBanner);
		expect(screen.getByText(/You're offline/)).toBeInTheDocument();
	});
});
