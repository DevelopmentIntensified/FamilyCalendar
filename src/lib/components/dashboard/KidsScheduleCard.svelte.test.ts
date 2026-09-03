import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import KidsScheduleCard from './KidsScheduleCard.svelte';

afterEach(() => {
	cleanup();
});

describe('KidsScheduleCard day-aware empty state', () => {
	it('labels today vs other days', () => {
		const { unmount } = render(KidsScheduleCard, { props: { events: [], isToday: true } });
		expect(screen.getByText("No kids' events today")).toBeInTheDocument();
		unmount();
		render(KidsScheduleCard, { props: { events: [], isToday: false } });
		expect(screen.getByText("No kids' events this day")).toBeInTheDocument();
	});
});
