/**
 * groceries page state: the one list's client state — the scope filter, the
 * search, the add form (its scope, its Store Memory suggestion), the inline
 * store editor, the colour pickers with their optimistic overrides, and the
 * checked-off rail. Runes and methods only, no `$effect`, so it is tested in
 * node with a fake api and `memoryToasts()`.
 *
 * Two rules keep it honest:
 * - Every write is OPTIMISTIC and rolls back: the row leaves the list the
 *   moment the box is ticked, a colour flips before the ack, and a refusal
 *   restores exactly what was there and writes the inline error.
 * - The page answers from the response it already has instead of re-reading
 *   both lists. `groceryItemsWith`/`groceryItemsWithout`/… are the loader's
 *   own order, so a local edit lands where a reload would have put it.
 *
 * The scope is the page's own: `groceryScopeOf(row)` is the row's scope, never
 * the filter's, so an action on a row under another filter still names the
 * list the row lives on.
 *
 * Doc: ./README.md#public-interface
 */
import type { Toasts } from '$lib/kernel/client/toasts.svelte';
import { systemScheduler, type Scheduler } from '$lib/kernel/time/scheduler';
import type { GroceryApi } from './groceries.api';
import {
	applyGroceryColourOverrides,
	groceryColourOverrideKey,
	groceryStoreKey,
	groceryStoresSharingColour,
	groupGroceryItems,
	resolveGroceryStoreColour,
	type ColourOverrides,
	type GroceryColourScope,
	type GroceryGroup,
	type StoreColour
} from './groceries.colours.rules';
import type { GroceriesPageData, GroceryListItem, StoreColourRow } from './groceries.contract';
import { cleanGroceryStores, matchesGrocerySearch } from './groceries.items.rules';
import {
	groceryAddedToast,
	groceryColourRowsApplied,
	groceryColourStores,
	groceryColourToast,
	groceryEmptyCopy,
	groceryFailureCopy,
	groceryItemMoved,
	groceryItemsStoresReplaced,
	groceryItemsWith,
	groceryItemsWithout,
	groceryPickerValue,
	groceryScopeCount,
	grocerySharedColourStores,
	groceryStoreNames,
	grocerySummaryLine
} from './groceries.list.rules';
import {
	groceryScopeFromParam,
	groceryScopeOf,
	type GroceryListScope,
	type GroceryScope,
	type GroceryScopeFilter
} from './groceries.scope.rules';

/** One row checked off this session: the row and the list it must go back to. */
export type GroceryCheckedEntry = {
	readonly item: GroceryListItem;
	readonly scope: GroceryListScope;
};

/** The Store Memory lookup waits for a pause in typing, like the legacy field did. */
const SUGGEST_DEBOUNCE_MS = 300;

export class GroceriesListState {
	/** Mine rows, oldest first — the loader's own order. */
	mine = $state<GroceryListItem[]>([]);
	/** Family rows, oldest first. */
	family = $state<GroceryListItem[]>([]);
	/** Everything checked off this session, from either scope. */
	checked = $state<GroceryCheckedEntry[]>([]);
	/** The colour rows the viewer resolves against, updated by each successful write. */
	colourRows = $state<StoreColourRow[]>([]);

	filter = $state<GroceryScopeFilter>('all');
	searchQuery = $state('');
	/** The add form's scope is explicit and visible, never inferred. */
	addScope = $state<GroceryListScope>('mine');
	input = $state('');
	storeInput = $state('');
	suggested = $state<string | null>(null);
	adding = $state(false);
	busyId = $state<string | null>(null);
	editingId = $state<string | null>(null);
	editStores = $state('');
	/** The inline error region's one sentence; cleared by the next action. */
	error = $state('');

	/** Store whose colour picker is open on its group (or on the card). */
	colourStore = $state<string | null>(null);
	/** Which row a flip from the GROUP picker writes. */
	colourScope = $state<GroceryColourScope>('family');
	/** The card's OWN scope (115): one control can never retarget the other. */
	railScope = $state<GroceryColourScope>('family');
	colourBusy = $state(false);
	/** Pending colour flips, keyed `scope:storeKey` — the in-flight paint only. */
	overrides = $state<ColourOverrides>({});

	/** Whether the viewer has a family at all: the add form's Family option. */
	get hasFamily(): boolean {
		return this.familyKnown;
	}

