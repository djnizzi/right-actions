'use strict';

/*
 * Right Actions
 *
 * Puts a + button in MediaMonkey's right-hand toolbar strip and, beside it,
 * the actions the user picked. That strip is static markup (maincontent.html),
 * so the buttons are inserted into it at startup with uitools.addToolButton —
 * the call the host uses for its own tool buttons.
 *
 * The picker is drawn inside the main window instead of a dialog window. A
 * separate window came up visible but took no mouse input at all on a
 * borderless skin: no clicks, no wheel, only the keyboard. This window
 * demonstrably accepts clicks (the + button is clicked here), and keeping the
 * picker in this document also means it can read `window.actions` directly.
 *
 * `toolbarItems` is a different thing: that is the custom toolbar, which draws
 * a row of its own. This add-on never writes it.
 */

localRequirejs('rightActions');

var STRIP_ID = 'righttoolbuttons';
var HOST_ID = 'rightActionsButtons';
var ADD_ICON = 'add';

var OVERLAY_ID = 'rightActionsOverlay';
var STYLE_ID = 'rightActionsStyles';

/* The strip is built while the main window loads; wait for it instead of
   guessing a delay. 40 × 250 ms is a generous ceiling. */
var RETRY_MS = 250;
var RETRY_TRIES = 40;

var syncEntries = [];
var syncTimer = null;
var syncHooked = false;

var picker = null;

// ---------------------------------------------------------------------------
// The toolbar strip
// ---------------------------------------------------------------------------

function stripElement() {
    return (typeof qid === 'function') ? qid(STRIP_ID) : null;
}

function hostElement() {
    var strip = stripElement();
    if (!strip) return null;

    var host = qid(HOST_ID);
    if (host) return host;

    host = document.createElement('div');
    host.setAttribute('data-id', HOST_ID);
    host.className = 'toolbar flex row';
    strip.insertBefore(host, strip.firstChild);

    return host;
}

/**
 * addToolButton inserts before the first child; moving the element to the end
 * keeps the order the user chose, with the + button last.
 */
function addToolButton(host, icon, tip, onClick) {
    var el = uitools.addToolButton(host, icon, onClick, tip);
    host.appendChild(el);
    return el;
}

function actionTitle(act, fallback) {
    try {
        return uitools.getPureTitle(resolveToValue(act.title, fallback));
    } catch (e) {
        return fallback;
    }
}

function actionIcon(act) {
    try {
        return String(resolveToValue(act.icon, '') || '');
    } catch (e) {
        return '';
    }
}

/**
 * Keep each button in the state its action reports: greyed out when the action
 * is disabled (nothing selected), hidden when it says it does not apply.
 *
 * The state is never read while the button is being drawn. MediaMonkey's own
 * custom toolbar waits 200 ms before its first read for the same reason: at
 * startup, and straight after a click, the selection has not settled yet, and
 * actions such as Properties ask the focused list — so they report themselves
 * disabled. Reading at that moment left the icon greyed out and dead until
 * something redrew the strip. The read is deferred instead, and repeated when
 * the events that can change an action's state arrive.
 */
var SYNC_DELAY = 200;

function applyState(entry) {
    var el = entry.el;
    var act = entry.act;

    if (!el || !act || !el.controlClass || window._cleanUpCalled) return;

    try {
        var visible = resolveToValue(act.visible, true);

        if (!isPromise(visible)) setVisibility(el, !!visible);
    } catch (e) {
        // leave the button as it is
    }

    try {
        var disabled = resolveToValue(act.disabled, false);

        if (isPromise(disabled)) {
            disabled.then(function (res) {
                if (el.controlClass && !window._cleanUpCalled) el.controlClass.disabled = !!res;
            });
        } else if (!act.submenu) {
            el.controlClass.disabled = !!disabled;
        }
    } catch (e) {
        // leave the button as it is
    }
}

function syncAll() {
    syncEntries.forEach(applyState);
}

function scheduleSync() {
    if (syncTimer || window._cleanUpCalled) return;

    syncTimer = setTimeout(function () {
        syncTimer = null;
        syncAll();
    }, SYNC_DELAY);
}

function trackState(el, act) {
    syncEntries.push({ el: el, act: act });

    if (syncHooked) return;
    syncHooked = true;

    app.listen(document.body, 'mouseup', scheduleSync);
    app.listen(document.body, 'keyup', scheduleSync);
    app.listen(document.body, 'itemselectchange', scheduleSync);
    app.listen(document.body, 'focusedcontrol', scheduleSync);
    app.listen(document.body, 'viewchange', scheduleSync);
}

