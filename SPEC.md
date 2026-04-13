# Timezone Handling Fix - SPEC.md

## Problem
Events are not maintaining correct timezone when created and displayed. The issues are:
1. Event creation parses datetime without user's timezone
2. Event display uses `DateTime.fromJSDate()` without user timezone
3. DST transitions are not handled correctly

## Solution Overview
- Store dates in DB with timezone info (ISO strings with offset)
- Parse input datetime using user's configured timezone from settings
- Display events using user's timezone from settings (not system timezone)

## Files to Fix

### 1. `src/routes/(calendar)/calendar/event/new/+page.server.ts`
- Get user's timezone from userSettings
- Parse start/end datetime with user's timezone using `DateTime.fromISO(dateStr, { zone: userTimeZone })`
- Store as ISO string with timezone offset

### 2. `src/routes/(calendar)/calendar/+page.server.ts`
- Pass user's timezone to frontend (already available in userSettings)
- No changes needed - timezone info is already in userSettings

### 3. `src/routes/(calendar)/calendar/+page.svelte`
- Use `DateTime.fromJSDate(e.start).setZone(timeZone)` instead of `DateTime.fromJSDate(e.start)`
- This ensures events are displayed in user's timezone

### 4. `src/routes/(calendar)/calendar/event/[id]/+page.svelte`
- Get user's timezone from data
- Use `setZone(timeZone)` when creating DateTime objects for display

## Expected Behavior
- Events created in America/New_York timezone show correct local time
- DST transitions handled correctly (events don't shift by hour)
- User's timezone preference from settings is always used
- Cross-timezone users see correct times

## Testing
- Add timezone utility functions tests
- Test parsing with different timezones
- Test DST handling