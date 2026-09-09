/** Static marketing icons for the features page (#039). In-file literals only —
 * never user input (same contract as BottomNav's icon {@html}). */

export type FeatureIcon =
	| 'calendar'
	| 'bolt'
	| 'users'
	| 'printer'
	| 'phone'
	| 'clipboard'
	| 'clock'
	| 'smile'
	| 'heart';

interface IconDef {
	bg: string;
	fg: string;
	/** Inner SVG elements (paths/shapes), rendered via {@html}. */
	body: string;
	strokeWidth?: string;
	filled?: boolean;
}

export const FEATURE_ICONS: Record<FeatureIcon, IconDef> = {
	calendar: {
		bg: 'bg-[#FED5CF]',
		fg: 'text-[#c45e38]',
		body: '<rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />'
	},
	bolt: {
		bg: 'bg-[#FED5CF]',
		fg: 'text-[#c45e38]',
		body: '<path d="M13 10V3L4 14h7v7l9-11h-7z" />'
	},
	users: {
		bg: 'bg-[#FED5CF]',
		fg: 'text-[#c45e38]',
		body: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />'
	},
	printer: {
		bg: 'bg-[#C4E9DA]',
		fg: 'text-[#2d5866]',
		body: '<path d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />'
	},
	phone: {
		bg: 'bg-[#D3C7E6]',
		fg: 'text-[#6b5b7b]',
		body: '<path d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />'
	},
	clipboard: {
		bg: 'bg-[#F1B598]',
		fg: 'text-[#84412e]',
		body: '<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />'
	},
	clock: {
		bg: 'bg-white/80',
		fg: 'text-[#c45e38]',
		body: '<circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />',
		strokeWidth: '1.5'
	},
	smile: {
		bg: 'bg-white/80',
		fg: 'text-[#366d7e]',
		body: '<path d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />',
		strokeWidth: '1.5'
	},
	heart: {
		bg: 'bg-white/80',
		fg: 'text-[#6b5b7b]',
		body: '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />',
		filled: true
	}
};
