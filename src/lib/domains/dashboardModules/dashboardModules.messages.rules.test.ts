/**
 * The copy every dashboardModules route answers with. Rows are the wire: the
 * goldens pin the two 400 bodies and the 403, and the saved message counts the
 * cards out of the canonical registry.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	dashboardModulesSavedMessage,
	FAMILY_MODULE_ENABLED_MESSAGE,
	FAMILY_MODULE_FORBIDDEN_MESSAGE,
	FAMILY_MODULE_REQUIRED_MESSAGE,
	familyModuleNotFamilyScopedMessage,
	familyModuleUnknownMessage,
	MY_MODULES_HIDDEN_MESSAGE
} from './dashboardModules.messages.rules';
import { DASHBOARD_MODULES } from './dashboardModules.registry.rules';

describe('dashboard module messages', () => {
	it.each([
		[FAMILY_MODULE_ENABLED_MESSAGE, 'enabled must be a boolean'],
		[MY_MODULES_HIDDEN_MESSAGE, 'hidden must be an array of module ids'],
		[FAMILY_MODULE_FORBIDDEN_MESSAGE, 'You do not have permission to perform this action'],
		[FAMILY_MODULE_REQUIRED_MESSAGE, 'Module is required']
	])('pins the legacy sentence %j', (actual, expected) => {
		expect(actual).toBe(expected);
	});

	it('names the module in both registry refusals', () => {
		expect(familyModuleUnknownMessage('weather')).toBe('Unknown dashboard module: weather');
		expect(familyModuleNotFamilyScopedMessage('verse')).toBe('Module is not family-scoped: verse');
	});

	it('counts the cards still on in the saved message', () => {
		expect(dashboardModulesSavedMessage(1)).toBe(
			`Dashboard modules saved — ${DASHBOARD_MODULES.length - 1} of ${DASHBOARD_MODULES.length} cards on.`
		);
		expect(dashboardModulesSavedMessage(0)).toBe(
			`Dashboard modules saved — all ${DASHBOARD_MODULES.length} cards on.`
		);
	});
});
