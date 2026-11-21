import {
	accountCreateApiTokenAction,
	accountDeleteAccountAction,
	accountLogoutAllDevicesAction,
	accountPageLoad,
	accountRevokeApiTokenAction,
	accountSaveCalendarSettingsAction,
	accountSaveDashboardModulesAction,
	accountSetNotificationPreferenceAction,
	accountUpdateProfileAction
} from '$lib/screens/account/index.server';
import { changeEmailAction } from '$lib/domains/access/index.server';

export const load = accountPageLoad;

export const actions = {
	saveCalendarSettings: accountSaveCalendarSettingsAction,
	saveDashboardModules: accountSaveDashboardModulesAction,
	setNotificationPreference: accountSetNotificationPreferenceAction,
	updateProfile: accountUpdateProfileAction,
	updateEmail: changeEmailAction,
	logoutAllDevices: accountLogoutAllDevicesAction,
	createApiToken: accountCreateApiTokenAction,
	revokeApiToken: accountRevokeApiTokenAction,
	deleteAccount: accountDeleteAccountAction
};
