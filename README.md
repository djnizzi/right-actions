# Right Actions

A MediaMonkey 5 add-on that puts a **+** button in the right-hand toolbar, so
you can keep up to five of MediaMonkey's own actions there.

MediaMonkey draws that toolbar strip from static markup and offers no UI to
customise it. This add-on inserts a button into the strip with
`uitools.addToolButton` — the call the host uses for its own tool buttons — and
beside it the actions you chose.

## Install

1. Download `RightActions.mmip`.
2. In MediaMonkey: **Tools → Extensions → Add…**, choose the file, then restart.

## Use

Click **+**, filter or scroll the list, tick up to five actions, press OK. The
icons appear at the right of the toolbar, in the order you picked them.

Each icon follows its action's own state, so it greys out when the action is
disabled — the same thing MediaMonkey's custom toolbar does for its buttons.

Five is the cap on purpose: a longer list would have to collapse into an
ellipsis menu, which defeats the point of a one-click strip.

## What it does not do

It never writes `toolbarItems`. That setting is the custom toolbar, which draws
a row of its own; this add-on only adds buttons to the strip that already
exists.

## Build

```bash
node tools/build-mmip.js
```

Packages `RightActions.mmip` from the sources, then opens the archive and
checks it entry by entry.

## Layout

| File | What it is |
| --- | --- |
| `info.json` | Add-on manifest |
| `init.js` | The toolbar strip and the picker |
| `rightActions.js` | Action catalog and saved selection |
| `icon.svg` | The + button icon |
| `tools/build-mmip.js` | Packaging |

## Notes

The picker is drawn inside the main window rather than in a dialog window. A
separate window came up visible but took no mouse input at all on a borderless
skin — no clicks, no wheel, only the keyboard — while the main window accepts
the mouse normally. Keeping the picker in that document also lets it read
MediaMonkey's `actions` registry directly.

The ticks are MediaMonkey's own `Checkbox` control, so they are drawn by the
skin rather than by the browser.

See [CHANGELOG.md](CHANGELOG.md) for what changed in each version.
