/**
 * The wire contract: the contact form schema and the `/api/contact` response
 * bodies. The 400 copy, the check order and the absent-vs-empty rules are the
 * legacy wire (`marketing.http.db.test.ts` pins them end to end), so the
 * endpoint must parse with exactly this schema.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { firstIssueMessage, z } from '$lib/kernel/validation/validators';
import {
	CONTACT_API_FAULT_MESSAGE,
	CONTACT_EMAIL_MESSAGE,
	CONTACT_HONEYPOT_MESSAGE,
	CONTACT_REQUIRED_MESSAGE,
	CONTACT_THROTTLED_MESSAGE,
	CheckoutPurchaseForm,
	ContactApiBody,
	ContactErrorResponse,
	ContactSentResponse
} from './marketing.contract';

function messageOf(schema: z.ZodType, value: unknown): string | null {
	const result = schema.safeParse(value);
	return result.success ? null : firstIssueMessage(result.error);
}

const valid = { name: 'Alex', email: 'alex@example.com', message: 'The grocery list is great.' };

describe('contact copy', () => {
	it('is the legacy wording, verbatim', () => {
		expect(CONTACT_THROTTLED_MESSAGE).toBe('Too many attempts. Try again shortly.');
		expect(CONTACT_HONEYPOT_MESSAGE).toBe('Invalid submission');
		expect(CONTACT_REQUIRED_MESSAGE).toBe('All fields are required');
		expect(CONTACT_EMAIL_MESSAGE).toBe('Please enter a valid email address');
		expect(CONTACT_API_FAULT_MESSAGE).toBe('Failed to send message. Please try again later.');
	});
});

describe('CheckoutPurchaseForm (POST /checkout?/purchase)', () => {
	it('reads both fields as text, first value when repeated, empty when absent', () => {
		expect(CheckoutPurchaseForm.parse({ planType: 'annual', finalPrice: '49' })).toEqual({
			planType: 'annual',
			finalPrice: '49'
		});
		expect(
			CheckoutPurchaseForm.parse({ planType: ['monthly', 'annual'], finalPrice: ['49'] })
		).toEqual({ planType: 'monthly', finalPrice: '49' });
		expect(CheckoutPurchaseForm.parse({})).toEqual({ planType: '', finalPrice: '' });
	});

	it('passes an unknown plan through for the action to refuse', () => {
		expect(CheckoutPurchaseForm.parse({ planType: 'weekly', finalPrice: 0 })).toEqual({
			planType: 'weekly',
			finalPrice: ''
		});
	});
});

describe('ContactApiBody (POST /api/contact)', () => {
	const schema = ContactApiBody;

	it('parses a complete form, an absent honeypot reading as empty', () => {
		expect(schema.parse(valid)).toEqual({ ...valid, website: '' });
	});

	it('treats an empty honeypot as absent', () => {
		expect(schema.parse({ ...valid, website: '' })).toEqual({ ...valid, website: '' });
	});

	it('keeps a first value when a field arrives twice, like FormData.get', () => {
		expect(schema.parse({ ...valid, name: ['Alex', 'Sam'] }).name).toBe('Alex');
	});

	it('trims nothing it passes on', () => {
		const padded = { name: ' Alex ', email: 'alex@example.com', message: '  Hi  ' };
		expect(schema.parse(padded)).toEqual({ ...padded, website: '' });
	});

	it('accepts a whitespace-only name: only an empty one is missing', () => {
		expect(schema.parse({ ...valid, name: '   ' }).name).toBe('   ');
	});

	it('sends a whitespace-only message (the /api door never trims)', () => {
		expect(schema.parse({ ...valid, message: '   ' }).message).toBe('   ');
	});

	type Refusal = {
		readonly why: string;
		readonly input: Record<string, unknown>;
		readonly message: string;
	};

	it.each<Refusal>([
		{
			why: 'a filled honeypot',
			input: { ...valid, website: 'http://spam.example' },
			message: CONTACT_HONEYPOT_MESSAGE
		},
		{
			why: 'a whitespace-only honeypot (any non-empty value is a bot)',
			input: { ...valid, website: ' ' },
			message: CONTACT_HONEYPOT_MESSAGE
		},
		{
			why: 'the honeypot before the required fields',
			input: { website: 'bot' },
			message: CONTACT_HONEYPOT_MESSAGE
		},
		{
			why: 'the honeypot before the address shape',
			input: { ...valid, email: 'nope', website: 'bot' },
			message: CONTACT_HONEYPOT_MESSAGE
		},
		{
			why: 'no name',
			input: { email: valid.email, message: valid.message },
			message: CONTACT_REQUIRED_MESSAGE
		},
		{
			why: 'no email',
			input: { name: valid.name, message: valid.message },
			message: CONTACT_REQUIRED_MESSAGE
		},
		{
			why: 'no message',
			input: { name: valid.name, email: valid.email },
			message: CONTACT_REQUIRED_MESSAGE
		},
		{ why: 'all three absent', input: {}, message: CONTACT_REQUIRED_MESSAGE },
		{ why: 'an empty name', input: { ...valid, name: '' }, message: CONTACT_REQUIRED_MESSAGE },
		{
			why: 'a non-string field (a file upload reads as empty)',
			input: { ...valid, name: 42 },
			message: CONTACT_REQUIRED_MESSAGE
		},
		{
			why: 'the required fields before the address shape',
			input: { ...valid, email: 'nope', message: '' },
			message: CONTACT_REQUIRED_MESSAGE
		},
		{
			why: 'text with no @',
			input: { ...valid, email: 'not-an-email' },
			message: CONTACT_EMAIL_MESSAGE
		},
		{
			why: 'no dot after the @',
			input: { ...valid, email: 'alex@example' },
			message: CONTACT_EMAIL_MESSAGE
		},
		{
			why: 'a space instead of the @',
			input: { ...valid, email: 'alex example.com' },
			message: CONTACT_EMAIL_MESSAGE
		},
		{
			why: 'a padded address (never trimmed)',
			input: { ...valid, email: ' alex@example.com' },
			message: CONTACT_EMAIL_MESSAGE
		}
	])('refuses $why', ({ input, message }) => {
		expect(messageOf(schema, input)).toBe(message);
	});
});

describe('responses', () => {
	it('parses 200 {success:true}', () => {
		expect(ContactSentResponse.parse({ success: true })).toEqual({ success: true });
	});

	it.each<[string, unknown]>([
		['success false', { success: false }],
		['no body', undefined],
		['an error body', { error: 'x' }]
	])('refuses %s as a sent response', (_label, value) => {
		expect(ContactSentResponse.safeParse(value).success).toBe(false);
	});

	it.each([
		CONTACT_HONEYPOT_MESSAGE,
		CONTACT_REQUIRED_MESSAGE,
		CONTACT_EMAIL_MESSAGE,
		CONTACT_THROTTLED_MESSAGE,
		CONTACT_API_FAULT_MESSAGE
	])('parses the refusal body {error: %s}', (error) => {
		expect(ContactErrorResponse.parse({ error })).toEqual({ error });
	});

	it('refuses an error body with no error', () => {
		expect(ContactErrorResponse.safeParse({ success: true }).success).toBe(false);
	});
});
