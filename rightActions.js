'use strict';

/*
 * Right Actions — the action catalog and the saved selection.
 *
 * Loaded by init.js in the main window, and nothing here touches the toolbar or
 * the picker DOM: it only answers which actions exist and which keys the user
 * saved.
 *
 * The catalog is built the way Options → Layout → Toolbar builds its own list:
 * walk the global `actions` object, keep the `hotkeyAble` entries with a title
 * and an icon, and descend into action containers. Keys are dotted for nested
 * actions (`view.mediaTree`), which is what `hotkeys.getAction` resolves and
 * what MediaMonkey's own custom toolbar stores.
 */

(function () {

    var STORAGE_KEY = 'rightActions.items';
    var MAX_ITEMS = 5;
    var MAX_DEPTH = 4;

    function resolveAction(key) {
        if (!key) return null;

        try {
            if (window.hotkeys && window.hotkeys.getAction) {
                var act = window.hotkeys.getAction(key);
                if (act) return act;
            }
        } catch (e) {
            // fall through to the plain walk
        }

        var node = window.actions;
        var parts = String(key).split('.');

        for (var i = 0; i < parts.length && node; i++) {
            node = node[parts[i]];
        }

        return (node && typeof node === 'object') ? node : null;
    }

    function generalCategory() {
        try {
            return (window.actionCategories && window.actionCategories.general) || '';
        } catch (e) {
            return '';
        }
    }

    function categoryOf(act, inherited) {
        var category = inherited || act.category || generalCategory();

        try {
            return String(resolveToValue(category, '') || '');
        } catch (e) {
            return '';
        }
    }

    function titleOf(act, fallback) {
        var title = fallback;

        try {
            title = resolveToValue(act.title, fallback) || fallback;
            if (typeof uitools !== 'undefined' && uitools.getPureTitle) {
                title = uitools.getPureTitle(title);
            }
        } catch (e) {
            // keep the fallback
        }

        return String(title || '');
    }

    /**
     * Every action that can be drawn as a toolbar button. Actions that only
     * open a submenu are left out: this add-on places plain buttons, and a
     * menu button would not follow the action's own disabled state.
     */
    function catalog() {
        var items = [];
        var seen = {};

        function walk(level, prefix, category, depth) {
            if (!level || depth > MAX_DEPTH) return;

            Object.keys(level).forEach(function (name) {
                var act = level[name];
                if (!act || typeof act !== 'object' || !act.hotkeyAble) return;

                var key = prefix ? prefix + '.' + name : name;

                // An action container: it has a category but nothing to run.
                if (act.category && !act.execute && !act.submenu) {
                    walk(act, key, categoryOf(act, category), depth + 1);
                    return;
                }

                if (!act.execute || !act.title || seen[key]) return;

                var icon = '';
                try {
                    icon = resolveToValue(act.icon, '') || '';
                } catch (e) {
                    icon = '';
                }

                if (!icon) return;

                seen[key] = true;
                items.push({
                    key: key,
                    title: titleOf(act, name),
                    icon: String(icon),
                    category: categoryOf(act, category)
                });
            });
        }

        walk(window.actions, '', '', 0);

        items.sort(function (a, b) {
            if (a.category !== b.category) return a.category.localeCompare(b.category);
            return a.title.localeCompare(b.title);
        });

        return items;
    }

    /**
     * The saved keys, cleaned: known actions only, no duplicates, never more
     * than MAX_ITEMS. An action whose add-on was uninstalled simply drops out.
     */
    function read() {
        var value = [];

        try {
            value = app.getValue(STORAGE_KEY, []);
        } catch (e) {
            value = [];
        }

        if (!Array.isArray(value)) {
            value = String(value || '').split(',');
        }

        var seen = {};
        var items = [];

        value.forEach(function (raw) {
            var key = String(raw || '').trim();

            if (!key || seen[key] || items.length >= MAX_ITEMS) return;
            if (!resolveAction(key)) return;

            seen[key] = true;
            items.push(key);
        });

        return items;
    }

    function write(items) {
        var clean = [];

        (items || []).forEach(function (raw) {
            var key = String(raw || '').trim();

            if (!key || clean.indexOf(key) !== -1 || clean.length >= MAX_ITEMS) return;
            if (!resolveAction(key)) return;

            clean.push(key);
        });

        try {
            app.setValue(STORAGE_KEY, clean);
        } catch (e) {
            // The caller still gets the cleaned list.
        }

        return clean;
    }

    window.rightActions = {
        STORAGE_KEY: STORAGE_KEY,
        MAX_ITEMS: MAX_ITEMS,
        resolveAction: resolveAction,
        catalog: catalog,
        read: read,
        write: write
    };

})();
