import { render, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import AccountEmailSection from './AccountEmailSection.svelte';

afterEach(cleanup);

describe('AccountEmailSection (#242)', () => {
	it('guest: no placeholder address, no change-email form, a claim link instead', () => {
		render(AccountEmailSection, {
			props: { user: { email: 'g1@anonymous.placeholder.invalid', emailVerified: false } }
		});
		expect(document.body.innerHTML).not.toContain('anonymous.placeholder.invalid');
		expect(document.querySelector('form[action="?/updateEmail"]')).toBeNull();
		expect(document.body.textContent).toContain('No email yet');
		expect(document.querySelector('a[href="/claim"]')).toBeTruthy();
	});

	it('registered: change-email form prefilled with the real address', () => {
		render(AccountEmailSection, { props: { user: { email: 'a@b.co', emailVerified: true } } });
		const input = document.querySelector('input[name="email"]') as HTMLInputElement;
		expect(input.value).toBe('a@b.co');
		expect(document.querySelector('a[href="/claim"]')).toBeNull();
	});
});
