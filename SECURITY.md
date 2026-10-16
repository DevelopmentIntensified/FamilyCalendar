# Security Policy

## Supported versions

The project deploys a single current version. There are no maintained release branches or versioned distributions.

| Deployment | URL | Supported |
|---|---|---|
| Current | https://test.familyplanz.com (and production URL when live) | Yes |
| Any other branch/commit | — | No — upgrade to current `test` head |

## Reporting a vulnerability

Use GitHub's **private vulnerability reporting** on this repository (Security tab → Report a vulnerability). Do not open a public issue for security reports.

Please include: affected URL/endpoint, steps to reproduce, impact assessment, and any logs or screenshots.

## Response expectations

- Acknowledgement: within 5 business days.
- Triage decision (accepted / declined / needs info): within 10 business days.
- Fix target: critical/high within 30 days of triage; medium within 60; low best-effort on the next regular deploy.
- Reporter will be notified when the fix deploys; public disclosure is coordinated with the reporter.

## Scope

In scope:

- The web application and its server actions/API endpoints (`test.familyplanz.com`, production when live).
- The native shell (packaged mobile app and its bridge to the web app).

Out of scope: third-party services (Neon, Vercel, Resend, GitHub) reported through their own programs; social engineering of the maintainer; volumetric DoS.

## Safe harbor

We consider good-faith security research conducted within this policy authorized activity. We will not pursue legal action against reporters who avoid privacy violations, service degradation, and data destruction, and who give us a reasonable window to fix issues before public disclosure.
