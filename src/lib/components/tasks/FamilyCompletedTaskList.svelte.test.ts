import { render, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import FamilyCompletedTaskList from './FamilyCompletedTaskList.svelte';

afterEach(cleanup);

describe('FamilyCompletedTaskList', () => {
	it('renders nothing when empty', () => {
		const { container } = render(FamilyCompletedTaskList, { props: { tasks: [] } });
		expect(container.innerHTML).not.toContain('Completed');
	});

	it('lists completed titles with count, tags, and assignee', () => {
		render(FamilyCompletedTaskList, {
			props: {
				tasks: [
					{
						id: 't1',
						title: 'Done thing',
						tags: ['yard'],
						assignedTo: 'u2',
						assigneeFirstName: 'Bo',
						assigneeLastName: 'Jo'
					}
				]
			}
		});
		expect(screen.getByText('Completed (1)')).toBeInTheDocument();
		expect(screen.getByText('Done thing')).toBeInTheDocument();
		expect(screen.getByText('#yard')).toBeInTheDocument();
		expect(screen.getByText('Bo')).toBeInTheDocument();
	});
});
