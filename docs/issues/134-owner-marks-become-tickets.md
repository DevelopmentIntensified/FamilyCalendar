# 134 - The owner's marks become filed tickets

Status: open

**What to build:** The owner reviews by clicking an element on a page and writing
a note. That feedback currently goes nowhere an agent will read. Make a submitted
mark become a numbered ticket carrying the owner's words verbatim.

Click stages a mark; the composer collects the note; submit files it. An empty
mark must not be submittable. This behaviour already exists in the review tooling -
reuse it, do not rebuild it.

**Blocked by:** 133 (there must be a URL to review).

**Status:** open

- [ ] A mark submitted on any page produces a ticket file, numbered in sequence
- [ ] The ticket records the page, the element marked, the note verbatim, and the
      element's selector or coordinates so it can be found again
- [ ] The ticket is agent-grabbable: acceptance criteria are derived from the note
      without inventing intent
- [ ] An empty mark cannot be submitted
- [ ] Filing a mark never edits an existing ticket or the parent spec
- [ ] Covered by tests at the component seam; the collector's own contract is not
      modified to accommodate this

**Note:** the owner's words are the specification. Do not paraphrase a note into
tickets, and do not resolve a note against your own judgement - an unexplained
divergence between the note and the ticket is a defect.
