import { generateId } from 'lucia';

export interface AdTemplate {
	sponsorName: string;
	message: string;
	ctaText?: string;
	ctaLink?: string;
	targetPlan?: string | null;
}

export interface GeneratedAd {
	eventId: string;
	eventDate: Date;
	adContent: {
		sponsorName: string;
		message: string;
		ctaText?: string;
		ctaLink?: string;
		targetPlan?: string;
	};
}

const AD_TEMPLATES: AdTemplate[] = [
	{
		sponsorName: 'Family Planning Pro',
		message: 'Upgrade to Premium and unlock unlimited family members!',
		ctaText: 'Upgrade Now',
		ctaLink: '/pricing',
		targetPlan: 'premium'
	},
	{
		sponsorName: 'Family Calendar',
		message: 'Get 20% off annual plans this month only!',
		ctaText: 'Claim Discount',
		ctaLink: '/pricing',
		targetPlan: 'annual'
	},
	{
		sponsorName: 'Feature Alert',
		message: 'Check out our new archive retention feature - preserve memories forever!',
		ctaText: 'Learn More',
		ctaLink: '/features',
		targetPlan: null
	},
	{
		sponsorName: 'Family Calendar',
		message: 'Invite your extended family - groups now support 5+ members!',
		ctaText: 'Invite Family',
		ctaLink: '/family/create',
		targetPlan: null
	}
];

export function generateAds(count: number, month: number, year: number, excludeTemplateIndices: number[] = []): GeneratedAd[] {
	const ads: GeneratedAd[] = [];
	const daysInMonth = new Date(year, month, 0).getDate();
	const usedTemplates = [...excludeTemplateIndices];

	for (let i = 0; i < count; i++) {
		let templateIndex: number;
		do {
			templateIndex = Math.floor(Math.random() * AD_TEMPLATES.length);
		} while (usedTemplates.includes(templateIndex) && usedTemplates.length < AD_TEMPLATES.length);

		usedTemplates.push(templateIndex);

		const template = AD_TEMPLATES[templateIndex];
		const dayOffset = Math.floor(Math.random() * daysInMonth);
		const eventDate = new Date(year, month - 1, dayOffset + 1, 10, 0, 0, 0);

		ads.push({
			eventId: generateId(15),
			eventDate,
			adContent: {
				sponsorName: template.sponsorName,
				message: template.message,
				ctaText: template.ctaText,
				ctaLink: template.ctaLink,
				targetPlan: template.targetPlan ?? undefined
			}
		});
	}

	return ads;
}

export function getAdTemplates(): AdTemplate[] {
	return [...AD_TEMPLATES];
}
