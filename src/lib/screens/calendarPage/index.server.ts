/**
 * calendarPage — public server interface: the page loads and the one
 * composition use-case.
 * Doc: ./README.md#public-interface
 */
export { calendarPageLoad, shareTargetLoad } from './calendarPage.http.server';
export { getCalendarPage, type CalendarPageServiceInput } from './calendarPage.service.server';
