<script lang="ts">
	import bgCalImg from '$lib/assets/images/CalendarBackgroundImage.jpg'; //  https://wallpapersafari.com/w/3ofAZQ
	import todolistIcon from '$lib/assets/svgs/todo-list-svgrepo-com.svg'; //https://www.svgrepo.com/svg/475006/todo-list
	import coloredFamilyIcon from '$lib/assets/svgs/family-svgrepo-com.svg'; //https://www.svgrepo.com/svg/131746/family
	import calendarIcon from '$lib/assets/svgs/calendar-note-date-svgrepo-com.svg'; //https://www.svgrepo.com/svg/423010/calendar-note-date

	// export let
</script>

<svelte:head>
	<title>Family Planz: Landing Page</title>
</svelte:head>

<div>
	<section id="welcome" class="relative py-64 md:py-52 text-center ">
		<img
			src={bgCalImg}
			alt="Calendar page"
			class="absolute inset-0 top-1 box-border h-full w-full object-cover blur-sm"
		/>
		<div class="absolute inset-0 m-auto my-10 rounded-lg p-10 lg:w-3/6">
			<h1 class="mb-1 md:p-3 font-sans text-3xl md:text-5xl font-bold">Keep Your Family's Schedule Synced</h1>
			<p class="mb-5 rounded-lg bg-white p-2 md:text-lg font-mono text-slate-700 opacity-80">
				Family Planz keeps your busy household organized and connected. Never miss an important
				event again.
			</p>
			<button class="rounded bg-secondary-500 p-3 text-xl font-bold text-white">Get Started for Free</button>
		</div>
	</section>
	<section id="features" class="relative bg-primary-100 px-10 py-3 pb-6 text-center">
		<h1 class="mb-1 p-3 font-sans text-2xl font-bold">Features</h1>
		<div class="px-2">
			<div class="-mx-2 flex flex-auto flex-wrap gap-y-5">
				<div class="px-2 lg:w-1/3 lg:px-10 m-auto">
					<div class="h-96 max-w-72 rounded-2xl bg-primary-300 lg:max-w-none">
						<div class="w-full p-2 py-10 text-center">
							<!-- <img src={familyIcon} alt="Family Icon" class="m-auto mb-5 w-64 h-64"/> -->
							<!-- <h3 class="font-bold text-xl"> Built by Large Families for large families</h3> -->
							<img src={calendarIcon} alt="Calendar Icon" class="m-auto mb-5 h-64 w-64" />
							<h3 class="text-xl font-bold">A Highly Configurable Month View</h3>
						</div>
					</div>
				</div>
				<div class="px-2 lg:w-1/3 lg:px-10 m-auto">
					<div class="h-96 max-w-72 rounded-2xl bg-primary-300 lg:max-w-none">
						<div class="w-full p-2 py-10 text-center">
							<img src={todolistIcon} alt="Todo list Icon" class="m-auto mb-5 h-64 w-64" />
							<h3 class="text-xl font-bold">Daily Todo List</h3>
						</div>
					</div>
				</div>
				<div class="px-2 lg:w-1/3 lg:px-10 m-auto">
					<div class="h-96 max-w-72 rounded-2xl bg-primary-300 lg:max-w-none">
						<div class="w-full p-2 py-10 text-center">
							<img src={coloredFamilyIcon} alt="Colord Family Icon" class="m-auto mb-5 h-64 w-64" />
							<h3 class="px-1 text-xl font-bold">Color-code Each Family Member's Events</h3>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>
	<section id="end" class="relative bg-secondary-100 px-10 py-10 md:py-3 text-center ">
		<div class="h-64 w-full text-center">
			<h1 class="mb-1 md:p-3 font-sans text-5xl font-bold">Ready to get Started?</h1>
			<p class="md:mx-20 mb-2 md:mb-5 rounded-lg p-2 py-3 font-mono text-slate-700 opacity-80">
				"A family that planz together, stays together" <br />~Unknown
			</p>
			<button class="rounded bg-secondary-500 text-white p-3 text-xl font-bold">Get Started for Free</button>
		</div>
	</section>
</div>
