/**
 * familyHub UI fixtures: the two page models the state classes and the
 * components take, with every field a test names. Nothing here reads the
 * database — the pages' models are internal shapes, so a test states the model
 * it means instead of seeding rows.
 *
 * Doc: ./README.md#how-to-test
 */
import type {
	FamilyBoardModel,
	FamilyBoardTask,
	FamilyHubMember,
	FamilyHubModel
} from './familyHub.contract';

/** One roster row; the viewer is `u_ann`, creator of `fam-old`. */
export function buildFamilyHubMember(overrides: Partial<FamilyHubMember> = {}): FamilyHubMember {
	return {
		userId: 'u_bob',
		firstName: 'Bob',
		lastName: 'Roy',
		email: 'bob@example.test',
		role: 'member',
		memberType: 'child',
		...overrides
	};
}

/** The detail page's model: Ann the creator with Bob and a live invitation. */
export function buildFamilyHubModel(overrides: Partial<FamilyHubModel> = {}): FamilyHubModel {
	return {
		family: {
			id: 'fam-old',
			name: 'Old Home',
			color: '#c45e38',
			createdAt: new Date('2025-01-01T00:00:00Z')
		},
		members: [
			buildFamilyHubMember({
				userId: 'u_ann',
				firstName: 'Ann',
				lastName: 'Lee',
				email: 'ann@example.test',
				role: 'creator',
				memberType: 'parent'
			}),
			buildFamilyHubMember()
		],
		currentUserRole: 'creator',
		currentUserId: 'u_ann',
		activity: [
			{
				kind: 'completed',
				title: 'Mow the lawn',
				actorName: 'Bob Roy',
				targetName: null,
				at: '2026-02-20T10:00:00.000Z'
			}
		],
		moduleSwitches: { board: false, kids: true, groceries: true, meals: true },
		hiddenDashboardModules: [],
		activeInvite: {
			code: 'LIVE000001',
			useCount: 2,
			maxUses: 5,
			expiresAt: new Date('2026-04-01T00:00:00Z')
		},
		inviteCreatedBy: 'Ann',
		planUsage: {
			tierName: 'Full House',
			aiUsed: 3,
			aiLimit: 10,
			familiesUsed: 1,
			familyLimit: 1,
			members: 2,
			memberLimit: 6,
			archivedRetentionDays: 30,
			exportImportEnabled: true
		},
		...overrides
	};
}

/** One board Task row with every column the components read. */
export function buildFamilyBoardTaskWire(overrides: Partial<FamilyBoardTask> = {}): FamilyBoardTask {
	return {
		id: 'task-1',
		title: 'Mow the lawn',
		notes: null,
		dueDate: null,
		completedAt: null,
		archivedAt: null,
		recurrenceFrequency: null,
		recurrenceInterval: null,
		completionCount: 0,
		assignedTo: 'u_ann',
		assignmentStatus: 'accepted',
		priority: 'normal',
		visibility: 'public',
		focusMinutes: null,
		focusStartedAt: null,
		category: null,
		assigneeFirstName: 'Ann',
		assigneeLastName: 'Lee',
		userId: 'u_ann',
		familyId: 'fam-old',
		eventId: null,
		createdAt: new Date('2026-01-02T00:00:00Z'),
		eventTitle: null,
		eventStart: null,
		creatorFirstName: 'Ann',
		tags: [],
		...overrides
	};
}

/** The board page's model for `fam-old`, viewer `u_ann`. */
export function buildFamilyBoardModel(overrides: Partial<FamilyBoardModel> = {}): FamilyBoardModel {
	return {
		familyId: 'fam-old',
		userId: 'u_ann',
		tasks: [buildFamilyBoardTaskWire()],
		publicTasks: [],
		familyRoster: [
			{
				userId: 'u_ann',
				firstName: 'Ann',
				lastName: 'Lee',
				email: 'ann@example.test',
				role: 'creator',
				memberType: 'parent'
			},
			{
				userId: 'u_bob',
				firstName: 'Bob',
				lastName: 'Roy',
				email: 'bob@example.test',
				role: 'member',
				memberType: 'child'
			}
		],
		taskCategories: [{ id: 'cat-home', name: 'Home' }],
		completedTotal: 0,
		...overrides
	};
}
