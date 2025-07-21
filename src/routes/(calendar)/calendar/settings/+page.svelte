<h1 class="mb-6 text-2xl font-bold">Calendar Settings</h1>

<form class="max-w-2xl space-y-6">
	<div class="space-y-2">
		<label for="weekStart" class="block font-medium">Week Start</label>
		<select id="weekStart" name="weekStart" class="w-full rounded-md border p-2">
			<option value="sunday">Sunday</option>
			<option value="monday">Monday</option>
		</select>
	</div>

	<div class="space-y-2">
		<label for="timeZone" class="block font-medium">Time Zone</label>
		<select id="timeZone" name="timeZone" class="w-full rounded-md border p-2">
			<option value="America/New_York">Eastern Time (ET)</option>
			<option value="America/Chicago">Central Time (CT)</option>
			<option value="America/Denver">Mountain Time (MT)</option>
			<option value="America/Los_Angeles">Pacific Time (PT)</option>
			<option value="UTC">UTC</option>
		</select>
	</div>

	<div class="space-y-2">
		<label for="color" class="block font-medium">Default Event Color</label>
		<input type="color" id="color" name="color" class="h-10 w-full rounded-md border p-1" />
	</div>

	<button
		type="submit"
		class="w-full rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
	>
		Save Settings
	</button>
</form>
