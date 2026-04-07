# Family Planz - Feature Completion Plan

## Overview
Complete all incomplete core features to make the application production-ready.

---

## Priority 1: Critical Bug Fixes

### 1.1 Schema/Data Integrity Fixes
- [ ] Add `name` field to `calendars` table schema
- [ ] Fix `Calendar` type to include `name` field
- [ ] Remove debug `console.warn` statements from all files
- [ ] Fix DateTime.fromJSDate() calls where `date` property doesn't exist

### 1.2 Calendar Component Fixes
- [ ] Connect calendar view to actual user/family event colors
- [ ] Fix calendar selector in event creation form
- [ ] Make month view properly display multi-day events

---

## Priority 2: Event Management

### 2.1 Event Creation
- [ ] Ensure calendar selector works with real data
- [ ] Add default values for calendar selection
- [ ] Add success/error feedback after creation
- [ ] Redirect to calendar after successful creation

### 2.2 Event Editing
- [ ] Implement form actions in `event/edit/[id]/+page.server.ts`
- [ ] Pre-populate form with existing event data
- [ ] Handle calendar ownership validation

### 2.3 Event Viewing & Deletion
- [ ] Add delete functionality to `event/[id]/+page.svelte`
- [ ] Implement server action for deletion
- [ ] Add RSVP/attendance functionality
- [ ] Display event attendance status

---

## Priority 3: Family Management

### 3.1 Family Invitations
- [ ] Implement invite code generation in `families.ts`
- [ ] Create invite code verification endpoint
- [ ] Build invite acceptance flow
- [ ] Add "view family invitations" functionality

### 3.2 Family Pages
- [ ] Connect "View Family Details" button to actual page
- [ ] Add family member list with roles
- [ ] Implement family member removal
- [ ] Add family settings (rename, change color)

### 3.3 Add Members Flow
- [ ] Complete add member page functionality
- [ ] Handle member search/selection
- [ ] Set member roles (admin, member)

---

## Priority 4: Settings

### 4.1 User Settings
- [ ] Implement save functionality for settings form
- [ ] Connect timezone selector to actual user preferences
- [ ] Save default event color
- [ ] Persist week start preference
- [ ] Add timezone detection with full timezone list

### 4.2 Settings Page Improvements
- [ ] Add loading states
- [ ] Add success/error messages
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

## Branch Strategy

### Branch: `feature/complete-core-features`
Main feature branch for all incomplete features.

### Sub-branches (parallel work):
1. `fix/schema-integrity` - Schema fixes and debug cleanup
2. `feat/event-management` - Complete event CRUD
3. `feat/family-invites` - Family invitation system
4. `feat/settings-completion` - Settings form actions
5. `feat/account-management` - User account pages
6. `feat/marketing-content` - Marketing page content

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
