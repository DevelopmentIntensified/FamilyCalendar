export interface ContactColor {
	bg: string;
	text: string;
}

const COLORS: ContactColor[] = [
	{ bg: '#DBEAFE', text: '#1D4ED8' },
	{ bg: '#D1FAE5', text: '#065F46' },
	{ bg: '#FEF3C7', text: '#92400E' },
	{ bg: '#FCE7F3', text: '#9D174D' },
	{ bg: '#E0E7FF', text: '#3730A3' },
	{ bg: '#FEE2E2', text: '#991B1B' },
	{ bg: '#CCFBF1', text: '#115E59' },
	{ bg: '#F3E8FF', text: '#6B21A8' },
	{ bg: '#FFF7ED', text: '#9A3412' },
	{ bg: '#ECFDF5', text: '#047857' },
];

export function getContactColor(name: string): ContactColor {
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = name.charCodeAt(i) + ((hash << 5) - hash);
	}
	return COLORS[Math.abs(hash) % COLORS.length];
}

export function getInitials(
	firstName: string,
	lastName?: string
): string {
	if (lastName) {
		return `${firstName.charAt(0)}${lastName.charAt(0)}`;
	}
	return firstName.charAt(0).toUpperCase();
}
