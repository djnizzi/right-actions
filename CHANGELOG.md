# Changelog

## 0.2.3 — 2026-11-23

### Fixed

- A button could stay greyed out after its action had become usable again —
  Properties was the one that showed it, and pressing any other icon brought it
  back. The state of an action like Properties is computed from which control
  MediaMonkey last focused, and that changes without any event the add-on hears:
  a dialog closing, a view being rebuilt, the selection restored after startup.
  The state was read once, at a moment when the answer was still "disabled",
  and nothing read it again until the next click happened to.
- The state is now kept fresh from three directions: every event that can move
  the selection or the focus, a read whenever the pointer is over the strip, and
  a one-second watchdog that writes only when the answer changes. A read is also
  repeated several times while the library settles after startup instead of
  once. A button the user is about to press is therefore never left greyed by a
  stale read.

## 0.2.2 — 2026-11-22

### Changed

- A new icon: a rounded badge with a plus knocked out of it. It is the toolbar
  button and the add-on logo both, drawn from one
  `skin/icon/rightActions.svg`, so it scales to whatever size each place asks
  for instead of shipping a second copy.
- The icon has no fill of its own and carries `class="textColor"`, the way
  MediaMonkey's own icons do, so the skin colours it instead of a colour baked
  into the artwork.

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
