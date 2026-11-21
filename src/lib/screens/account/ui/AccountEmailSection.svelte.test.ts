/**
 * Email as the reader sees it: an Anonymous Account gets the Claim CTA and no
 * change form (`#242`); a real account gets its address, the verification
 * status and the one button.
 *
 * Doc: ./README.md#invariants
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import AccountEmailSection from './AccountEmailSection.svelte';

afterEach(cleanup);

const enhance = () => ({ destroy() {} });

describe('AccountEmailSection', () => {
	it('a guest gets no placeholder address, no change-email form, a claim link instead', () => {
		render(AccountEmailSection, {
			props: {
				model: { section: 'email' as const, email: null, emailVerified: false, isAnonymous: true },
				enhance
			}
		});

		expect(document.querySelector('form')).toBeNull();
		expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
		expect(screen.getByText("No email yet — you're using a guest calendar.")).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Save your calendar with an email' })).toHaveAttribute(
			'href',
			'/claim'
		);
	});

	it('a real account gets the address, its status and the update button', () => {
		render(AccountEmailSection, {
			props: {
				model: {
					section: 'email' as const,
					email: 'ada@example.test',
					emailVerified: true,
					isAnonymous: false
				},
				enhance
			}
		});

		expect(screen.getByLabelText('Email')).toHaveValue('ada@example.test');
		expect(screen.getByText('Status: Verified')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Update Email' })).toBeInTheDocument();
	});

	it('says Not Verified when the address is unverified', () => {
		render(AccountEmailSection, {
			props: {
				model: {
					section: 'email' as const,
					email: 'ada@example.test',
					emailVerified: false,
					isAnonymous: false
				},
				enhance
			}
		});
		expect(screen.getByText('Status: Not Verified')).toBeInTheDocument();
	});
});
