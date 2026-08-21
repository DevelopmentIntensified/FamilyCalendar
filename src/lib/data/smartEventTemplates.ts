export type SmartEventCategory = 'car' | 'home' | 'cleaning';

export interface SmartEventTemplate {
	id: string;
	name: string;
	category: SmartEventCategory;
	description?: string;
	recurrenceFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
	recurrenceInterval: number;
}

export const CATEGORY_META: Record<SmartEventCategory, { label: string; icon: string; color: string }> = {
	car: { label: 'Car', icon: '🚗', color: 'bg-sky-100 text-sky-700 border-sky-200' },
	home: { label: 'Home', icon: '🏠', color: 'bg-amber-100 text-amber-700 border-amber-200' },
	cleaning: { label: 'Cleaning', icon: '🧹', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
};

export const SMART_EVENT_TEMPLATES: SmartEventTemplate[] = [
	// Car maintenance
	{ id: 'car-oil', name: 'Oil change', category: 'car', recurrenceFrequency: 'monthly', recurrenceInterval: 3, description: 'Typically every 3 months or 5,000 miles, whichever comes first.' },
	{ id: 'car-tire-rotation', name: 'Tire rotation', category: 'car', recurrenceFrequency: 'monthly', recurrenceInterval: 6, description: 'Every other oil change, roughly every 6 months or 7,500 miles.' },
	{ id: 'car-tire-pressure', name: 'Tire pressure check', category: 'car', recurrenceFrequency: 'monthly', recurrenceInterval: 1 },
	{ id: 'car-wipers', name: 'Replace wiper blades', category: 'car', recurrenceFrequency: 'monthly', recurrenceInterval: 6 },
	{ id: 'car-engine-air-filter', name: 'Engine air filter', category: 'car', recurrenceFrequency: 'yearly', recurrenceInterval: 1 },
	{ id: 'car-cabin-filter', name: 'Cabin air filter', category: 'car', recurrenceFrequency: 'yearly', recurrenceInterval: 1 },
	{ id: 'car-brake-inspection', name: 'Brake inspection', category: 'car', recurrenceFrequency: 'yearly', recurrenceInterval: 1 },
	{ id: 'car-battery-check', name: 'Battery check', category: 'car', recurrenceFrequency: 'yearly', recurrenceInterval: 1 },
	{ id: 'car-registration', name: 'Registration renewal', category: 'car', recurrenceFrequency: 'yearly', recurrenceInterval: 1 },
	{ id: 'car-insurance-review', name: 'Insurance review / shop quotes', category: 'car', recurrenceFrequency: 'yearly', recurrenceInterval: 1 },
	{ id: 'car-wash', name: 'Car wash (exterior + interior)', category: 'car', recurrenceFrequency: 'monthly', recurrenceInterval: 1 },

	// Home maintenance
	{ id: 'home-hvac-filter', name: 'Replace HVAC filter', category: 'home', recurrenceFrequency: 'monthly', recurrenceInterval: 3, description: '90 days is the standard for 1-inch filters.' },
	{ id: 'home-smoke-test', name: 'Test smoke & CO detectors', category: 'home', recurrenceFrequency: 'monthly', recurrenceInterval: 1 },
	{ id: 'home-smoke-batteries', name: 'Smoke detector batteries', category: 'home', recurrenceFrequency: 'yearly', recurrenceInterval: 1, description: 'Common rule of thumb: every year at daylight saving time changes.' },
	{ id: 'home-gutters', name: 'Clean gutters', category: 'home', recurrenceFrequency: 'monthly', recurrenceInterval: 6 },
	{ id: 'home-dryer-vent', name: 'Dryer vent cleaning', category: 'home', recurrenceFrequency: 'monthly', recurrenceInterval: 3, description: 'Lint buildup is a leading cause of house fires.' },
	{ id: 'home-water-heater', name: 'Water heater flush', category: 'home', recurrenceFrequency: 'yearly', recurrenceInterval: 1 },
	{ id: 'home-fridge-coils', name: 'Vacuum refrigerator coils', category: 'home', recurrenceFrequency: 'monthly', recurrenceInterval: 6 },
	{ id: 'home-sump-pump', name: 'Test sump pump', category: 'home', recurrenceFrequency: 'monthly', recurrenceInterval: 3 },
	{ id: 'home-furnace-service', name: 'Furnace service', category: 'home', recurrenceFrequency: 'yearly', recurrenceInterval: 1, description: 'Schedule before heating season.' },
	{ id: 'home-ac-service', name: 'A/C service', category: 'home', recurrenceFrequency: 'yearly', recurrenceInterval: 1, description: 'Schedule before cooling season.' },
	{ id: 'home-pest-control', name: 'Pest control treatment', category: 'home', recurrenceFrequency: 'monthly', recurrenceInterval: 3 },

	// Cleaning
	{ id: 'clean-vacuum', name: 'Vacuum', category: 'cleaning', recurrenceFrequency: 'weekly', recurrenceInterval: 1 },
	{ id: 'clean-dust', name: 'Dust surfaces', category: 'cleaning', recurrenceFrequency: 'weekly', recurrenceInterval: 1 },
	{ id: 'clean-bathrooms', name: 'Bathrooms', category: 'cleaning', recurrenceFrequency: 'weekly', recurrenceInterval: 1 },
	{ id: 'clean-kitchen-deep', name: 'Kitchen deep clean', category: 'cleaning', recurrenceFrequency: 'weekly', recurrenceInterval: 1 },
	{ id: 'clean-mop', name: 'Mop floors', category: 'cleaning', recurrenceFrequency: 'weekly', recurrenceInterval: 1 },
	{ id: 'clean-bedding', name: 'Change bed sheets', category: 'cleaning', recurrenceFrequency: 'weekly', recurrenceInterval: 2 },
	{ id: 'clean-fridge-out', name: 'Fridge clean-out', category: 'cleaning', recurrenceFrequency: 'weekly', recurrenceInterval: 1 },
	{ id: 'clean-mattress-rotate', name: 'Rotate mattress', category: 'cleaning', recurrenceFrequency: 'monthly', recurrenceInterval: 6 },
	{ id: 'clean-windows', name: 'Windows & mirrors', category: 'cleaning', recurrenceFrequency: 'monthly', recurrenceInterval: 3 },
	{ id: 'clean-baseboards', name: 'Baseboards & door frames', category: 'cleaning', recurrenceFrequency: 'monthly', recurrenceInterval: 3 },
	{ id: 'clean-oven', name: 'Oven deep clean', category: 'cleaning', recurrenceFrequency: 'monthly', recurrenceInterval: 3 },
	{ id: 'clean-carpet', name: 'Deep clean carpets', category: 'cleaning', recurrenceFrequency: 'monthly', recurrenceInterval: 6 }
];
