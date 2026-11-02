import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { readable } from 'svelte/store';

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/stores is framework-injected; no DI seam exists.
vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://test.com/account#security') })
}));

import AccountPage from './+page.svelte';

afterEach(cleanup);

const data = { user: { id: 'u1', email: 'a@b.co', firstName: 'A', lastName: 'B' } };

describe('/account form banner (#252)', () => {
	it('signed-out post ({ error }) shows the error text, not an empty red banner', () => {
		render(AccountPage, {
			props: { data, form: { success: false, error: 'Not signed in' } } as never
		});
		const banner = document.querySelector('.bg-red-50')!;
		expect(banner).toBeTruthy();
		expect(banner.textContent?.trim()).toContain('Not signed in');
	});

	it('still renders { message } failures', () => {
		render(AccountPage, {
			props: { data, form: { success: false, message: 'Valid email is required' } } as never
		});
		expect(document.querySelector('.bg-red-50')!.textContent).toContain('Valid email is required');
	});
});
