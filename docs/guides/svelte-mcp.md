# Svelte MCP server

The Svelte MCP server gives you the full Svelte 5 and SvelteKit documentation. Use its tools like this.

## 1. list-sections

Use this first to discover the documentation sections. It returns a structured list of titles, use cases and paths. For any Svelte or SvelteKit question, call it at the start of the chat to find the relevant sections.

## 2. get-documentation

Fetches the full content of one or more sections. After calling `list-sections`, read the returned sections (especially the `use_cases` field). Then use `get-documentation` to fetch every section that is relevant to your task.

## 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions. You must run it on any Svelte code you write, before sending the code to the user. Keep calling it until it returns no issues or suggestions.

## 4. playground-link

Generates a Svelte Playground link for the code. After finishing the code, ask the user whether they want a playground link. Only call this tool after the user confirms, and never for code that was written to files in this project.