	/** The viewer a colour resolves for — the same shape as a scope. */
	get viewer(): GroceryScope {
		return this.colourViewer;
	}

	/** Backing fields for the two getters above: the derived rules read them. */
	private readonly familyKnown: boolean;
	private readonly colourViewer: GroceryScope;
	private readonly api: GroceryApi;
	private readonly toasts: Toasts;
	private readonly schedule: Scheduler;
	private cancelSuggestion: (() => void) | null = null;

	/** The one list: family rows then mine, exactly as the loader concatenates. */
	allItems = $derived<GroceryListItem[]>([...this.family, ...this.mine]);
	/** The filter narrows what is SHOWN; the count chips still count everything. */
	scopedItems = $derived(
		this.allItems.filter(
			(item) => this.filter === 'all' || groceryScopeOf(item) === this.filter
		)
	);
	/** Search is a filter over what is already loaded — no request. */
	visibleItems = $derived(
		this.scopedItems.filter((item) => matchesGrocerySearch(item, this.searchQuery))
	);
	/** The loaded rows with every pending (in-flight) flip merged in. */
	effectiveRows = $derived(
		applyGroceryColourOverrides(this.colourRows, this.overrides, this.viewer)
	);
	/** Grouping AND colour in one call, so a header and a chip cannot disagree. */
	groups = $derived<GroceryGroup<GroceryListItem>[]>(
		groupGroceryItems(this.visibleItems, this.effectiveRows, this.viewer)
	);

	/** Every store the list currently shows a chip for, first seen first. */
	chipNames = $derived(groceryStoreNames(this.visibleItems));
	/** Every store on the page, both scopes — the free-text field's datalist. */
	knownStores = $derived(groceryStoreNames(this.allItems));
	/** The card's shops: "Any store" is the absence of one, never a shop. */
	colourStores = $derived(groceryColourStores(this.knownStores));
	/** Shops forced onto one swatch — disclosed, never hidden. */
	sharedStores = $derived(
		grocerySharedColourStores(this.colourStores, this.effectiveRows, this.viewer)
	);
	queryActive = $derived(this.searchQuery.trim().length > 0);
	emptyCopy = $derived(
		groceryEmptyCopy({
			query: this.searchQuery,
			filter: this.filter,
			hasFamily: this.hasFamily
		})
	);

	constructor(
		api: GroceryApi,
		toasts: Toasts,
		data: GroceriesPageData,
		options: { readonly scopeParam?: string | null; readonly schedule?: Scheduler } = {}
	) {
		this.api = api;
		this.toasts = toasts;
		this.schedule = options.schedule ?? systemScheduler;
		this.familyKnown = data.hasFamily;
		this.colourViewer = { userId: data.userId, familyId: data.familyId };
		this.mine = [...data.mine];
		this.family = [...data.family];
		this.colourRows = [...data.colours];
		this.filter = groceryScopeFromParam(options.scopeParam ?? null);
		this.addScope = data.hasFamily ? 'family' : 'mine';
	}

	/* ── Filter, search, add form ───────────────────────────────────────────── */

	/** Narrow the one list. A filter that names a scope also points the add form at it. */
	setFilter(filter: GroceryScopeFilter): void {
		this.filter = filter;
		if (filter !== 'all') this.addScope = filter;
	}

	/** How many rows a filter chip counts. */
	count(filter: GroceryScopeFilter): number {
		return groceryScopeCount(this.allItems, filter);
	}

	/** "2 items · 5 total" — the group summary line. */
	summary(items: readonly { readonly quantity: number }[]): string {
		return grocerySummaryLine(items);
	}

	setSearch(searchQuery: string): void {
		this.searchQuery = searchQuery;
	}

	clearSearch(): void {
		this.searchQuery = '';
	}

	setAddScope(scope: GroceryListScope): void {
		this.addScope = scope;
	}

	/** Type in the quick-add field: look the Store Memory suggestion up after a pause. */
	setInput(input: string): void {
		this.input = input;
		this.cancelSuggestion?.();
		this.cancelSuggestion = null;
		if (!input.trim()) {
			this.suggested = null;
			return;
		}
		this.cancelSuggestion = this.schedule(() => {
			void this.loadSuggestion();
		}, SUGGEST_DEBOUNCE_MS);
	}

