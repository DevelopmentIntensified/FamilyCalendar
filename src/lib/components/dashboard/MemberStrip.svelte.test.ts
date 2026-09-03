import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import MemberStrip from './MemberStrip.svelte';

afterEach(() => {
	cleanup();
});

describe('MemberStrip day-aware heading', () => {
	const members = [{ userId: 'u1', firstName: 'Ada', lastName: 'A', openTasksToday: 1, attendingToday: false }];

	it('says "Today in the Family" for today', () => {
		render(MemberStrip, { props: { members, isToday: true } });
		expect(screen.getByText('Today in the Family')).toBeInTheDocument();
	});

	it('says "Family on this day" for other days', () => {
		render(MemberStrip, { props: { members, isToday: false } });
		expect(screen.getByText('Family on this day')).toBeInTheDocument();
	});
});