function render() {
    var host = hostElement();
    var module = window.rightActions;

    if (!host || !module) return;
    if (typeof uitools === 'undefined' || !uitools.addToolButton) return;

    syncEntries = [];
    cleanElement(host, true /* only children */);

    module.read().forEach(function (key) {
        var act = module.resolveAction(key);
        if (!act || !act.execute) return;

        var icon = actionIcon(act);
        if (!icon) return;

        var el = addToolButton(host, icon, actionTitle(act, key), function () {
            act.execute();
        });

        trackState(el, act);
    });

    addToolButton(host, ADD_ICON, _('Choose toolbar buttons') + '\u2026', openPicker);

    /* A press on our own strip re-reads the state before the button's click
       handler runs, so a button left greyed by an early read still works on
       the first click rather than staying dead. */
    if (!host._rightActionsPress) {
        host._rightActionsPress = true;
        host.addEventListener('mousedown', syncAll, true);
    }

    scheduleSync();

    /* One more read well after startup, in case the library took its time. */
    setTimeout(syncAll, 1200);
}

// ---------------------------------------------------------------------------
// The picker
// ---------------------------------------------------------------------------

function newElement(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

/** The card borrows the window's own colours, so it reads in any skin. */
function themeColors() {
    var background = '';
    var foreground = '';

    try {
        var style = window.getComputedStyle(document.body);
        background = style.backgroundColor;
        foreground = style.color;
    } catch (e) {
        // use the fallbacks below
    }

    if (!background || background === 'transparent' || background === 'rgba(0, 0, 0, 0)') {
        background = '#2b2b2b';
    }

    return { background: background, foreground: foreground || 'inherit' };
}

function ensureStyles() {
    if (typeof qid === 'function' && qid(STYLE_ID)) return;

    var style = document.createElement('style');
    style.setAttribute('data-id', STYLE_ID);
    style.textContent = [
        '[data-id="' + OVERLAY_ID + '"] {',
        '  position: fixed; left: 0; top: 0; right: 0; bottom: 0;',
        '  z-index: 2147483000;',
        '  display: flex; align-items: center; justify-content: center;',
        '  background-color: rgba(0, 0, 0, 0.55);',
        '}',
        '[data-id="' + OVERLAY_ID + '"] .raCard {',
        '  box-sizing: border-box; display: flex; flex-direction: column;',
        '  width: 660px; max-width: 92vw; max-height: 84vh;',
        '  border: 1px solid rgba(128, 128, 128, 0.5); border-radius: 8px;',
        '  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.55); overflow: hidden;',
        '}',
        '[data-id="' + OVERLAY_ID + '"] .raHead {',
        '  display: flex; align-items: center; gap: 8px;',
        '  padding: 9px 12px; border-bottom: 1px solid rgba(128, 128, 128, 0.3);',
        '}',
        '[data-id="' + OVERLAY_ID + '"] .raHeadTitle { flex: 1 1 auto; font-weight: bold; }',
        '[data-id="' + OVERLAY_ID + '"] .raCounter { opacity: 0.75; white-space: nowrap; }',
        '[data-id="' + OVERLAY_ID + '"] .raClose {',
        '  cursor: pointer; padding: 0 6px; line-height: 1; opacity: 0.8;',
        '}',
        '[data-id="' + OVERLAY_ID + '"] .raClose:hover { opacity: 1; }',
        '[data-id="' + OVERLAY_ID + '"] .raBody {',
        '  display: flex; flex-direction: column; gap: 8px;',
        '  flex: 1 1 auto; min-height: 0; padding: 10px 12px;',
        '}',
        '[data-id="' + OVERLAY_ID + '"] .raHint { opacity: 0.8; }',
        '[data-id="' + OVERLAY_ID + '"] .raFilterRow { display: flex; align-items: center; gap: 8px; }',
        '[data-id="' + OVERLAY_ID + '"] .raFilter {',
        '  flex: 1 1 auto; min-width: 0; box-sizing: border-box;',
        '  padding: 4px 7px; border: 1px solid rgba(128, 128, 128, 0.5); border-radius: 4px;',
        '  background-color: transparent; color: inherit; font: inherit;',
        '}',
        '[data-id="' + OVERLAY_ID + '"] .raScroll {',
        '  flex: 1 1 auto; min-height: 180px; max-height: 50vh;',
        '  overflow-y: auto; overflow-x: hidden;',
        '  border: 1px solid rgba(128, 128, 128, 0.35); border-radius: 4px; padding: 4px;',
        '}',
        '[data-id="' + OVERLAY_ID + '"] .raRow {',
        '  display: flex; align-items: center; gap: 8px; padding: 3px 6px;',
        '  border-radius: 4px; cursor: pointer; margin: 0;',
        '  text-transform: none; font-weight: normal;',
        '}',
        '[data-id="' + OVERLAY_ID + '"] .raRow:hover { background-color: rgba(128, 128, 128, 0.16); }',
        '[data-id="' + OVERLAY_ID + '"] .raCheck { flex: 0 0 auto; }',
        '[data-id="' + OVERLAY_ID + '"] .raRow.raAtLimit { opacity: 0.5; }',
        '[data-id="' + OVERLAY_ID + '"] .raIcon {',
        '  flex: 0 0 18px; width: 18px; height: 18px;',
        '  display: flex; align-items: center; justify-content: center;',
        '}',
        '[data-id="' + OVERLAY_ID + '"] .raIcon svg { width: 16px; height: 16px; }',
        '[data-id="' + OVERLAY_ID + '"] .raTitle {',
        '  flex: 1 1 auto; min-width: 0; overflow: hidden;',
        '  text-overflow: ellipsis; white-space: nowrap;',
        '}',
        '[data-id="' + OVERLAY_ID + '"] .raCategory {',
        '  flex: 0 0 auto; opacity: 0.55; font-size: 0.9em; white-space: nowrap;',
        '}',
        '[data-id="' + OVERLAY_ID + '"] .raEmpty { opacity: 0.7; font-style: italic; padding: 8px 6px; }',
        '[data-id="' + OVERLAY_ID + '"] .raFoot {',
        '  display: flex; align-items: center; justify-content: space-between; gap: 8px;',
        '}',
        '[data-id="' + OVERLAY_ID + '"] .raButtons { display: flex; gap: 8px; }',
        '[data-id="' + OVERLAY_ID + '"] .raButton { padding: 0 16px; line-height: 26px; white-space: nowrap; }',
        '[data-id="' + OVERLAY_ID + '"] .raBuild { opacity: 0.5; font-size: 0.85em; white-space: nowrap; }'
    ].join('\n');

    document.head.appendChild(style);
}

function closePicker(save) {
    if (!picker) return;

    var chosen = picker.selected;
    var root = picker.root;
    var onKey = picker.onKey;
    var module = window.rightActions;

    picker = null;

    app.unlisten(document, 'keydown', onKey);

    if (root && root.parentNode) root.parentNode.removeChild(root);

    if (save && module) module.write(chosen);

    render();
}

function openPicker() {
    var module = window.rightActions;

    if (!module || !document.body) return;

    if (picker) {
        try {
            picker.filter.focus();
        } catch (e) {
            // nothing to focus
        }
        return;
    }

    ensureStyles();

    var colors = themeColors();
    var catalog = module.catalog();
    var selected = module.read();
    var max = module.MAX_ITEMS;

    var root = newElement('div');
    root.setAttribute('data-id', OVERLAY_ID);

    var card = newElement('div', 'raCard');
    card.style.backgroundColor = colors.background;
    card.style.color = colors.foreground;

    var counter = newElement('div', 'raCounter');
    var close = newElement('div', 'raClose', '\u2715');
    close.setAttribute('data-tip', _('Close'));

    var head = newElement('div', 'raHead');
    head.appendChild(newElement('div', 'raHeadTitle', _('Right Actions')));
    head.appendChild(counter);
    head.appendChild(close);

    var body = newElement('div', 'raBody');
    body.appendChild(newElement('div', 'raHint', sprintf(
        _('Choose up to %d actions to show beside the + button in MediaMonkey\'s right toolbar.'),
        max
    )));

    var filter = document.createElement('input');
    filter.type = 'text';
    filter.className = 'raFilter';
    filter.setAttribute('spellcheck', 'false');
    filter.setAttribute('autocomplete', 'off');

    var filterRow = newElement('div', 'raFilterRow');
    filterRow.appendChild(newElement('label', '', _('Filter')));
    filterRow.appendChild(filter);
    body.appendChild(filterRow);

    var list = newElement('div', 'raList');
    var empty = newElement('div', 'raEmpty', _('No action matches that filter.'));
    empty.style.display = 'none';

    var scroll = newElement('div', 'raScroll');
    scroll.appendChild(list);
    scroll.appendChild(empty);
    body.appendChild(scroll);

    var ok = newElement('div', 'button raButton', _('OK'));
    var cancel = newElement('div', 'button raButton', _('Cancel'));

    var buttons = newElement('div', 'raButtons');
    buttons.appendChild(ok);
    buttons.appendChild(cancel);

    var foot = newElement('div', 'raFoot');
    foot.appendChild(newElement('div', 'raBuild', 'Right Actions 0.2.0'));
    foot.appendChild(buttons);
    body.appendChild(foot);

    card.appendChild(head);
    card.appendChild(body);
    root.appendChild(card);
    document.body.appendChild(root);

    var rows = [];

    function atLimit() {
        return selected.length >= max;
    }

    function updateCounter() {
        counter.textContent = sprintf(_('%d of %d selected'), selected.length, max)
            + ' \u00b7 ' + sprintf(_('%d available'), catalog.length);
    }

    function refreshLimitState() {
        var limit = atLimit();

        rows.forEach(function (row) {
            var control = row.box.controlClass;
            if (!control) return;

            control.disabled = !control.checked && limit;
            row.el.classList.toggle('raAtLimit', control.disabled);
        });

        updateCounter();
    }

    /**
     * Reads the control rather than flipping our own flag, so it can run twice
     * for one click (the host checkbox reports both click and change) without
     * counting the action twice.
     */
    function onToggle(key, box) {
        var control = box.controlClass;
        if (!control) return;

        var at = selected.indexOf(key);

        if (control.checked) {
            if (at !== -1) {
                refreshLimitState();
                return;
            }
            if (atLimit()) {
                control.checked = false;
                refreshLimitState();
                return;
            }
            selected.push(key);
        } else if (at !== -1) {
            selected.splice(at, 1);
        }

        refreshLimitState();
    }

    function applyFilter() {
        var term = String(filter.value || '').trim().toLowerCase();
        var shown = 0;

        rows.forEach(function (row) {
            var item = row.item;
            var match = !term
                || item.title.toLowerCase().indexOf(term) !== -1
                || item.category.toLowerCase().indexOf(term) !== -1
                || item.key.toLowerCase().indexOf(term) !== -1;

            row.el.style.display = match ? '' : 'none';
            if (match) shown++;
        });

        empty.style.display = shown ? 'none' : '';
    }

    catalog.forEach(function (item, index) {
        var row = newElement('div', 'raRow');

        /* MediaMonkey's own Checkbox control — the one Loves MBz uses — so the
           tick is drawn by the skin instead of by the browser. It has to be in
           the document before it is initialised, and its state is set after. */
        var box = newElement('div', 'raCheck');
        box.setAttribute('data-control-class', 'Checkbox');
        box.setAttribute('data-id', 'rightActionsPick' + index);

        var iconBox = newElement('div', 'raIcon');
        if (item.icon) {
            loadIcon(item.icon, function (data) {
                if (window._cleanUpCalled) return;
                iconBox.innerHTML = data;
            });
        }

        row.appendChild(box);
        row.appendChild(iconBox);
        row.appendChild(newElement('div', 'raTitle', item.title));
        row.appendChild(newElement('div', 'raCategory', item.category));
        list.appendChild(row);

        if (typeof initializeControl === 'function') initializeControl(box);

        if (box.controlClass) {
            box.controlClass.checked = selected.indexOf(item.key) !== -1;
        }

        rows.push({ item: item, el: row, box: box });

        /* The host control updates its own state inside its click handler, so
           the selection is read once that handler has finished. */
        function onBoxEvent() {
            setTimeout(function () { onToggle(item.key, box); }, 0);
        }

        window.localListen(box, 'click', onBoxEvent);
        window.localListen(box, 'change', onBoxEvent);

        window.localListen(row, 'click', function (e) {
            if (!box.controlClass) return;
            if (box.contains && e.target && box.contains(e.target)) return;

            box.controlClass.checked = !box.controlClass.checked;
            onToggle(item.key, box);
        });
    });

    if (!catalog.length) {
        empty.textContent = sprintf(
            _('No actions were found. MediaMonkey exposes %d top-level action groups.'),
            window.actions ? Object.keys(window.actions).length : -1
        );
        empty.style.display = '';
        ok.style.opacity = '0.5';
        ok.style.pointerEvents = 'none';
        updateCounter();
    } else {
        refreshLimitState();
        applyFilter();
    }

    function activateOnKey(node, run) {
        node.setAttribute('tabindex', '0');
        node.onkeydown = function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                run();
            }
        };
    }

    ok.onclick = function () { closePicker(true); };
    cancel.onclick = function () { closePicker(false); };
    close.onclick = function () { closePicker(false); };

    activateOnKey(ok, function () { closePicker(true); });
    activateOnKey(cancel, function () { closePicker(false); });

    filter.oninput = applyFilter;

    root.onclick = function (e) {
        if (e.target === root) closePicker(false);
    };

    var onKey = function (e) {
        if (e.key === 'Escape') {
            e.stopPropagation();
            closePicker(false);
        }
    };

    app.listen(document, 'keydown', onKey);

    picker = {
        root: root,
        filter: filter,
        rows: rows,
        selected: selected,
        onKey: onKey
    };

    try {
        filter.focus();
    } catch (e) {
        // focus is a nicety
    }
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

function start() {
    var tries = 0;

    (function attempt() {
        if (window._cleanUpCalled) return;

        var ready = hostElement()
            && window.rightActions
            && typeof uitools !== 'undefined'
            && typeof uitools.addToolButton === 'function';

        if (!ready) {
            if (++tries < RETRY_TRIES) setTimeout(attempt, RETRY_MS);
            return;
        }

        render();
    })();
}

if (typeof whenReady === 'function') whenReady(start);
else setTimeout(start, 1000);
