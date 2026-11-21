# Perf baseline

Measured 2026-11-21T15:58:51.353Z by `npm run perf:baseline` on the legacy pages, before any rebuild.

Median of 5 runs per page and profile, each first visit in a fresh browser context (empty cache) and the repeat visit in the same context. Desktop: 1280×800, 50/10 Mbps, 20 ms RTT, no CPU throttle. Mobile: Pixel 7 emulation, 4× CPU slowdown, 12/4 Mbps, 50 ms RTT. Ready time is navigation start → the catalog's `ready` selector; TTFB is navigation timing and includes the profile's emulated latency and any redirect hops; bytes are transferred up to the load event. Numbers come from a local `vite preview` and local Postgres, so they leave out real network and Neon latency; they measure what the code controls. Measure on an otherwise idle machine.

**Hard limits** (ADR 0010, enforced by `npm run perf:check` from each module's S7): desktop ready 1000 ms first or repeat; mobile ready 1000 ms repeat; desktop TTFB 300 ms (mobile TTFB is information); initial JS above the page's ceiling plus 2%.

| page | profile | ready (first) | TTFB | LCP (first) | ready (repeat) | LCP (repeat) | initial JS | HTML | page data | JS ceiling |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **target (desktop)** | desktop | 500 ms | 100 ms | — | 300 ms | — | 100 KB | — | — | may only shrink |
| **target (mobile)** | mobile | — | info | — | 600 ms | — | 100 KB | — | — | may only shrink |
| dayDashboard/dashboard | desktop | 949 ms | 55 ms | 320 ms | 298 ms | 196 ms | 179 KB | 10 KB | 782 B | 179 KB |
| dayDashboard/dashboard | mobile | 2790 ms | 61 ms | 744 ms | 1095 ms | 428 ms | 179 KB | 10 KB | 0 B | 179 KB |
| calendarPage/share-target | desktop | 812 ms | 85 ms | 240 ms | 397 ms | 188 ms | 197 KB | 8.9 KB | 5.2 KB | 197 KB |
| calendarPage/share-target | mobile | 3353 ms | 115 ms | 624 ms | 1729 ms | 504 ms | 197 KB | 8.9 KB | 4.3 KB | 197 KB |
| access/login | desktop | 716 ms | 8 ms | 760 ms | 175 ms | 192 ms | 106 KB | 4.4 KB | 703 B | 106 KB |
| access/login | mobile | 1368 ms | 7 ms | 1392 ms | 589 ms | 604 ms | 106 KB | 4.4 KB | 703 B | 106 KB |
| familyHub/family-tasks | desktop | 651 ms | 113 ms | 728 ms | 197 ms | 244 ms | 47 KB | 8.3 KB | 0 B | 122 KB |
| familyHub/family-tasks | mobile | 846 ms | 77 ms | 880 ms | 509 ms | 540 ms | 122 KB | 8.3 KB | 0 B | 122 KB |
| calendarPage/calendar-month | desktop | 640 ms | 34 ms | 180 ms | 201 ms | 228 ms | 197 KB | 8.9 KB | 2.1 KB | 197 KB |
| calendarPage/calendar-month | mobile | 2446 ms | 38 ms | 596 ms | 1134 ms | 380 ms | 197 KB | 8.9 KB | 2.1 KB | 197 KB |
| marketing/android | desktop | 635 ms | 20 ms | 792 ms | 219 ms | 240 ms | 100 KB | 4.1 KB | 1.2 KB | 100 KB |
| marketing/android | mobile | 1673 ms | 6 ms | 1768 ms | 610 ms | 628 ms | 100 KB | 4.1 KB | 1.2 KB | 100 KB |
| marketing/home | desktop | 622 ms | 6 ms | 724 ms | 169 ms | 248 ms | 102 KB | 4.1 KB | 579 B | 102 KB |
| marketing/home | mobile | 1880 ms | 9 ms | 2040 ms | 660 ms | 752 ms | 102 KB | 4.1 KB | 579 B | 102 KB |
| marketing/features | desktop | 552 ms | 6 ms | 600 ms | 152 ms | 180 ms | 105 KB | 4.2 KB | 587 B | 105 KB |
| marketing/features | mobile | 1904 ms | 9 ms | 1968 ms | 801 ms | 840 ms | 105 KB | 4.2 KB | 587 B | 105 KB |
| family/family-join | desktop | 516 ms | 5 ms | 564 ms | 145 ms | 160 ms | 100 KB | 4.3 KB | 789 B | 100 KB |
| family/family-join | mobile | 1663 ms | 12 ms | 1740 ms | 605 ms | 620 ms | 100 KB | 4.3 KB | 789 B | 100 KB |
| access/invite-email | desktop | 514 ms | 19 ms | 540 ms | 173 ms | 192 ms | 100 KB | 4.3 KB | 1.0 KB | 100 KB |
| access/invite-email | mobile | 1899 ms | 9 ms | 1920 ms | 731 ms | 744 ms | 100 KB | 4.3 KB | 1.0 KB | 100 KB |
| calendar/import | desktop | 513 ms | 121 ms | 552 ms | 136 ms | 160 ms | 72 KB | 8.7 KB | 0 B | 117 KB |
| calendar/import | mobile | 1181 ms | 36 ms | 1212 ms | 692 ms | 620 ms | 117 KB | 8.7 KB | 0 B | 117 KB |
| marketing/about | desktop | 502 ms | 7 ms | 528 ms | 162 ms | 180 ms | 100 KB | 4.1 KB | 584 B | 100 KB |
| marketing/about | mobile | 1554 ms | 7 ms | 1584 ms | 721 ms | 736 ms | 100 KB | 4.1 KB | 584 B | 100 KB |
| access/forgot-password | desktop | 501 ms | 7 ms | 532 ms | 187 ms | 204 ms | 102 KB | 4.3 KB | 0 B | 102 KB |
| access/forgot-password | mobile | 1423 ms | 7 ms | 1440 ms | 534 ms | 548 ms | 102 KB | 4.3 KB | 608 B | 102 KB |
| marketing/privacy | desktop | 500 ms | 5 ms | 528 ms | 150 ms | 168 ms | 100 KB | 4.1 KB | 586 B | 100 KB |
| marketing/privacy | mobile | 1775 ms | 7 ms | 1816 ms | 635 ms | 652 ms | 100 KB | 4.1 KB | 586 B | 100 KB |
| marketing/contact | desktop | 489 ms | 7 ms | 512 ms | 158 ms | 176 ms | 103 KB | 4.2 KB | 586 B | 103 KB |
| marketing/contact | mobile | 1611 ms | 6 ms | 1640 ms | 622 ms | 640 ms | 103 KB | 4.2 KB | 586 B | 103 KB |
| billing/pricing | desktop | 486 ms | 7 ms | 532 ms | 152 ms | 176 ms | 101 KB | 4.1 KB | 1.1 KB | 101 KB |
| billing/pricing | mobile | 1933 ms | 6 ms | 1968 ms | 725 ms | 764 ms | 101 KB | 4.1 KB | 1.1 KB | 101 KB |
| billing/checkout | desktop | 479 ms | 14 ms | 508 ms | 148 ms | 172 ms | 101 KB | 4.1 KB | 1.7 KB | 101 KB |
| billing/checkout | mobile | 2256 ms | 27 ms | 2276 ms | 1249 ms | 1268 ms | 101 KB | 4.1 KB | 965 B | 101 KB |
| access/signup | desktop | 462 ms | 6 ms | 480 ms | 142 ms | 164 ms | 105 KB | 4.3 KB | 682 B | 105 KB |
| access/signup | mobile | 1392 ms | 6 ms | 1416 ms | 613 ms | 628 ms | 105 KB | 4.3 KB | 682 B | 105 KB |
| access/reset-password | desktop | 448 ms | 7 ms | 488 ms | 153 ms | 184 ms | 102 KB | 4.3 KB | 614 B | 102 KB |
| access/reset-password | mobile | 1736 ms | 10 ms | 1764 ms | 840 ms | 860 ms | 102 KB | 4.3 KB | 614 B | 102 KB |
| tasks/archive | desktop | 408 ms | 66 ms | 476 ms | 184 ms | 220 ms | 46 KB | 8.5 KB | 0 B | 111 KB |
| tasks/archive | mobile | 834 ms | 68 ms | 896 ms | 563 ms | 608 ms | 111 KB | 8.5 KB | 0 B | 111 KB |
| groceries/groceries | desktop | 380 ms | 44 ms | 424 ms | 122 ms | 152 ms | 115 KB | 9.4 KB | 0 B | 118 KB |
| groceries/groceries | mobile | 840 ms | 29 ms | 872 ms | 414 ms | 380 ms | 118 KB | 9.4 KB | 0 B | 118 KB |
| tasks/stats | desktop | 368 ms | 75 ms | 448 ms | 142 ms | 180 ms | 59 KB | 8.3 KB | 0 B | 111 KB |
| tasks/stats | mobile | 1221 ms | 108 ms | 1268 ms | 382 ms | 412 ms | 111 KB | 8.3 KB | 0 B | 111 KB |
| familyHub/family-hub | desktop | 310 ms | 63 ms | 352 ms | 119 ms | 144 ms | 92 KB | 11 KB | 0 B | 119 KB |
| familyHub/family-hub | mobile | 1540 ms | 68 ms | 1660 ms | 657 ms | 696 ms | 119 KB | 11 KB | 0 B | 119 KB |
| account/account-settings | desktop | 303 ms | 98 ms | 356 ms | 148 ms | 168 ms | 63 KB | 8.4 KB | 0 B | 117 KB |
| account/account-settings | mobile | 1205 ms | 78 ms | 1288 ms | 535 ms | 572 ms | 117 KB | 8.4 KB | 0 B | 117 KB |
| access/verify-email | desktop | 288 ms | 34 ms | 320 ms | 104 ms | 124 ms | 39 KB | 6.3 KB | 0 B | 104 KB |
| access/verify-email | mobile | 799 ms | 27 ms | 820 ms | 446 ms | 476 ms | 104 KB | 6.3 KB | 0 B | 104 KB |
| family/family-create | desktop | 273 ms | 31 ms | 320 ms | 89 ms | 112 ms | 69 KB | 8.5 KB | 0 B | 110 KB |
| family/family-create | mobile | 652 ms | 33 ms | 684 ms | 353 ms | 336 ms | 110 KB | 8.5 KB | 0 B | 110 KB |
| tasks/tasks | desktop | 265 ms | 59 ms | 312 ms | 118 ms | 148 ms | 96 KB | 12 KB | 0 B | 145 KB |
| tasks/tasks | mobile | 921 ms | 63 ms | 964 ms | 359 ms | 376 ms | 145 KB | 12 KB | 0 B | 145 KB |
| marketing/changelog | desktop | 257 ms | 8 ms | 296 ms | 103 ms | 120 ms | 69 KB | 4.4 KB | 0 B | 101 KB |
| marketing/changelog | mobile | 685 ms | 6 ms | 712 ms | 307 ms | 320 ms | 101 KB | 4.4 KB | 0 B | 101 KB |
| calendar/print | desktop | 250 ms | 50 ms | 320 ms | 104 ms | 132 ms | 98 KB | 8.5 KB | 0 B | 109 KB |
| calendar/print | mobile | 783 ms | 49 ms | 820 ms | 543 ms | 480 ms | 109 KB | 8.5 KB | 0 B | 109 KB |
| admin/admin-home | desktop | 248 ms | 30 ms | 304 ms | 107 ms | 116 ms | 62 KB | 4.1 KB | 0 B | 62 KB |
| admin/admin-home | mobile | 768 ms | 25 ms | 816 ms | 242 ms | 260 ms | 62 KB | 4.1 KB | 0 B | 62 KB |
| family/families | desktop | 248 ms | 49 ms | 292 ms | 159 ms | 188 ms | 94 KB | 9.1 KB | 0 B | 114 KB |
| family/families | mobile | 1019 ms | 52 ms | 1088 ms | 577 ms | 500 ms | 114 KB | 9.1 KB | 0 B | 114 KB |
| feedback/admin-nlp | desktop | 234 ms | 28 ms | 272 ms | 81 ms | 92 ms | 67 KB | 4.8 KB | 0 B | 67 KB |
| feedback/admin-nlp | mobile | 870 ms | 49 ms | 900 ms | 544 ms | 588 ms | 64 KB | 4.8 KB | 0 B | 67 KB |
| alerts/notifications | desktop | 233 ms | 30 ms | 264 ms | 100 ms | 120 ms | 98 KB | 7.8 KB | 0 B | 111 KB |
| alerts/notifications | mobile | 876 ms | 29 ms | 908 ms | 387 ms | 408 ms | 111 KB | 7.8 KB | 0 B | 111 KB |
| marketing/roadmap | desktop | 225 ms | 5 ms | 252 ms | 81 ms | 100 ms | 67 KB | 4.0 KB | 0 B | 100 KB |
| marketing/roadmap | mobile | 637 ms | 6 ms | 668 ms | 329 ms | 348 ms | 100 KB | 4.0 KB | 0 B | 100 KB |
| access/merge-guest | desktop | 196 ms | 44 ms | 216 ms | 83 ms | 96 ms | 43 KB | 3.8 KB | 0 B | 59 KB |
| access/merge-guest | mobile | 610 ms | 40 ms | 640 ms | 279 ms | 296 ms | 59 KB | 3.8 KB | 0 B | 59 KB |
| access/claim | desktop | 182 ms | 20 ms | 208 ms | 92 ms | 100 ms | 55 KB | 3.8 KB | 0 B | 56 KB |
| access/claim | mobile | 583 ms | 24 ms | 596 ms | 305 ms | 312 ms | 56 KB | 3.8 KB | 0 B | 56 KB |
| calendar/event-detail | desktop | 175 ms | 45 ms | 208 ms | 111 ms | 128 ms | 69 KB | 8.4 KB | 0 B | 112 KB |
| calendar/event-detail | mobile | 647 ms | 44 ms | 588 ms | 381 ms | 404 ms | 112 KB | 8.4 KB | 0 B | 112 KB |
| feedback/report-bug | desktop | 173 ms | 29 ms | 192 ms | 82 ms | 96 ms | 49 KB | 4.1 KB | 0 B | 61 KB |
| feedback/report-bug | mobile | 652 ms | 30 ms | 680 ms | 317 ms | 328 ms | 61 KB | 4.1 KB | 0 B | 61 KB |
| family/family-members-add | desktop | 173 ms | 31 ms | 196 ms | 96 ms | 112 ms | 56 KB | 7.5 KB | 0 B | 109 KB |
| family/family-members-add | mobile | 599 ms | 27 ms | 624 ms | 362 ms | 344 ms | 109 KB | 7.5 KB | 0 B | 109 KB |
| feedback/admin-bugs | desktop | 167 ms | 28 ms | 200 ms | 90 ms | 100 ms | 66 KB | 4.7 KB | 0 B | 67 KB |
| feedback/admin-bugs | mobile | 754 ms | 24 ms | 780 ms | 267 ms | 292 ms | 67 KB | 4.7 KB | 0 B | 67 KB |
| family/family-invitations | desktop | 164 ms | 25 ms | 204 ms | 79 ms | 100 ms | 49 KB | 8.1 KB | 0 B | 111 KB |
| family/family-invitations | mobile | 901 ms | 32 ms | 972 ms | 354 ms | 380 ms | 111 KB | 8.1 KB | 0 B | 111 KB |
