/**
 * The Password / Email Link switch: a labelled group, `aria-pressed` on the
 * chosen button only, and the callback that carries the choice out.
 *
 * Doc: ../README.md#invariants
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { AUTH_METHOD_OPTIONS } from '../access.auth.rules';
import ModeToggle from './ModeToggle.svelte';

afterEach(cleanup);

describe('ModeToggle', () => {
	it('marks only the chosen method pressed', () => {
		render(ModeToggle, {
			options: AUTH_METHOD_OPTIONS,
			value: 'password',
			groupLabel: 'Login method'
		});
		const group = screen.getByRole('group', { name: 'Login method' });
		expect(group).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Password' }).getAttribute('aria-pressed')).toBe(
			'true'
		);
		expect(screen.getByRole('button', { name: 'Email Link' }).getAttribute('aria-pressed')).toBe(
			'false'
		);
	});

	it('carries the clicked method out', async () => {
		const seen: string[] = [];
		render(ModeToggle, {
			options: AUTH_METHOD_OPTIONS,
			value: 'password',
			onValueChange: (value: string) => seen.push(value)
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Email Link' }));
		expect(seen).toEqual(['email-link']);
	});
});
