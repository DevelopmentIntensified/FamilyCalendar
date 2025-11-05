import { DateTime } from 'luxon';

export const getDaysInMonth = (year: number, month: number) => {
	return DateTime.fromObject({ year, month }).daysInMonth;
};

export const getFirstDayOfMonth = (year: number, month: number) => {
	return DateTime.fromObject({ year, month, day: 1 }).weekday;
};

export const getFirstDayOfNextMonth = (year: number, month: number) => {
	if (month === 12) {
		year = year + 1;
		month = 1;
	} else {
		month = month + 1;
	}
	return DateTime.fromObject({ year, month, day: 1 }).weekday;
};

export const getDaysInLastMonth = (year: number, month: number) => {
	if (month === 1) {
		year = year - 1;
		month = 12;
	} else {
		month = month - 1;
	}
	const daysInLastMonth = DateTime.fromObject({ year, month }).daysInMonth;
	if (!daysInLastMonth) {
		return 0; //fail gracefully, but this should never happen
	}
	return daysInLastMonth;
};

export const formatDate = (date: DateTime) => {
	return date.toFormat('MM-dd-yyyy');
};

export const parseDate = (dateString: string) => {
	const [year, month, day] = dateString.split('-').map(Number);
	return new Date(year, month - 1, day);
};
