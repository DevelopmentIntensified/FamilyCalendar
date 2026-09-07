import { describe, expect, it } from 'vitest';
import { buildSharedTargetText } from './shareTarget';

// Issue 027 — PWA share target. Webshare GET params: title/text/url.
// Research fact: on Android the `url` param is always empty — shared URLs
// arrive embedded inside `text` (sometimes `title`). The builder must
// never duplicate a URL that is already in the text blob.
describe('buildSharedTargetText', () => {
	it('prefers text over title', () => {
		expect(buildSharedTargetText('A link', 'soccer practice saturday 10am', '')).toBe(
			'soccer practice saturday 10am'
		);
	});

	it('falls back to title when text is empty', () => {
		expect(buildSharedTargetText('Soccer practice Saturday 10am', '', '')).toBe(
			'Soccer practice Saturday 10am'
		);
	});

	it('appends a url param when the URL is not already in the text (desktop/iOS)', () => {
		expect(buildSharedTargetText('Article', 'Read this tonight', 'https://x.co/a1b2')).toBe(
			'Read this tonight https://x.co/a1b2'
		);
	});

	it('does not duplicate a URL already embedded in the text (Android)', () => {
		const text = 'on for saturday 10am? https://m.me/r/abc123 with the schedule';
		expect(buildSharedTargetText('Messenger chat', text, '')).toBe(text);
		expect(buildSharedTargetText('Messenger chat', text, 'https://m.me/r/abc123')).toBe(text);
	});

	it('does not duplicate a URL embedded with surrounding punctuation', () => {
		const text = 'check this out: https://x.co/a1b2, pretty great';
		expect(buildSharedTargetText('', text, 'https://x.co/a1b2')).toBe(text);
	});

	it('uses the url param alone when text and title are empty', () => {
		expect(buildSharedTargetText('', '', 'https://x.co/a1b2')).toBe('https://x.co/a1b2');
	});

	it('returns empty string when every param is empty/blank', () => {
		expect(buildSharedTargetText('', '', '')).toBe('');
		expect(buildSharedTargetText('   ', '   ', '')).toBe('');
	});

	it('collapses newlines kept from long shared messages into spaces', () => {
		expect(buildSharedTargetText('', 'dinner friday\nat 7pm', '')).toBe('dinner friday at 7pm');
	});
});
