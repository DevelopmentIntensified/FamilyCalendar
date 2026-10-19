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
				title: 'Quick-add for events',
				description:
					'Type a plain sentence and Family Planz turns it into an event, complete with dates, times, and people.'
			},
			{
				title: 'Task visibility',
				description: 'Every task can be public, family-only, or private — you decide who sees what.'
			},
			{
				title: 'Family hub redesign',
				description: 'Members, invites, settings, and activity in one clear, card-based page.'
			},
			{
				title: 'Grocery lists',
				description:
					'A shared list with store sections, per-person "Mine" filtering, and check-off as you shop.'
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
			}
		]
	},
	{
		id: 'coming-next',
		heading: 'Coming next',
		blurb: 'On our list, in rough priority order.',
		items: [
			{
				title: 'Calendar sync',
				description:
					'Bring your Google, Outlook, or Apple calendar events into Family Planz — research is underway.'
			}
		]
	}
];
