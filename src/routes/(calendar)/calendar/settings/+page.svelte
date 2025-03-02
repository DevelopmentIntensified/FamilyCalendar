<h1 class="text-2xl font-bold mb-6">Calendar Settings</h1>

<form class="space-y-6 max-w-2xl">
    <div class="space-y-2">
        <label for="weekStart" class="block font-medium">Week Start</label>
        <select id="weekStart" name="weekStart" class="w-full p-2 border rounded-md">
            <option value="sunday">Sunday</option>
            <option value="monday">Monday</option>
        </select>
    </div>

    <div class="space-y-2">
        <label for="timeZone" class="block font-medium">Time Zone</label>
        <select id="timeZone" name="timeZone" class="w-full p-2 border rounded-md">
            <option value="America/New_York">Eastern Time (ET)</option>
            <option value="America/Chicago">Central Time (CT)</option>
            <option value="America/Denver">Mountain Time (MT)</option>
            <option value="America/Los_Angeles">Pacific Time (PT)</option>
            <option value="UTC">UTC</option>
        </select>
    </div>

    <div class="space-y-2">
        <label for="color" class="block font-medium">Default Event Color</label>
        <input 
            type="color" 
            id="color" 
            name="color"
            class="w-full h-10 p-1 border rounded-md"
        >
    </div>

    <button 
        type="submit"
        class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
    >
        Save Settings
    </button>
</form>