	private async loadSuggestion(): Promise<void> {
		const name = this.input.trim();
		if (!name) {
			this.suggested = null;
			return;
		}
		// Scoped to the scope the form is pointed at, so the suggestion never
		// answers for the other list.
		const result = await this.api.suggest(this.addScope, name);
		if (result.ok) this.suggested = result.data.store;
	}

	setStoreInput(storeInput: string): void {
		this.storeInput = storeInput;
	}

	useSuggestion(): void {
		if (this.suggested) this.storeInput = this.suggested;
	}

	/* ── Writes ─────────────────────────────────────────────────────────────── */

	/**
	 * Add the typed quick-add to the form's scope. The toast names the row's
	 * actual store (Q-038 B), so a server auto-fill is never mis-reported.
	 */
	async add(): Promise<void> {
		if (!this.input.trim() || this.adding) return;
		this.adding = true;
		this.error = '';
		const quickAdd = this.input.trim();
		// Captured before the await so a mid-flight scope change cannot send the
		// item to a list the toast did not name.
		const target = this.addScope;
		const stores = cleanGroceryStores(this.storeInput.split(','));
		try {
			const result = await this.api.add({
				scope: target,
				input: this.input,
				stores: stores.length ? stores : undefined
			});
			if (!result.ok) {
				this.error = result.error;
				return;
			}
			const created = result.data.item;
			this.insert(target, created);
			this.toasts.success(groceryAddedToast(quickAdd, target, created));
			this.input = '';
			this.storeInput = '';
			this.suggested = null;
		} finally {
			this.adding = false;
		}
	}

	/**
	 * Check a row off: it leaves the list at once and joins the checked rail
	 * when the server agrees; a refusal puts it back where it was.
	 */
	async check(entry: GroceryListItem): Promise<void> {
		const scope = groceryScopeOf(entry);
		this.error = '';
		this.remove(entry.id);
		const result = await this.api.change(entry.id, { scope, op: 'check' });
		if (!result.ok) {
			this.insert(scope, entry);
			this.error = groceryFailureCopy("Couldn't check that off", result.status);
			return;
		}
		this.checked = [...this.checked, { item: entry, scope }];
		this.toasts.success(`Checked off "${entry.name}".`, {
			label: 'Undo',
			run: () => void this.uncheck(entry, scope)
		});
	}

	/** Put a checked row back on the list it came from. */
	async uncheck(entry: GroceryListItem, scope: GroceryListScope): Promise<void> {
		if (this.busyId) return;
		this.busyId = entry.id;
		const checked = this.checked;
		this.checked = checked.filter((record) => record.item.id !== entry.id);
		try {
			const result = await this.api.change(entry.id, { scope, op: 'uncheck' });
			if (!result.ok) {
				this.checked = checked;
				this.error = groceryFailureCopy("Couldn't put that back", result.status);
				return;
			}
			this.insert(scope, entry);
			this.toasts.success(`Put "${entry.name}" back on the list.`);
		} finally {
			this.busyId = null;
		}
	}

	/** Open the inline store editor, seeded with the row's own comma list. */
	startEditing(entry: GroceryListItem): void {
		this.editingId = entry.id;
		this.editStores = entry.stores.join(', ');
	}

	cancelEditing(): void {
		this.editingId = null;
	}

	setEditStores(editStores: string): void {
		this.editStores = editStores;
	}

	/** Save the inline store list: cleaned like the write path, an empty list clears it. */
	async saveStores(entry: GroceryListItem): Promise<void> {
		if (this.busyId) return;
		this.busyId = entry.id;
		const scope = groceryScopeOf(entry);
		const stores = cleanGroceryStores(this.editStores.split(','));
		try {
			const result = await this.api.change(entry.id, { scope, op: 'stores', stores });
			if (!result.ok) {
				this.error = groceryFailureCopy("Couldn't save stores", result.status);
				return;
			}
			this.replaceStores(scope, entry.id, stores);
			this.editingId = null;
			this.toasts.success(`Stores updated for "${entry.name}".`);
		} finally {
			this.busyId = null;
		}
	}

