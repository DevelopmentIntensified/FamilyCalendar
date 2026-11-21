/**
 * dashboardModules — public isomorphic interface: the canonical registry, the
 * visibility answer, the row vocabulary and both routes' contract.
 * Other modules import dashboardModules ONLY through this file, index.server.ts or ui/index.ts (rule R2).
 * Doc: ./README.md#public-interface
 */
export {
	DASHBOARD_MODULES,
	selectDashboardModules,
	isDashboardModule,
	canonicalHiddenModules,
	showsModule,
	type DashboardModule,
	type DashboardModuleId,
	type DashboardBand,
	type ModuleScope,
	type DashboardModuleFilter,
	type ModuleSwitchMap
} from './dashboardModules.registry.rules';
export {
	dashboardVisibility,
	type DashboardRead,
	type DashboardSettingsFacts,
	type DashboardVisibility
} from './dashboardModules.visibility.rules';
export {
	describeDashboardModuleRow,
	type ModuleRowState,
	type ModuleToggleValue,
	type DashboardModuleRowInfo
} from './dashboardModules.row.rules';
export {
	FamilyModuleParams,
	FamilyModuleSwitchBody,
	FamilyModuleSwitchResponse,
	MyDashboardModulesBody,
	MyDashboardModulesResponse,
	FAMILY_MODULE_ENABLED_MESSAGE,
	FAMILY_MODULE_FORBIDDEN_MESSAGE,
	FAMILY_MODULE_REQUIRED_MESSAGE,
	MY_MODULES_HIDDEN_MESSAGE,
	dashboardModulesSavedMessage,
	familyModuleNotFamilyScopedMessage,
	familyModuleUnknownMessage
} from './dashboardModules.contract';
