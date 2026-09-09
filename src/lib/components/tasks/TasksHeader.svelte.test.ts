import { render, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import TasksHeader from './TasksHeader.svelte';

describe('TasksHeader', () => {
	afterEach(cleanup);

	it('renders open/completed counts', () => {
		render(TasksHeader, { props: { openCount: 3, completedCount: 5, warnings: [] } });
		expect(screen.getByText('Tasks')).toBeTruthy();
		expect(screen.getByText(/3 tasks open · 5 completed/)).toBeTruthy();
	});

	it('singularizes one open task and shows warnings', () => {
		render(TasksHeader, { props: { openCount: 1, completedCount: 0, warnings: ['events'] } });
		expect(screen.getByText(/1 task open · 0 completed/)).toBeTruthy();
		expect(screen.getByRole('alert')).toBeTruthy();
	});

	it('hides the warning banner when clean', () => {
		render(TasksHeader, { props: { openCount: 0, completedCount: 0, warnings: [] } });
		expect(screen.queryByRole('alert')).toBeNull();
	});
});
