# 025 — NLP unmatched phrases (2026-09-06 export)

Status: done

## Evidence (event parse, 3 unique)

1. "eugenia, confirm your appointment https://app.operadds.com//u/rc/ne9qzml
   on wed, sep 09, 2026, 08:00 am at garland g. gentry, dds, p.c.. stop=endtexts"
   → title truncated mid-URL ("https://app.oper"); attendants over-captured
   (Eugenia + dentist with professional suffix); stray second date 09-08.
2. "construction crew goes to the range with nathan and matt and kelvin. at
   442 cherry hill dr., rustburg, va 24588. add a task to bring drinks for 8"
   → title truncated ("with Nathan an"); location partial; attendants
   over/under-captured; embedded "add a task…" left in event text.
3. "stalkers campout family calendar" → trailing "family calendar" not
   routed to the family calendar (title kept the phrase).

## Done

- Fixed (commit d37dab8), red→green, 26 new table cases (suite
  207→220): URLs stripped from every downstream scan and preserved
  whole in description (title never carries a URL fragment); stray
  second date from "08:00" vetoed; 50-char title cut snaps to word
  boundary; `with`-list attendants capture all members (person-lexicon
  guard against "with pizza and drinks"); street-address location
  matcher (digits + street-type + optional city/ST zip); bare
  "family calendar"/"personal calendar" routing at start/end of input.
- Limitations recorded: embedded "add a task…" not split out;
  50-char title cap kept; compromise people fallback still over-captures
  phrase 1's dentist; "work calendar" bare routing left unrouted.
