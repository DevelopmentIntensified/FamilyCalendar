<script lang="ts">
	/** PROTOTYPE (issue 208) — the review dock: variant switcher + section
	 *  feedback overlay, dev-only scaffolding. Never part of the design being
	 *  evaluated. Autosaves marks to localStorage; Copy hands the markdown to
	 *  the chat (no collector on a Vite dev server). */
	import { VARIANTS, type VariantKey } from './prototypeProps';

	let { current, variantNames }: { current: VariantKey; variantNames: Record<VariantKey, string> } =
		$props();

	const storeKey = 'proto-fb:app-ui_dashboard_live';

	type Mark = {
		selector: string;
		region: string | null;
		text: string;
		verdict: 'good' | 'bad' | 'idea';
		note: string;
		at: string;
	};

	let open = $state(false);
	let panel = $state<'review' | 'switch'>('switch');
	let marks = $state<Mark[]>([]);
	let picking = $state(false);
	let cardFor = $state<Mark | null>(null);
	let copied = $state(false);

	function load() {
		try {
			marks = JSON.parse(localStorage.getItem(storeKey) ?? '[]');
		} catch {
			marks = [];
		}
	}
	function save() {
		localStorage.setItem(storeKey, JSON.stringify(marks));
	}
	$effect(() => {
		load();
	});

	function regionOf(el: Element): string | null {
		let n: Element | null = el;
		while (n) {
			if (n.hasAttribute('data-fb')) {
				return `${n.getAttribute('data-fb')} · ${n.getAttribute('data-fb-label') ?? ''}`;
			}
			n = n.parentElement;
		}
		return null;
	}
	function selectorOf(el: Element): string {
		const parts: string[] = [];
		let n: Element | null = el;
		while (n && n !== document.body) {
			if (n.id) {
				parts.unshift(`#${n.id}`);
				break;
			}
			const parent: Element | null = n.parentElement;
			if (parent) {
				const i = Array.from(parent.children).indexOf(n) + 1;
				parts.unshift(`${n.tagName.toLowerCase()}:nth-child(${i})`);
			}
			n = parent;
		}
		return parts.join(' > ');
	}

	function startPicking() {
		picking = true;
		open = false;
		document.body.style.cursor = 'crosshair';
	}
	function stopPicking() {
		picking = false;
		document.body.style.cursor = '';
	}
	function onPick(e: MouseEvent) {
		if (!picking) return;
		e.preventDefault();
		e.stopPropagation();
		const el = document.elementFromPoint(e.clientX, e.clientY);
		if (!el) return;
		stopPicking();
		cardFor = {
			selector: selectorOf(el),
			region: regionOf(el),
			text: (el.textContent ?? '').trim().slice(0, 120),
			verdict: 'bad',
			note: '',
			at: new Date().toISOString()
		};
	}
	$effect(() => {
		if (!picking) return;
		document.addEventListener('click', onPick, true);
		return () => document.removeEventListener('click', onPick, true);
	});

	function saveMark() {
		if (!cardFor) return;
		marks = [...marks, { ...cardFor }];
		save();
		cardFor = null;
	}

	function go(delta: number) {
		const i = VARIANTS.indexOf(current);
		const next = VARIANTS[(i + delta + VARIANTS.length) % VARIANTS.length];
		const url = new URL(location.href);
		url.searchParams.set('variant', next);
		history.replaceState(null, '', url);
		location.reload();
	}

	function onKey(e: KeyboardEvent) {
		const t = e.target as HTMLElement;
		if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
		if (e.key === 'm' || e.key === 'M') {
			open = !open;
		} else if (e.key === 'Escape') {
			if (cardFor) cardFor = null;
			else if (picking) stopPicking();
			else open = false;
		} else if (!open) {
			if (e.key === 'ArrowLeft') go(-1);
			if (e.key === 'ArrowRight') go(1);
		}
	}
	$effect(() => {
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	async function copyAll() {
		const lines = [
			`## /calendar/dashboard?variant=${current} — ${variantNames[current]}`,
			...marks.map(
				(m, i) =>
					`${i + 1}. **${m.verdict.toUpperCase()}** ${m.region ? `(${m.region}) ` : ''}${m.note || '(no note)'}\n   \`${m.selector}\` — “${m.text.slice(0, 60)}”`
			)
		];
		await navigator.clipboard.writeText(lines.join('\n'));
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<svelte:window onclick={(e) => picking && e.preventDefault()} />

<div
	class="fixed bottom-3 left-1/2 z-[999] -translate-x-1/2 rounded-full border-2 border-dashed border-amber-500 bg-amber-50 px-1.5 py-1.5 shadow-lg"
	style="min-width: 210px"
	role="toolbar"
	aria-label="Prototype dock"
>
	<div class="flex items-center gap-1.5">
		<button
			type="button"
			class="min-h-8 min-w-8 rounded-full px-2 text-slate-700 hover:bg-amber-100"
			onclick={() => go(-1)}
			aria-label="Previous variant"
		>
			←
		</button>
		<button
			type="button"
			class="min-h-8 flex-1 truncate rounded-full bg-white px-2 text-xs font-medium text-slate-800 ring-1 ring-amber-300"
			onclick={() => {
				panel = 'switch';
				open = !open;
			}}
		>
			{current} ({variantNames[current]})
		</button>
		<button
			type="button"
			class="min-h-8 min-w-8 rounded-full px-2 text-slate-700 hover:bg-amber-100"
			onclick={() => go(1)}
			aria-label="Next variant"
		>
			→
		</button>
		<button
			type="button"
			class="min-h-8 rounded-full px-2 text-xs text-slate-700 hover:bg-amber-100"
			onclick={() => {
				panel = 'review';
				open = !open;
			}}
		>
			Review {marks.length > 0 ? `(${marks.length})` : ''}
		</button>
	</div>

	{#if open}
		<div
			class="absolute bottom-14 left-1/2 w-80 -translate-x-1/2 rounded-2xl border border-amber-300 bg-white p-3 text-xs shadow-xl"
		>
			{#if panel === 'switch'}
				<h3 class="mb-2 font-semibold text-slate-800">Variants</h3>
				<ul class="flex flex-col gap-1">
					{#each VARIANTS as v (v)}
						<li>
							<a
								href="?variant={v}"
								class="block rounded-lg px-2 py-1.5 {v === current
									? 'bg-amber-100 font-medium'
									: 'hover:bg-slate-50'}"
							>
								{v} ({variantNames[v]})
							</a>
						</li>
					{/each}
				</ul>
				<p class="mt-2 text-[10px] text-slate-400">← → cycle · M toggles dock · Esc closes</p>
			{:else}
				<h3 class="mb-2 font-semibold text-slate-800">Review ({marks.length} marks)</h3>
				<button
					type="button"
					class="min-h-9 w-full rounded-lg bg-slate-800 px-3 py-2 text-white hover:bg-slate-700"
					onclick={startPicking}
				>
					Select elements
				</button>
				<ul class="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
					{#each marks as m, i (m.at + i)}
						<li class="rounded-lg bg-slate-50 px-2 py-1.5">
							<span class="font-semibold {m.verdict === 'bad' ? 'text-red-600' : m.verdict === 'good' ? 'text-emerald-600' : 'text-sky-600'}">
								{m.verdict}
							</span>
							<span class="text-slate-600">{m.note || m.text.slice(0, 40)}</span>
						</li>
					{/each}
				</ul>
				<div class="mt-2 flex gap-2">
					<button
						type="button"
						class="min-h-9 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
						onclick={copyAll}
					>
						{copied ? 'Copied!' : 'Copy for chat'}
					</button>
					<button
						type="button"
						class="min-h-9 rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
						onclick={() => {
							marks = [];
							localStorage.removeItem(storeKey);
						}}
					>
						Clear
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

{#if cardFor}
	<div class="fixed inset-0 z-[1000] bg-black/30" role="dialog" aria-label="Leave feedback">
		<div class="absolute left-1/2 top-1/3 w-96 -translate-x-1/2 rounded-2xl bg-white p-4 shadow-2xl">
			<p class="mb-2 text-xs text-slate-400">{cardFor.region ?? cardFor.selector}</p>
			<p class="mb-3 truncate text-sm text-slate-800">“{cardFor.text}”</p>
			<div class="mb-3 flex gap-2">
				{#each ['good', 'bad', 'idea'] as v (v)}
					<button
						type="button"
						class="min-h-10 flex-1 rounded-lg border px-3 py-2 text-sm {cardFor.verdict === v
							? 'border-slate-800 bg-slate-800 text-white'
							: 'border-slate-200 hover:bg-slate-50'}"
						onclick={() => (cardFor = { ...cardFor!, verdict: v as Mark['verdict'] })}
					>
						{v}
					</button>
				{/each}
			</div>
			<textarea
				class="mb-3 h-20 w-full rounded-lg border border-slate-200 p-2 text-sm"
				placeholder="What about it?"
				bind:value={cardFor.note}
			></textarea>
			<div class="flex gap-2">
				<button
					type="button"
					class="min-h-10 flex-1 rounded-lg bg-slate-800 px-3 py-2 text-sm text-white hover:bg-slate-700"
					onclick={saveMark}
				>
					Save mark
				</button>
				<button
					type="button"
					class="min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
					onclick={() => (cardFor = null)}
				>
					Cancel
				</button>
			</div>
		</div>
	</div>
{/if}

{#if picking}
	<style>
		:global([data-proto-hover]) {
			outline: 2px solid #f59e0b !important;
			outline-offset: 1px;
		}
	</style>
{/if}
