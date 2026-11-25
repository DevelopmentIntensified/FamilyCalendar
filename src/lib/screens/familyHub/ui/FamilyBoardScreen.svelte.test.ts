/**
 * The Family Task Board screen: the heading, the waiting-for-your-response
 * banner, the two tabs and the render of both scopes — one card per assignee,
 * the Nobody card, and the completed heading's TRUE count (Q-091).
 *
 * Doc: ../../README.md#invariants
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { TasksApi } from '$lib/domains/tasks/index';
import { buildFamilyBoardModel, buildFamilyBoardTaskWire } from '../familyHub.ui.fixtures';
import FamilyBoardScreen from './FamilyBoardScreen.svelte';

afterEach(cleanup);

function fakeApi(overrides: Partial<TasksApi> = {}): TasksApi {
	const unexpected = async () => {
		throw new Error('unexpected api call');
	};
	return {
		listForEvent: unexpected,
		create: unexpected,
		update: unexpected,
		remove: unexpected,
		clearCompleted: unexpected,
		listCategories: unexpected,
		addCategory: unexpected,
		renameCategory: unexpected,
		removeCategory: unexpected,
		focusCommand: unexpected,
		listUnabsorbedSessions: unexpected,
		...overrides
	};
}

function board() {
	const model = buildFamilyBoardModel({
		tasks: [
			buildFamilyBoardTaskWire({
				id: 'pending',
				title: 'Book the vet',
				assignedTo: 'u_ann',
				assignmentStatus: 'pending'
			}),
			buildFamilyBoardTaskWire({
				id: 'nobody',
				title: 'Fix the gate',
				assignedTo: null,
				userId: 'u_bob'
			}),
			buildFamilyBoardTaskWire({
				id: 'done',
				title: 'Mow the lawn',
				completedAt: '2026-09-20 10:00:00+00'
			})
		],
		publicTasks: [buildFamilyBoardTaskWire({ id: 'public', title: 'Piano practice' })],
		completedTotal: 7
	});
	render(FamilyBoardScreen, { props: { data: model, refresh: async () => {}, api: fakeApi() } });
	return model;
}

describe('FamilyBoardScreen', () => {
	it('keeps its heading, the My tasks door and the pending banner', () => {
		board();
		expect(screen.getByRole('heading', { name: 'Family Tasks' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'My tasks' })).toBeTruthy();
		expect(screen.getByText(/1 task waiting for your response below/)).toBeTruthy();
	});

	it('keeps both scopes as tabs', () => {
		board();
		expect(screen.getByRole('tab', { name: 'Family tasks' })).toBeTruthy();
		expect(screen.getByRole('tab', { name: 'Public tasks (1)' })).toBeTruthy();
	});

	it('gives an unassigned Task the Nobody card, never a person column', () => {
		board();
		expect(screen.getByText('Nobody')).toBeTruthy();
		expect(screen.getByText(/Nobody is on the hook for these/)).toBeTruthy();
		expect(screen.getAllByText('Fix the gate')).toHaveLength(1);
	});

	it('prints the true completed count in the heading (Q-091)', () => {
		board();
		expect(screen.getByText('Completed (7)')).toBeTruthy();
	});

	it('shows the Public tasks read-only on their tab', async () => {
		board();
		await fireEvent.click(screen.getByRole('tab', { name: 'Public tasks (1)' }));
		expect(screen.getByText('Piano practice')).toBeTruthy();
		expect(screen.getByText('🌐 Public')).toBeTruthy();
	});
});
