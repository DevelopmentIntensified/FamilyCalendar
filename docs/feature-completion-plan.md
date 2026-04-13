# Family Planz - Feature Completion Plan

## Overview
Complete all incomplete core features to make the application production-ready.

---

## Priority 1: Critical Bug Fixes

### 1.1 Schema/Data Integrity Fixes
- [x] Add `name` field to `calendars` table schema (ALREADY EXISTS in schema.ts:223)
- [x] Fix `Calendar` type to include `name` field (INFERRED from schema)
- [x] Remove debug `console.warn` statements from all files (FIXED: removed from EmailSignupWithCode.test.ts)
- [x] Fix DateTime.fromJSDate() calls where `date` property doesn't exist (CODE ALREADY ADDS date property before calling fromJSDate in +page.server.ts)

### 1.2 Calendar Component Fixes
- [x] Connect calendar view to actual user/family event colors (NOW READS FROM userSettings.color)
- [x] Fix calendar selector in event creation form (IMPLEMENTED: populates from data.calendarIds - needs testing)
- [x] Make month view properly display multi-day events (IMPLEMENTED: parseEvents function - needs testing)

---

## Priority 2: Event Management

### 2.1 Event Creation
- [x] Ensure calendar selector works with real data
- [x] Add default values for calendar selection
- [x] Add success/error feedback after creation
- [x] Redirect to calendar after successful creation

### 2.2 Event Editing
- [x] Implement form actions in `event/edit/[id]/+page.server.ts`
- [x] Pre-populate form with existing event data
- [x] Handle calendar ownership validation

### 2.3 Event Viewing & Deletion
- [x] Add delete functionality to `event/[id]/+page.svelte`
- [x] Implement server action for deletion
- [x] Add RSVP/attendance functionality
- [x] Display event attendance status

---

## Priority 3: Family Management

### 3.1 Family Invitations
- [x] Implement invite code generation in `families.ts`
- [x] Create invite code verification endpoint
- [x] Build invite acceptance flow
- [x] Add "view family invitations" functionality

### 3.2 Family Pages
- [x] Connect "View Family Details" button to actual page
- [x] Add family member list with roles
- [ ] Implement family member removal
- [ ] Add family settings (rename, change color)

### 3.3 Add Members Flow
- [x] Complete add member page functionality
- [ ] Handle member search/selection
- [x] Set member roles (admin, member)

---

## Priority 4: Settings

### 4.1 User Settings
- [x] Implement save functionality for settings form
- [x] Connect timezone selector to actual user preferences
- [x] Save default event color
- [x] Persist week start preference
- [x] Add timezone detection with full timezone list

### 4.2 Settings Page Improvements
- [x] Add loading states
- [x] Add success/error messages
- [ ] Add account deletion option
- [ ] Add profile editing (name, email)

---

## Priority 5: User Account

### 5.1 Account Management
- [ ] Create dedicated account settings page
- [ ] Add name change functionality
- [ ] Add email change with verification
- [ ] Implement logout from all devices option

### 5.2 Navigation
- [ ] Add profile dropdown with account settings link
- [ ] Add family management link
- [ ] Improve navbar with user context

---

## Priority 6: Marketing Pages

### 6.1 Pricing Page
- [ ] Design pricing tiers
- [ ] Create subscription flow UI
- [ ] Add Stripe/payment integration (future)

### 6.2 Contact Page
- [ ] Add contact form
- [ ] Connect to email service
- [ ] Add spam protection

### 6.3 About Page
- [ ] Write about content
- [ ] Add team photos/bios
- [ ] Add mission statement

---

## Priority 7: Mobile & UX

### 7.1 Mobile Optimization
- [ ] Optimize calendar for mobile view
- [ ] Add responsive event forms
- [ ] Improve touch interactions

### 7.2 Notifications
- [ ] Implement email reminders for events
- [ ] Add notification preferences
- [ ] Create reminder scheduling system

---

## Testing Requirements
- [ ] Update e2e tests for event creation flow
- [ ] Add e2e tests for family management
- [ ] Add unit tests for new utility functions
- [ ] Test across browsers (Chrome, Firefox, Safari)
- [ ] Mobile responsiveness testing

---

## Deployment Checklist
- [ ] Run `npm run check` without errors
- [ ] Run `npm run lint` without errors
- [ ] All e2e tests passing
- [ ] Environment variables configured on Vercel
- [ ] Database migrations run
- [ ] Test on staging URL before production