	/** Move a row to ITS other scope — never to the filter's. */
	async move(entry: GroceryListItem): Promise<void> {
		if (this.busyId) return;
		this.busyId = entry.id;
		const from = groceryScopeOf(entry);
		const target: GroceryListScope = from === 'mine' ? 'family' : 'mine';
		try {
			const result = await this.api.change(entry.id, { scope: from, op: 'move', target });
			if (!result.ok) {
				this.error = groceryFailureCopy("Couldn't move that", result.status);
				return;
			}
			this.remove(entry.id);
			this.insert(target, groceryItemMoved(entry, target, this.viewer));
			this.editingId = null;
			this.toasts.success(
				`Moved "${entry.name}" to ${target === 'mine' ? 'Mine' : 'Family'}.`
			);
		} finally {
			this.busyId = null;
		}
	}

	/** Remove a row; Store Memory is the server's to keep. */
	async removeItem(entry: GroceryListItem): Promise<void> {
		if (this.busyId) return;
		this.busyId = entry.id;
		try {
			const result = await this.api.remove(entry.id, groceryScopeOf(entry));
			if (!result.ok) {
				this.error = groceryFailureCopy("Couldn't remove that", result.status);
				return;
			}
			this.remove(entry.id);
			this.toasts.success(`Removed "${entry.name}" — store memory kept.`);
		} finally {
			this.busyId = null;
		}
	}

	/* ── Store colours ──────────────────────────────────────────────────────── */

	/** Open a group's colour picker; with a family, flips start on "Everyone". */
	openColour(store: string): void {
		this.colourStore = store;
		this.colourScope = this.hasFamily ? 'family' : 'personal';
	}

	closeColour(): void {
		this.colourStore = null;
	}

	setColourScope(scope: GroceryColourScope): void {
		this.colourScope = scope;
	}

	setRailScope(scope: GroceryColourScope): void {
		this.railScope = scope;
	}

	/** The colour a group header or a row chip paints for one store. */
	colourOf(store: string): StoreColour | null {
		return resolveGroceryStoreColour(store, this.effectiveRows, this.viewer);
	}

	/** The other shops on that store's swatch. */
	twinsOf(store: string, names: readonly string[] = this.chipNames): string[] {
		return groceryStoresSharingColour(store, names, this.effectiveRows, this.viewer);
	}

	/** What one picker shows for one shop at one scope. */
	pickerValue(store: string, scope: GroceryColourScope): string {
		return groceryPickerValue(this.colourRows, this.overrides, scope, store, this.viewer);
	}

	/**
	 * Flip one store's colour. The scope is captured WITH the write, so moving
	 * the Everyone / Just me control afterwards can only choose where the NEXT
	 * write goes — it can never re-label this one.
	 */
	async setColour(store: string, color: string, scope: GroceryColourScope): Promise<void> {
		if (this.colourBusy) return;
		this.colourBusy = true;
		this.error = '';
		const overrideKey = groceryColourOverrideKey(scope, groceryStoreKey(store));
		const rows = this.colourRows;
		// Optimistic repaint (<100 ms ack); reverted below if the write fails.
		this.overrides = { ...this.overrides, [overrideKey]: color };
		try {
			const result = await this.api.setColour({ store, color, scope });
			if (!result.ok) {
				this.overrides = withoutOverrideKey(this.overrides, overrideKey);
				this.error = groceryFailureCopy("Couldn't set that colour", result.status);
				return;
			}
			this.colourRows = groceryColourRowsApplied(rows, {
				store,
				color,
				scope,
				viewer: this.viewer
			});
			this.overrides = withoutOverrideKey(this.overrides, overrideKey);
			this.colourStore = null;
			this.toasts.success(groceryColourToast(store, color, scope));
		} finally {
			this.colourBusy = false;
		}
	}

	/* ── Local list edits (the loader's order, without a reload) ─────────────── */

	private insert(scope: GroceryListScope, entry: GroceryListItem): void {
		if (scope === 'family') this.family = groceryItemsWith(this.family, entry);
		else this.mine = groceryItemsWith(this.mine, entry);
	}

	private remove(id: string): void {
		this.family = groceryItemsWithout(this.family, id);
		this.mine = groceryItemsWithout(this.mine, id);
	}

	private replaceStores(scope: GroceryListScope, id: string, stores: readonly string[]): void {
		if (scope === 'family') this.family = groceryItemsStoresReplaced(this.family, id, stores);
		else this.mine = groceryItemsStoresReplaced(this.mine, id, stores);
	}
}

/** The override map without one key — a plain copy, so `$state` sees a new value. */
function withoutOverrideKey(overrides: ColourOverrides, key: string): ColourOverrides {
	const next = { ...overrides };
	delete next[key];
	return next;
}
