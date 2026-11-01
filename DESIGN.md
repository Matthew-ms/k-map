# Design rules

Settle these at kickoff, before building screens. Each rule carries its reason,
so a later change does not quietly undo it. Delete any rule that does not fit
this platform, and add project rules at the end, each with its reason.

To redesign a UI that already exists, follow the method in
C:\Users\matth\claude-workflow\docs\ui-redesign-playbook.md
(audit by measuring → mock-ups → "build it" → one screen per checkpoint).

## Layout

- **Phone first.** Base styles are the phone layout (check at 375 × 812);
  wider screens get a centred column, nothing more. Designing wide first is
  how a form ends up scrolling past its own Save button.
- **The most important figure first, and large.** The one value every record
  needs goes at the top, not under a plain dropdown.
- **The primary action is always on screen.** Pin it to the foot of the sheet,
  and let it name what it will do ("Add ¥1,280", "Import 3 rows"). A count or
  amount in the button is the last check before the tap.
- **Fold what most people never use** behind a "More" row that says what it
  holds ("More · 2 tags"), so shutting it never hides a value. Open it from the
  start when the record already uses any of it.
## Controls

- **Chips over dropdowns** for short option sets, showing each option as
  itself. Browser dropdowns look different from the rest of the app.
- **Lay the native picker invisibly over a chip** when the list is long. The
  phone's own picker opens on tap and nothing has to be built.
- **A segmented control for "pick one of two to four"**, with no gap between
  segments.
- **Switches for settings that take effect immediately** (`role="switch"`).
  Checkboxes imply a form to submit.
- **44 px minimum touch target, 16 px minimum font on inputs.** Smaller input
  text makes iOS zoom on focus.

## Colour

Keep **separate colour channels**, and never let one carry another's meaning:

1. **Action** (buttons, prices, いま): ink (`--accent`, inverted in dark mode).
2. **Worry** (warnings): amber, used only where a state needs attention, and
   always written out.
3. **Identity** (which chain): Jankara red, Big Echo blue, Manekineko amber,
   Karaoke-kan green, on pins and chain badges only, never used to signal a state.

Ordinary things use calm colours. If every normal row shouts, nothing is left
for a real warning.

## Motion

- **Two easings only:** one with no overshoot for large things (sheets,
  panels), one slightly springy for small things (chips, a tap).
- **All motion is optional:** one `prefers-reduced-motion` block, and nothing
  animated carries information that is not also written down.

## Words

- **Name the thing, not the kind.** A record with no name is titled by its
  category ("Groceries"), not by its type ("Expense").
- **Say the consequence, not the mechanism.** "This will not move a balance"
  beats an error code.

## Data behind the UI

- **Store what the user chose, never a default that can be worked out.** Store
  nothing until they choose, and work out the default when showing it. A stored
  default freezes today's answer; a worked-out one lets a better default reach
  everything nobody chose.

## Before calling a screen done

- [ ] Measured at phone size (by script, not by eye): fits, primary action on
      screen.
- [ ] The most important figure or action is first.
- [ ] No browser dropdown, date box or checkbox where the app has its own
      control.
- [ ] Every target at least 44 px; every input at least 16 px.
- [ ] Colours stay in their channel (action, worry, identity).
- [ ] Works with reduced motion.
- [ ] Empty state and long text tried.
- [ ] The stored result was read back, not only the screen.
- [ ] What was not verified is written down.
- [ ] Any new rule is added below, with its reason.

## Project-specific rules

- The K-map UI rules, each with its reason, are in CLAUDE.md under "UI rules
  (redesign 2026-10)". They win where they are more specific than this file.
- Dates and times are chips with the phone's own picker laid invisibly over
  them, not ‹ › steppers — the plan sheet was redesigned that way in 2026-10.
