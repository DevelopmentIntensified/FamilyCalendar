<script lang="ts">
	import FeatureCard from '$lib/components/marketing/FeatureCard.svelte';
	import MomentCard from '$lib/components/marketing/MomentCard.svelte';
	import GalleryCard from '$lib/components/marketing/GalleryCard.svelte';
	import TestimonialCard from '$lib/components/marketing/TestimonialCard.svelte';
	import StrugglePanel from '$lib/components/marketing/StrugglePanel.svelte';
	import type { FeatureIcon } from '$lib/components/marketing/featureIcons';

	const features: { icon: FeatureIcon; title: string; blurb: string }[] = [
		{
			icon: 'calendar',
			title: 'Shared Family Calendar',
			blurb: 'Everyone\'s events in one place. No more "who\'s picking up the kids?" texts.'
		},
		{
			icon: 'bolt',
			title: 'Smart Event Import',
			blurb:
				'Paste a text from your spouse or email from school. Our smart algorithm creates the event.'
		},
		{
			icon: 'users',
			title: 'Family Groups & Invites',
			blurb: 'Invite your spouse, kids, grandparents—anyone who needs to be in the loop.'
		},
		{
			icon: 'printer',
			title: 'Print for the Fridge',
			blurb: "Hang the weekly schedule on the fridge so everyone can see what's happening."
		},
		{
			icon: 'phone',
			title: 'Works Everywhere',
			blurb: 'Check the calendar from your phone at practice, tablet on couch, or laptop at work.'
		},
		{
			icon: 'clipboard',
			title: 'RSVP to Events',
			blurb: "Know who's coming to game night or the school play. Going, maybe, or can't make it."
		}
	];

	const moments = [
		{
			icon: 'clock' as const,
			gradient: 'from-[#FED5CF] to-[#F1B598]/50',
			glow: 'bg-[#F1B598]/30',
			title: 'Morning routines',
			blurb:
				"Who's dropping off who? What time is the dentist? See it all at a glance before the day starts."
		},
		{
			icon: 'smile' as const,
			gradient: 'from-[#C4E9DA] to-[#BEDAE3]/50',
			glow: 'bg-[#C4E9DA]/30',
			title: "Kids' activities",
			blurb:
				'Soccer, piano, ballet, scouts—track every activity, every location, every pickup time in one place.'
		},
		{
			icon: 'heart' as const,
			gradient: 'from-[#D3C7E6] to-[#BEDAE3]/50',
			glow: 'bg-[#D3C7E6]/30',
			title: 'Family time',
			blurb:
				"Date nights, game nights, grandma's visit—make sure the important moments never get double-booked."
		}
	];

	const gallery = [
		{
			img: 'https://images.pexels.com/photos/4624879/pexels-photo-4624879.jpeg?auto=compress&cs=tinysrgb&w=600',
			alt: 'Mother and son sitting together in living room',
			title: 'Growing families',
			blurb: 'From two to three to four—your calendar grows with you'
		},
		{
			img: 'https://images.pexels.com/photos/5082644/pexels-photo-5082644.jpeg?auto=compress&cs=tinysrgb&w=600',
			alt: 'Big family enjoying breakfast together in kitchen',
			title: 'Busy households',
			blurb: 'Multiple kids, multiple schedules, one simple calendar'
		},
		{
			img: 'https://images.pexels.com/photos/5637704/pexels-photo-5637704.jpeg?auto=compress&cs=tinysrgb&w=600',
			alt: 'Happy multigenerational Asian family sitting together on bench',
			title: 'Extended families',
			blurb: 'Grandparents, aunts, uncles—invite everyone who cares',
			wide: true
		}
	];

	const struggles = {
		before: [
			'"Who\'s picking up the kids?"—texting back and forth',
			'Double-booked soccer practice and piano lessons',
			'Grandma shows up on the wrong day for dinner',
			'Events buried in emails, texts, and sticky notes'
		],
		after: [
			'One shared calendar—everyone sees the same schedule',
			"Color-coded by family member so you know who's where",
			'Paste a text or email—our smart algorithm adds it to the calendar instantly',
			"RSVP to family events so everyone knows who's coming"
		]
	};

	const testimonials = [
		{
			accent: 'border-[#FED5CF] bg-[#FED5CF]/20',
			star: 'text-[#F1B598]',
			avatar: 'from-[#FED5CF] to-[#F1B598]',
			quote:
				"We used to have three different calendars between us. Now everything is in one place. My husband and I finally stopped texting 'who's picking up the kids?'",
			initial: 'S',
			name: 'Sarah M.',
			detail: 'Mom of 3 · Austin, TX'
		},
		{
			accent: 'border-[#BEDAE3] bg-[#BEDAE3]/20',
			star: 'text-[#366d7e]',
			avatar: 'from-[#BEDAE3] to-[#8fbecb]',
			quote:
				"The smart paste feature is a game changer. I just copy the email from my kid's teacher and boom—it's on our family calendar. Even my teenagers use it.",
			initial: 'M',
			name: 'Mike T.',
			detail: 'Dad of 2 · Denver, CO'
		},
		{
			accent: 'border-[#C4E9DA] bg-[#C4E9DA]/20',
			star: 'text-[#2d5866]',
			avatar: 'from-[#C4E9DA] to-[#5fa0b1]',
			quote:
				"I invited my parents with one code and now they always know when the grandkids have events. No more 'when is the recital again?' phone calls!",
			initial: 'J',
			name: 'Jessica L.',
			detail: 'Mom of 1 · Portland, OR'
		}
	];
