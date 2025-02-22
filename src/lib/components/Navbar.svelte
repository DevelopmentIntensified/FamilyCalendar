<script lang="ts">
  import { page } from '$app/stores';
  import { slide } from 'svelte/transition';
  import Calendar from './icons/Calendar.svelte';

  export let isAdmin: boolean;
  export let isLoggedIn: boolean;

  console.warn('DEBUGPRINT[2]: Navbar.svelte:7: isAdmin=', isAdmin);

  let isOpen = false;

  const navItems = [
    { href: '/', label: 'Home' },
    { href: '/about', label: 'About' },
    { href: '/contact', label: 'Contact' }
  ];
  if (isLoggedIn) {
    navItems.push({
      href: '/calendar',
      label: 'Calendar'
    });
  }

  const adminItems = [];

  function toggleMenu() {
    isOpen = !isOpen;
  }

  function closeMenu() {
    isOpen = false;
  }
</script>

<nav class="bg-primary-600 text-white">
  <div class="max-w-7xl px-4 md:px-6 lg:px-8">
    <div class="flex h-16 items-center justify-start">
      <div class="flex items-center">
        <a href="/" class="flex-shrink-0">
            <Calendar class="h-12 w-12" />
        </a>
        <div class="hidden lg:block">
          <div class="ml-10 flex items-baseline space-x-4">
            {#each navItems as item}
              <a
                href={item.href}
                class="rounded-md px-2 py-2 text-sm font-medium hover:bg-primary-700 {$page.url
                  .pathname === item.href
                  ? 'bg-primary-700'
                  : ''}"
              >
                {item.label}
              </a>
            {/each}
            {#if isAdmin}
              {#each adminItems as item}
                <a
                  href={item.href}
                  class="rounded-md px-3 py-2 text-sm font-medium hover:bg-primary-700 {$page.url
                    .pathname === item.href
                    ? 'bg-primary-700'
                    : ''}"
                >
                  {item.label}
                </a>
              {/each}
            {/if}
          </div>
        </div>
      </div>
      <div class="hidden lg:block">
        <div class="ml-4 flex items-center lg:ml-6">
          {#if isLoggedIn}
            <form action="/api/logout" class="absolute right-5" method="POST">
              <button
                type="submit"
                class="rounded-md px-3 py-2 text-sm font-medium hover:bg-primary-700">Logout</button
              >
            </form>
          {:else}
            <a
              href={'/login'}
              class="absolute right-5 rounded bg-primary-600 px-4 py-2 font-bold text-white transition duration-300 hover:bg-primary-700"
            >
              Login
            </a>
            <!-- <a href="/login" class="px-3 py-2 rounded-md text-sm font-medium hover:bg-primary-700">Login</a> -->
            <!-- <a href="/register" class="px-3 py-2 rounded-md text-sm font-medium hover:bg-primary-700">Register</a> -->
          {/if}
        </div>
      </div>
      <div class="w-full lg:hidden">
        <button
          on:click={toggleMenu}
          class="absolute right-5 top-3 inline-flex items-center justify-center rounded-md p-2 text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
        >
          <span class="sr-only">Open main menu</span>
          {#if isOpen}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          {:else}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          {/if}
        </button>
      </div>
    </div>
  </div>

  {#if isOpen}
    <div transition:slide={{ duration: 300 }} class="lg:hidden">
      <div class="space-y-1 px-2 pb-3 pt-2 lg:px-3">
        {#each navItems as item}
          <a
            href={item.href}
            on:click={closeMenu}
            class="block rounded-md px-3 py-2 text-center text-base font-medium hover:bg-primary-700 {$page
              .url.pathname === item.href
              ? 'bg-primary-700'
              : ''}"
          >
            {item.label}
          </a>
        {/each}
        {#if isAdmin}
          {#each adminItems as item}
            <a
              href={item.href}
              on:click={closeMenu}
              class="block rounded-md px-3 py-2 text-center text-base font-medium hover:bg-primary-700 {$page
                .url.pathname === item.href
                ? 'bg-primary-700'
                : ''}"
            >
              {item.label}
            </a>
          {/each}
        {/if}
        {#if isLoggedIn}
          <form action="/api/logout" method="POST" class="block">
            <button
              type="submit"
              on:click={closeMenu}
              class="w-full rounded-md px-3 py-2 text-center text-base font-medium hover:bg-primary-700"
              >Logout</button
            >
          </form>
        {:else}
          <a
            href={'/login'}
            on:click={closeMenu}
            class="block rounded-md bg-primary-600 px-3 py-2 text-center text-base font-medium hover:bg-primary-700 {$page
              .url.pathname === '/login'
              ? 'bg-primary-700'
              : ''}"
          >
            Join Us
          </a>
          <!-- <a href="/login" on:click={closeMenu} class="block px-3 py-2 rounded-md text-base font-medium hover:bg-primary-700">Login</a> -->
          <!-- <a href="/register" on:click={closeMenu} class="block px-3 py-2 rounded-md text-base font-medium hover:bg-primary-700">Register</a> -->
        {/if}
      </div>
    </div>
  {/if}
</nav>

