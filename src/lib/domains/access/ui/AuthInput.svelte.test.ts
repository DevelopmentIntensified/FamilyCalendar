/**
 * The labelled auth field as the reader (and a screen reader) meets it: a real
 * `<label for>`, the inline error tied by `aria-describedby`, `aria-invalid`
 * only while it shows, and the callback that carries the typed value out.
 *
 * Doc: ../README.md#invariants
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import AuthInput from './AuthInput.svelte';

afterEach(cleanup);

describe('AuthInput', () => {
	it('labels the input and carries the typed value out', async () => {
		const seen: string[] = [];
		render(AuthInput, {
			id: 'email',
			label: 'Email',
			value: '',
			onValueChange: (value: string) => seen.push(value)
		});
		const input = screen.getByLabelText('Email') as HTMLInputElement;
		expect(input.id).toBe('email');
		await fireEvent.input(input, { target: { value: 'a@b.co' } });
		expect(seen).toEqual(['a@b.co']);
	});

	it('ties an inline error to the input and marks it invalid', () => {
		render(AuthInput, {
			id: 'code',
			label: 'Login code',
			value: '12',
			error: 'That code is wrong or expired'
		});
		const input = screen.getByLabelText('Login code');
		expect(input.getAttribute('aria-invalid')).toBe('true');
		expect(input.getAttribute('aria-describedby')).toBe('code-error');
		expect(document.getElementById('code-error')?.textContent).toBe('That code is wrong or expired');
	});

	it('leaves a clean field unmarked', () => {
		render(AuthInput, { id: 'email2', label: 'Email', value: '', error: '' });
		const input = screen.getByLabelText('Email');
		expect(input.getAttribute('aria-invalid')).toBeNull();
		expect(input.getAttribute('aria-describedby')).toBeNull();
	});
});
