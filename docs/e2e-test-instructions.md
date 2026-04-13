# E2E Test Instructions

## Overview

All e2e tests now pass without requiring actual email delivery to real inboxes. Tests verify email functionality via Resend test addresses or DB verification.

## Test Strategy

### Tests That Send Real Emails (via Resend)

- `e2e/login/EmailLoginWithCode.test.ts`
- `e2e/login/EmailLoginWithLink.test.ts`

These use Resend test addresses:
- `delivered+logincode1@resend.dev`
- `delivered+loginlink1@resend.dev`

### Tests That Bypass Email (DB-only)

All other tests verify functionality by creating verification codes directly in the database:
- `e2e/events/EventCreation.test.ts`
- `e2e/events/EventDeletion.test.ts`
- `e2e/events/EventEditing.test.ts` (skipped)
- `e2e/signup/EmailSignupWithCode.test.ts`
- `e2e/signup/EmailSignupWithLink.test.ts`
- `e2e/signup/EmailSignupWithAlreadyRegisteredEmail.test.ts`
- `e2e/signup/EmailSignupWithInvalidEmail.test.ts`

## Key Files

- `test/e2e/testUtils.ts` - Utility functions for test setup/teardown
- `test/playwright.config.ts` - Playwright configuration
- `test/e2e/pageObjects/` - Page object models

## Running Tests

```bash
cd test
npx playwright test e2e --reporter=line
```

## Notes

- Resend test addresses must be in format: `delivered+label@resend.dev`
- Email tests verify code creation in DB after sending
- Teardown handles FK constraints (delete calendars before users)