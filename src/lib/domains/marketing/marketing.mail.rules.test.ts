/**
 * The contact mail's pure rules: the legacy address shape, the subject and the
 * escaped body. Expected values are the legacy contract
 * (`(marketing)/contact/page.server.test.ts`, `marketing.http.db.test.ts`),
 * not the output of the code.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	CONTACT_RECIPIENT,
	contactMessageHtml,
	contactSubject,
	isContactEmail
} from './marketing.mail.rules';

describe('CONTACT_RECIPIENT', () => {
	it('is the support inbox', () => {
		expect(CONTACT_RECIPIENT).toBe('hello@familyplanz.com');
	});
});

describe('isContactEmail', () => {
	type Case = { readonly address: string; readonly valid: boolean; readonly why: string };

	it.each<Case>([
		{ address: 'alex@example.com', valid: true, why: 'a plain address' },
		{ address: 'b@c.de', valid: true, why: 'single-letter parts' },
		{ address: 'a@b.c', valid: true, why: 'a one-letter top level is accepted (legacy shape)' },
		{ address: 'not-an-email', valid: false, why: 'no @' },
		{ address: 'alex@example', valid: false, why: 'no dot after the @' },
		{ address: 'alex example.com', valid: false, why: 'a space and no @' },
		{ address: ' alex@example.com', valid: false, why: 'leading space: never trimmed' },
		{ address: 'alex@example.com ', valid: false, why: 'trailing space: never trimmed' },
		{ address: 'al ex@example.com', valid: false, why: 'a space inside the local part' },
		{ address: 'a@@b.co', valid: false, why: 'two @' },
		{ address: '@example.com', valid: false, why: 'nothing before the @' },
		{ address: 'alex@.com', valid: false, why: 'nothing between the @ and the dot' },
		{ address: 'alex@example.', valid: false, why: 'nothing after the dot' },
		{ address: '', valid: false, why: 'empty' }
	])('$address is $valid ($why)', ({ address, valid }) => {
		expect(isContactEmail(address)).toBe(valid);
	});
});

describe('contactSubject', () => {
	it.each([
		{ name: 'Alex', subject: 'New Contact Form Submission from Alex' },
		{ name: 'A', subject: 'New Contact Form Submission from A' },
		{ name: 'A<b>', subject: 'New Contact Form Submission from A<b>' }
	])('names the sender: $name', ({ name, subject }) => {
		expect(contactSubject(name)).toBe(subject);
	});
});

describe('contactMessageHtml', () => {
	const sender = { name: 'Alex', email: 'alex@example.com', message: 'Hi there' };

	it('shows the name, the address and the message under their labels', () => {
		const html = contactMessageHtml(sender);
		expect(html).toContain('<p><strong>Name:</strong> Alex</p>');
		expect(html).toContain('<p><strong>Email:</strong> alex@example.com</p>');
		expect(html).toContain('<p><strong>Message:</strong></p>');
		expect(html).toContain('<p style="white-space: pre-wrap;">Hi there</p>');
		expect(html).toContain('New Contact Form Submission</h2>');
	});

	it.each([
		{ field: 'name', input: { ...sender, name: 'A<b>' }, shows: 'A&lt;b&gt;', raw: 'A<b>' },
		{
			field: 'email',
			input: { ...sender, email: 'a"@b.co' },
			shows: 'a&quot;@b.co',
			raw: 'a"@b.co'
		},
		{
			field: 'message',
			input: { ...sender, message: '<script>' },
			shows: '&lt;script&gt;',
			raw: '<script>'
		}
	])('escapes the $field', ({ input, shows, raw }) => {
		const html = contactMessageHtml(input);
		expect(html).toContain(shows);
		expect(html).not.toContain(raw);
	});

	it.each([
		{ character: '&', escaped: '&amp;' },
		{ character: '<', escaped: '&lt;' },
		{ character: '>', escaped: '&gt;' },
		{ character: '"', escaped: '&quot;' },
		{ character: "'", escaped: '&#39;' }
	])('writes $character as $escaped', ({ character, escaped }) => {
		expect(contactMessageHtml({ ...sender, message: `a${character}b` })).toContain(
			`>a${escaped}b</p>`
		);
	});

	it('escapes the ampersand first, so an entity the visitor typed stays visible text', () => {
		expect(contactMessageHtml({ ...sender, message: '&lt;' })).toContain('>&amp;lt;</p>');
	});

	it('keeps the message line breaks for the pre-wrap paragraph', () => {
		expect(contactMessageHtml({ ...sender, message: 'one\ntwo' })).toContain('>one\ntwo</p>');
	});
});
