import { DateTime } from 'luxon';

export const getDaysInMonth = (year: number, month: number, zone: string) => {
	return DateTime.fromObject({ year, month }, { zone }).daysInMonth;
};

export const getDaysInLastMonth = (year: number, month: number, zone: string) => {
	if (month === 1) {
		year = year - 1;
		month = 12;
	} else {
		month = month - 1;
	}
	return DateTime.fromObject({ year, month }, { zone }).daysInMonth;
};

export const getFirstDayOfMonth = (year: number, month: number, zone: string) => {
	console.log(year, month);
	console.log(DateTime.fromObject({ year, month, day: 1 }, { zone }));
	return DateTime.fromObject({ year, month, day: 1 }, { zone }).weekday;
};

export const formatDate = (date: DateTime, zone: string) => {
	return date.setZone(zone).toFormat('MM-dd-yyyy');
};

export const parseDate = (dateString: string) => {
	const [year, month, day] = dateString.split('-').map(Number);
	return new Date(year, month - 1, day);
};
