import { describe, it, expect } from 'vitest';
import { DASHBOARD_MODULES } from '$lib/dashboardModules';
import { hiddenModulesFromForm, shownModuleIds } from './accountDashboardModules';

function form(...checked: string[]) {
	const data = new FormData();
	for (const id of checked) data.append(`module_${id}`, 'on');
	return data;
}

describe('hiddenModulesFromForm', () => {
	it('reads the show-based checkboxes back as the hidden list', () => {
		// Show-based: the switch says "show", the column stores "hidden".
		const hidden = hiddenModulesFromForm(form('verse', 'board', 'kids'));
		expect(hidden).not.toContain('verse');
		expect(hidden).not.toContain('board');
		expect(hidden).not.toContain('kids');
		expect(hidden).toContain('glance');
		expect(hidden).toHaveLength(DASHBOARD_MODULES.length - 3);
	});

	it('hides everything when nothing is checked', () => {
		expect(hiddenModulesFromForm(form())).toHaveLength(DASHBOARD_MODULES.length);
	});

	it('drops ids the module list no longer carries', () => {
		// A saved list still naming a retired module (103) must not come back as
		// a hidden id no reader understands.
		const hidden = hiddenModulesFromForm(
			form(...DASHBOARD_MODULES.map((m) => m.id), 'memberStrip')
		);
		expect(hidden).not.toContain('memberStrip');
	});
});

describe('shownModuleIds', () => {
	it('is everything on for a user who has hidden nothing', () => {
		expect(Object.values(shownModuleIds([])).every(Boolean)).toBe(true);
	});

	it('is exactly the inverse of a saved hidden list', () => {
		const hidden = hiddenModulesFromForm(form('verse', 'glance'));
		const shown = shownModuleIds(hidden);
		// The two the form left unchecked are the two on the hidden list.
		expect(shown.verse).toBe(true);
		expect(shown.glance).toBe(true);
		expect(shown.board).toBe(false);
	});

	it('ignores a stale saved id rather than hiding everything', () => {
		expect(shownModuleIds(['memberStrip']).board).toBe(true);
	});
});
