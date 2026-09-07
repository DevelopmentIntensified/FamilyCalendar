/**
 * Hand-curated roadmap for the public /roadmap page.
 * No dates, no promises — see the note on the page.
 */
export interface RoadmapItem {
	title: string;
	description: string;
}

export type RoadmapSectionId = 'shipped' | 'in-progress' | 'coming-next';

export interface RoadmapSection {
	id: RoadmapSectionId;
	heading: string;
	blurb: string;
	items: RoadmapItem[];
}

export const roadmap: RoadmapSection[] = [
	{
		id: 'shipped',
		heading: 'Shipped',
		blurb: 'Live in the app today.',
		items: [
			{
				title: 'Bill tracking',
				description:
					'Add, edit, and mark bills paid, with overdue badges and a clear list your whole family can see.'
			},
			{
				title: 'Receipt scanning',
				description:
					'Scan a receipt with your phone and the details fill in automatically — on your device, with the photo never stored.'
			},
			{
				title: 'Quick-add for events and bills',
				description:
					'Type a plain sentence and Family Planz turns it into an event or a bill, complete with dates, amounts, and people.'
			},
			{
				title: 'Task visibility',
				description: 'Every task can be public, family-only, or private — you decide who sees what.'
			},
			{
				title: 'Family hub redesign',
				description: 'Members, invites, settings, and activity in one clear, card-based page.'
			}
		]
	},
	{
		id: 'in-progress',
		heading: 'In progress',
		blurb: 'Being built and refined right now.',
		items: [
			{
				title: 'Privacy hardening',
				description:
					"Ongoing work to keep your family's data yours — tighter access rules and clearer controls."
			},
			{
				title: 'Spending reports',
				description: 'A simple view of what your family spent and where, built from your bills.'
			}
		]
	},
	{
		id: 'coming-next',
		heading: 'Coming next',
		blurb: 'On our list, in rough priority order.',
		items: [
			{
				title: 'Recurring bills',
				description:
					'Bills that repeat — rent, utilities, subscriptions — tracked automatically month after month.'
			},
			{
				title: 'Monthly burn',
				description: 'A single number for what your family typically spends each month.'
			},
			{
				title: 'Due-soon reminders',
				description: 'Gentle nudges before a bill is due, so nothing sneaks up on you.'
			},
			{
				title: 'Budgeting trends',
				description: 'See how your spending changes over time and spot where to trim.'
			},
			{
				title: 'Item-level receipt intelligence',
				description:
					'Label and learn from individual items on receipts, so reports know groceries from takeout.'
			}
		]
	}
];
