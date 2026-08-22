# Mobile App & Chrome Extension Feature Plan

## Table of Contents
1. [Mobile App (Capacitor)](#mobile-app-capacitor)
2. [Chrome Extension](#chrome-extension)
3. [Priority & Complexity Matrix](#priority--complexity-matrix)

---

## Mobile App (Capacitor)

### Current Setup
- App ID: `com.familyplanz.app`
- App Name: `Family Planz`
- Capacitor 7.x with Android & iOS plugins
- `@capacitor/geolocation` already installed

---

### 1. Push Notifications for Events

**Description**: Send local or push notifications to remind users of upcoming family events.

**Technical Approach**:
- Use `@capacitor/local-notifications` for local notifications (free, works offline)
- For remote push: integrate `@capacitor/push-notifications` with Firebase Cloud Messaging (FCM)
- Create a notification schedule service that:
  - Fetches upcoming events from API on app launch/background
  - Schedules local notifications at configurable intervals (e.g., 1 hour, 1 day before)
  - Handles notification tap to open specific event detail page

**Priority**: P1 (High)
**Complexity**: Medium
**Dependencies**: `@capacitor/local-notifications`, `@capacitor/push-notifications` (optional for remote)

---

### 2. Offline Calendar Viewing

**Description**: Allow users to view calendar events without internet connectivity.

**Technical Approach**:
- Implement SQLite database using `@capacitor/sqlite` or prefer `@op-engineering/op-sqlite`
- Create sync service that:
  - On first load: fetches all user events/family events and stores in local DB
  - On subsequent loads: sync changes (delta sync with `updatedAt` timestamp)
  - Serve offline data from local DB when network unavailable
- Use SvelteKit service worker for caching static assets
- Show sync status indicator in UI

**Priority**: P1 (High)
**Complexity**: High
**Dependencies**: `@capacitor/sqlite` or `@op-engineering/op-sqlite`

---

### 3. Home Screen Widget

**Description**: Display next upcoming family event on Android/iOS home screens.

**Technical Approach**:
- **Android**: Use Android Widget (Compose/ XML) with `AppWidgetProvider`
- **iOS**: Use WidgetKit with Timeline Provider
- Widget displays: event title, time, family name
- Tap widget opens app to event detail
- Update widget via background work (WorkManager for Android, BGTaskScheduler for iOS)
- Minimum viable: show next 3 events in small/medium widget sizes

**Priority**: P2 (Medium)
**Complexity**: High
**Dependencies**: Native widget development (Kotlin/Swift), Android Widget API, WidgetKit

---

### 4. Quick Add from Notification

**Description**: Add quick actions in notifications to add events without opening app.

**Technical Approach**:
- Use notification actions (Android) / notification categories (iOS)
- Add "Add Event" button in event reminder notifications
- On action tap: open app with modal for quick event creation
- Pre-fill with event title, use current time as default start
- Requires: handle deep links from notification to specific route

**Priority**: P2 (Medium)
**Complexity**: Medium
**Dependencies**: Capacitor deep linking (`@capacitor/app`), notification actions

---

### 5. Additional Mobile Features to Consider

| Feature | Description | Priority | Complexity |
|---------|-------------|----------|------------|
| Biometric Auth | Face ID/Touch ID for app lock | P2 | Low |
| Share Extension | Share events to other apps | P3 | Medium |
| Calendar Sync | Two-way sync with device calendar | P3 | High |
| Location Reminders | Notify when near event location | P3 | Medium |

---

## Chrome Extension

### Overview
A lightweight Chrome extension providing quick access to family calendar without opening the full web app.

---

### 1. Next Upcoming Event Popup

**Description**: Show the next family event in the extension popup when clicked.

**Technical Approach**:
- Build as separate bundle in `/extensions/chrome`
- Use Chrome Storage (`chrome.storage.local`) to cache events
- Fetch events from main app API (requires auth token storage)
- Display: event title, date/time, location (if any), family name
- Auto-refresh every 5 minutes or on popup open
- Handle unauthenticated state with "Open App to Login" CTA

**Permissions Needed**: `storage`, `tabs`
**Communication**: REST API calls to main app (authenticated via stored token)

**Priority**: P1 (High)
**Complexity**: Low

---

### 2. Quick Add Event Shortcut

**Description**: Keyboard shortcut or popup form to quickly create an event.

**Technical Approach**:
- Add "Quick Add" button in popup
- Simple form: title (required), date/time picker, family selector
- Submit posts to API endpoint `/api/events/quick-add`
- Show success/error feedback inline
- Use `chrome.identity` for OAuth flow if needed, or share auth cookie via background script

**Permissions Needed**: `storage`, `identity`, `activeTab`
**Communication**: POST to main app API with stored auth token

**Priority**: P1 (High)
**Complexity**: Low

---

### 3. Quick Link to Main App

**Description**: Easy navigation button to open full calendar app in new tab.

**Technical Approach**:
- "Open Full Calendar" button in popup
- Links to configured app URL (e.g., `https://familyplanz.app/calendar`)
- Could also support "Open Settings" for token management

**Permissions Needed**: `tabs`
**Communication**: None (simple navigation)

**Priority**: P2 (Medium)
**Complexity**: Trivial

---

### 4. Background Sync & Notifications

**Description**: Periodically check for upcoming events and show Chrome notifications.

**Technical Approach**:
- Use Chrome `alarms` API to run background task every 15 minutes
- Check for events starting within next hour
- Use `chrome.notifications` API to show browser notification
- Clicking notification opens popup or main app

**Permissions Needed**: `alarms`, `notifications`, `background`
**Communication**: API calls from background script

**Priority**: P3 (Low - Nice to have)
**Complexity**: Medium

---

### 5. Chrome Extension Communication with Main App

**Authentication Flow**:
1. User logs in to main web app
2. Extension stores auth token in `chrome.storage.local` (from settings page or popup)
3. All API requests include token in Authorization header
4. Token refresh handled by main app; user re-authenticates if expired

**API Endpoints to Create**:
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/extension/events/upcoming` | GET | Get next N events for popup |
| `/api/extension/events/quick-add` | POST | Create event from extension |
| `/api/extension/auth/validate` | POST | Validate stored token |

**Manifest Requirements**:
```json
{
  "permissions": ["storage", "tabs", "alarms", "notifications"],
  "host_permissions": ["https://familyplanz.app/*"],
  "oauth2": {
    "client_id": "chrome-extension-client",
    "scopes": ["read", "write"]
  }
}
```

---

## Priority & Complexity Matrix

### Mobile App (Capacitor)

| Feature | Priority | Complexity | Effort |
|---------|----------|------------|--------|
| Push Notifications | P1 | Medium | 2-3 weeks |
| Offline Viewing | P1 | High | 3-4 weeks |
| Home Screen Widget | P2 | High | 3-4 weeks |
| Quick Add from Notification | P2 | Medium | 1-2 weeks |
| Biometric Auth | P2 | Low | 1 week |

### Chrome Extension

| Feature | Priority | Complexity | Effort |
|---------|----------|------------|--------|
| Next Event Popup | P1 | Low | 1-2 weeks |
| Quick Add Shortcut | P1 | Low | 1-2 weeks |
| Quick Link to App | P2 | Trivial | 1 day |
| Background Sync/Notifications | P3 | Medium | 2 weeks |

---

## Implementation Roadmap

### Phase 1 (MVP - 2-3 weeks)
1. Mobile: Push notifications setup
2. Chrome Extension: Next event popup + quick add

### Phase 2 (2-3 weeks)
1. Mobile: Offline calendar viewing
2. Chrome Extension: Background notifications

### Phase 3 (3-4 weeks)
1. Mobile: Home screen widget
2. Chrome Extension: Token management improvements

---

## Technical Notes

- **Auth**: Consider using Lucia Auth tokens; extension can share session via shared origin or explicit token storage
- **API**: Create dedicated extension API routes with CORS headers for extension origins
- **Offline**: Use IndexedDB in extension for event caching (larger capacity than storage API)
- **Mobile**: Ensure PWA capabilities first, then wrap with Capacitor for native features