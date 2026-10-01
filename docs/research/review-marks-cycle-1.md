# Archived review marks — cycle 1

_Written 2026-09-30 when the marks were cleared for a fresh review cycle._
_Source: `prototypes/feedback/*.json`, which is gitignored and therefore not durable._
_Every mark below was triaged into a ticket before clearing; the ticket is named on each line._
_Regenerate nothing from here — this is a record, not a source._

## Account & settings

_file: `app-ui/account.html` · approved: yes · tickets: 088, 088b_

_no marks — reviewed, nothing found_

## Archive

_file: `app-ui/archive.html` · approved: yes · tickets: 094_

**1. <div>** `BAD`
- selector: `[data-fb="archive-list"] > div.card.month:nth-of-type(1)`
- size: 912×72
- note: padding...

## Tasks — flat list (B)

_file: `app-ui/b-tasks-flat.html` · approved: yes · tickets: 101_

_no marks — reviewed, nothing found_

## Dashboard

_file: `app-ui/dashboard.html` · approved: yes · tickets: 118_

**1. <div>** `BAD`
- selector: `[data-fb="mod-board"]`
- size: 876×349
- note: This doesn't need to be as wide

**2. <div>** `BAD`
- selector: `[data-fb="mod-members"]`
- size: 340×349
- note: This is uneeded

**3. <div>** `IDEA`
- selector: `[data-fb="mod-kids"]`
- size: 460×248
- note: bring this to the layer above where the people box was

**4. <div>** `IDEA`
- selector: `[data-fb="mod-meals"]`
- size: 400×248
- note: move this up one layer in the grid

**5. <span>** `IDEA`
- selector: `[data-fb="page-head"] > div.rowflex.gap-2:nth-of-type(2) > span.daynav`
- size: 158×40
- note: make this section like the change requested for the calendar page. make them look the same

**6. <div>** _unjudged_
- selector: `[data-fb="page-head"] > div:nth-of-type(1)`
- size: 608×115
- note: _(none)_

## Event detail

_file: `app-ui/event.html` · approved: yes · tickets: —_

_no marks — reviewed, nothing found_

## Create a family

_file: `app-ui/family-create.html` · approved: yes · tickets: 075, 076_

**1. <div>** `GOOD`
- selector: `html > body.fb-picking > div.wrap:nth-of-type(9)`
- size: 1280×1367
- note: passed

## Family settings

_file: `app-ui/family-detail.html` · approved: yes · tickets: 077_

**1. <div>** _unjudged_ — **REBUILD**
- selector: `[data-fb="module-switches"]`
- size: 904×512
- note: compact this and make the whole page look more put together and less things touching and with too little space, but too spread out

**2. <button>** `IDEA`
- selector: `[data-fb="family-identity"] > div.rowflex.between:nth-of-type(2) > div.rowflex.gap-2:nth-of-type(2) > button.btn-icon`
- size: 32×32
- note: make the button match the size of the surrounding buttons. Then this page is approved for building into the site.

## Invitations

_file: `app-ui/family-invitations.html` · approved: yes · tickets: 091_

_no marks — reviewed, nothing found_

## Add a member

_file: `app-ui/family-members-add.html` · approved: yes · tickets: —_

_no marks — reviewed, nothing found_

## Family tasks

_file: `app-ui/family-tasks.html` · approved: yes · tickets: 101_

_no marks — reviewed, nothing found_

## Family (list)

_file: `app-ui/family.html` · approved: yes · tickets: 064, 078_

**1. <div>** `BAD` — **REBUILD**
- selector: `[data-fb="dead-link"]`
- size: 304×272
- note: Fix this then

**2. <a>** `BAD`
- selector: `[data-fb="family-card"]`
- size: 912×214
- note: add margins, give space around it

**3. <span>** `IDEA`
- selector: `[data-fb="family-card"] > div:nth-of-type(2) > div.rowflex.between:nth-of-type(1) > span.pill.pill-xs`
- size: 111×18
- note: add some other stat

## Groceries

_file: `app-ui/groceries.html` · approved: yes · tickets: 096, 097_

**1. <span>** _unjudged_
- selector: `[data-fb="store-groups"] > div.rail__card:nth-of-type(1) > div.grow:nth-of-type(2) > span:nth-of-type(2) > span.gmeta:nth-of-type(2) > span.store:nth-of-type(1)`
- size: 140×20
- note: _(none)_

**2. <span>** `IDEA`
- selector: `[data-fb="store-groups"] > div.rail__card:nth-of-type(1) > div.grow:nth-of-type(2) > span:nth-of-type(2) > span.gmeta:nth-of-type(2)`
- size: 702×20
- note: Why only one highlighted? make each store have configurable color. 

**3. <div>** `IDEA`
- selector: `[data-fb="model-note"]`
- size: 336×268
- note: I want them both to display at the same time like tasks with filters instead

## Import

_file: `app-ui/import.html` · approved: yes · tickets: 082, 083_

_no marks — reviewed, nothing found_

## Alerts

_file: `app-ui/notifications.html` · approved: yes · tickets: 073_

**1. <div>** `GOOD`
- selector: `html > body.fb-picking > div.wrap:nth-of-type(9) > div`
- size: 1232×922
- note: passed inspection

## Stats

_file: `app-ui/stats.html` · approved: yes · tickets: 093_

**1. <div>** `BAD`
- selector: `[data-fb="why-model"]`
- size: 400×230
- note: remove this

**2. <div>** `IDEA`
- selector: `[data-fb="recently"]`
- size: 400×279
- note: move this up to be on the line above

**3. <div>** `IDEA`
- selector: `[data-fb="totals"]`
- size: 400×106
- note: Make this still the same height as the box beside it