</script>

<svelte:head>
	<title>Features - Family Planz</title>
</svelte:head>

<div class="min-h-screen bg-[#F8F6F3]">
	<!-- Hero -->
	<section
		class="relative overflow-hidden bg-gradient-to-br from-[#BEDAE3]/30 via-white to-[#FED5CF]/30 py-20"
	>
		<div
			class="absolute -right-32 -top-32 h-[500px] w-[500px] rounded-full bg-[#BEDAE3]/20 blur-3xl"
		></div>
		<div
			class="absolute -bottom-32 -left-32 h-[400px] w-[400px] rounded-full bg-[#FED5CF]/20 blur-3xl"
		></div>

		<div class="relative mx-auto max-w-7xl px-6 text-center">
			<h1 class="mb-6 text-4xl font-bold text-slate-900 md:text-5xl">
				Everything your <span class="text-[#c45e38]">family</span> needs
			</h1>
			<p class="mx-auto max-w-2xl text-lg text-slate-600 md:text-xl">
				Simple, powerful features designed for real family life.
			</p>
		</div>
	</section>

	<!-- Features Grid -->
	<section class="bg-white py-20">
		<div class="mx-auto max-w-7xl px-6">
			<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				{#each features as feature}
					<FeatureCard {...feature} />
				{/each}
			</div>
		</div>
	</section>

	<!-- Family Life Moments -->
	<section class="bg-gradient-to-b from-white to-[#FED5CF]/10 py-20">
		<div class="mx-auto max-w-7xl px-6">
			<div class="mb-16 text-center">
				<h2 class="mb-4 text-3xl font-bold text-slate-900 md:text-4xl">
					For every moment that matters
				</h2>
				<p class="mx-auto max-w-2xl text-lg text-slate-600">
					From morning drop-offs to bedtime stories—keep your family's rhythm in one place.
				</p>
			</div>

			<div class="grid gap-6 md:grid-cols-3">
				{#each moments as moment}
					<MomentCard {...moment} />
				{/each}
			</div>
		</div>
	</section>

	<!-- Problem/Solution -->
	<section class="bg-white py-20">
		<div class="mx-auto max-w-7xl px-6">
			<div class="mb-12 text-center">
				<h2 class="mb-4 text-3xl font-bold text-slate-900 md:text-4xl">We know the struggle</h2>
				<p class="mx-auto max-w-2xl text-lg text-slate-600">Because we're parents too.</p>
			</div>

			<div class="grid gap-8 md:grid-cols-2">
				<StrugglePanel tone="before" title="Before Family Planz" items={struggles.before} />
				<StrugglePanel tone="after" title="With Family Planz" items={struggles.after} />
			</div>
		</div>
	</section>

	<!-- Family Gallery -->
	<section class="bg-gradient-to-b from-[#FED5CF]/10 to-white py-20">
		<div class="mx-auto max-w-7xl px-6">
			<div class="mb-16 text-center">
				<h2 class="mb-4 text-3xl font-bold text-slate-900 md:text-4xl">
					Built for real family life
				</h2>
				<p class="mx-auto max-w-2xl text-lg text-slate-600">
					Whether you're a family of 2 or 12, we've got you covered.
				</p>
			</div>

			<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				{#each gallery as card}
					<GalleryCard {...card} />
				{/each}
			</div>
		</div>
	</section>

	<!-- Testimonials -->
	<section class="bg-white py-20">
		<div class="mx-auto max-w-7xl px-6">
			<div class="mb-16 text-center">
				<h2 class="mb-4 text-3xl font-bold text-slate-900 md:text-4xl">
					Families love Family Planz
				</h2>
				<p class="mx-auto max-w-2xl text-lg text-slate-600">
					Don't just take our word for it—hear from real families.
				</p>
			</div>

			<div class="grid gap-8 md:grid-cols-3">
				{#each testimonials as t}
					<TestimonialCard {...t} />
				{/each}
			</div>
		</div>
	</section>

	<!-- CTA -->
	<section class="bg-gradient-to-b from-white to-[#FED5CF]/10 py-20">
		<div class="mx-auto max-w-4xl px-6 text-center">
			<h2 class="mb-4 text-3xl font-bold text-slate-900 md:text-4xl">
				Ready to bring your family together?
			</h2>
			<p class="mx-auto mb-10 max-w-2xl text-xl text-slate-600">
				Join thousands of families who've simplified their lives with Family Planz.
			</p>
			<a
				href="/signup"
				class="inline-block rounded-full bg-[#c45e38] px-10 py-4 text-lg font-bold text-white shadow-lg shadow-[#c45e38]/30 transition-all hover:scale-105 hover:bg-[#a14d32] hover:shadow-xl"
			>
				Start Free for Your Family
			</a>
			<p class="mt-4 text-sm text-slate-500">
				No credit card required. Free forever for small families.
			</p>
		</div>
	</section>
</div>
