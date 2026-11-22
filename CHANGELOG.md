# Changelog

## 0.2.1 — 2026-11-22

### Fixed

- Toolbar icons no longer come back greyed out and unusable after a restart.
  The action's state was read while its button was drawn, before MediaMonkey
  had restored the library selection, so actions that ask the focused list —
  Properties among them — reported themselves disabled and the icon stayed dead
  until something redrew the strip.

### Changed

- The state is read the way MediaMonkey's own custom toolbar reads it: deferred
  by 200 ms rather than taken at draw time, then re-read on selection and focus
  changes, and once more on `mousedown` before a click is handled.
- An action that reports its state as a promise is now awaited instead of being
  read as "disabled".

## 0.2.0 — 2026-11-22

First release.

- A **+** button in MediaMonkey's right toolbar, holding up to five of
  MediaMonkey's own actions beside it. The strip is static markup, so the
  buttons are inserted with `uitools.addToolButton`; `toolbarItems` is never
  written, and no second toolbar row appears.
- The picker lists every action that can be drawn as a plain button, with a
  filter, icons and categories, and greys out what cannot be added once five
  are chosen.
- The picker is drawn inside the main window rather than in a dialog window,
  which is what made it accept the mouse on a borderless skin.
- Ticks use MediaMonkey's own `Checkbox` control, so the skin draws them.
