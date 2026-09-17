/**
 * Custom dropdowns for the Post a job form (GT-129, Post a job #2).
 *
 * A native <select> renders its panel in the OS, outside the page, so CSS
 * cannot animate it and there is no reliable "is open" state to hang an arrow
 * rotation off. This replaces the visible control with a button + listbox that
 * can be animated, and leaves the real <select> in the DOM as the source of
 * truth: October serialises the form, `data-request-validate` focuses invalid
 * fields, and the "Post another" reset all keep working untouched.
 *
 * Progressive enhancement — the native select is only hidden once its
 * replacement is built, so a script failure leaves a working form.
 */
(function () {
    'use strict';

    var OPEN = 'is-open';

    function build(select) {
        if (select.dataset.pjCombo) return;
        select.dataset.pjCombo = '1';

        var id = select.id || ('pjsel-' + Math.random().toString(36).slice(2, 8));
        var combo = document.createElement('div');
        combo.className = 'pj-combo';

        var button = document.createElement('button');
        button.type = 'button';                 // never submits the form
        button.className = 'pj-combo__button';
        button.id = id + '-button';
        button.setAttribute('aria-haspopup', 'listbox');
        button.setAttribute('aria-expanded', 'false');

        var value = document.createElement('span');
        value.className = 'pj-combo__value';

        var arrow = document.createElement('span');
        arrow.className = 'pj-combo__arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.innerHTML = '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true">'
                        + '<path d="M1.5 4 6 8.5 10.5 4" stroke="currentColor" stroke-width="1.6" '
                        + 'stroke-linecap="round" stroke-linejoin="round"/></svg>';

        button.appendChild(value);
        button.appendChild(arrow);

        var list = document.createElement('ul');
        list.className = 'pj-combo__list';
        list.id = id + '-list';
        list.setAttribute('role', 'listbox');
        list.setAttribute('tabindex', '-1');
        button.setAttribute('aria-controls', list.id);

        // The form's <label for="…"> points at the select; keep it announcing
        // the control the user actually operates.
        var label = select.id && document.querySelector('label[for="' + select.id + '"]');
        if (label) button.setAttribute('aria-labelledby', (label.id || (label.id = id + '-label')) + ' ' + button.id);

        var options = [];
        Array.prototype.forEach.call(select.options, function (opt, i) {
            var li = document.createElement('li');
            li.className = 'pj-combo__option';
            li.id = id + '-opt-' + i;
            li.setAttribute('role', 'option');
            li.setAttribute('tabindex', '-1');
            li.dataset.value = opt.value;
            li.textContent = opt.textContent;
            // A blank value is the "Select..." placeholder, not a real choice.
            if (opt.value === '') li.classList.add('pj-combo__option--placeholder');
            list.appendChild(li);
            options.push(li);
        });

        select.parentNode.insertBefore(combo, select);
        combo.appendChild(select);
        combo.appendChild(button);
        combo.appendChild(list);
        select.classList.add('pj-combo__native');

        var activeIndex = select.selectedIndex < 0 ? 0 : select.selectedIndex;

        function syncFromSelect() {
            var opt = select.options[select.selectedIndex];
            value.textContent = opt ? opt.textContent : '';
            value.classList.toggle('is-placeholder', !opt || opt.value === '');
            options.forEach(function (li, i) {
                var on = i === select.selectedIndex;
                li.classList.toggle('is-selected', on);
                li.setAttribute('aria-selected', on ? 'true' : 'false');
            });
        }

        function setActive(i) {
            if (i < 0) i = 0;
            if (i > options.length - 1) i = options.length - 1;
            activeIndex = i;
            options.forEach(function (li, n) { li.classList.toggle('is-active', n === i); });
            list.setAttribute('aria-activedescendant', options[i].id);
            // Keep the highlighted row in view without scrolling the page.
            var li = options[i];
            if (li.offsetTop < list.scrollTop) list.scrollTop = li.offsetTop;
            else if (li.offsetTop + li.offsetHeight > list.scrollTop + list.clientHeight) {
                list.scrollTop = li.offsetTop + li.offsetHeight - list.clientHeight;
            }
        }

        function open() {
            if (combo.classList.contains(OPEN)) return;
            closeAll();
            combo.classList.add(OPEN);
            button.setAttribute('aria-expanded', 'true');
            setActive(select.selectedIndex < 0 ? 0 : select.selectedIndex);
            list.focus();
        }

        function close(focusButton) {
            if (!combo.classList.contains(OPEN)) return;
            combo.classList.remove(OPEN);
            button.setAttribute('aria-expanded', 'false');
            if (focusButton) button.focus();
        }

        function choose(i) {
            select.selectedIndex = i;
            // Fire change so anything already listening to the native select
            // behaves exactly as before the enhancement.
            select.dispatchEvent(new Event('change', { bubbles: true }));
            syncFromSelect();
            close(true);
        }

        button.addEventListener('click', function () {
            combo.classList.contains(OPEN) ? close(false) : open();
        });

        button.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open();
            }
        });

        // A real mousedown moves focus to the pressed <li> (they carry
        // tabindex="-1" for the roving active descendant), which blurred the
        // list, closed the panel and left it pointer-events:none before the
        // click could land — so no option was selectable with the mouse.
        // Holding focus on the list avoids the blur entirely.
        list.addEventListener('mousedown', function (e) { e.preventDefault(); });

        list.addEventListener('click', function (e) {
            var li = e.target.closest('.pj-combo__option');
            if (li) choose(options.indexOf(li));
        });

        list.addEventListener('keydown', function (e) {
            switch (e.key) {
                case 'ArrowDown': e.preventDefault(); setActive(activeIndex + 1); break;
                case 'ArrowUp':   e.preventDefault(); setActive(activeIndex - 1); break;
                case 'Home':      e.preventDefault(); setActive(0); break;
                case 'End':       e.preventDefault(); setActive(options.length - 1); break;
                case 'Enter':
                case ' ':         e.preventDefault(); choose(activeIndex); break;
                case 'Escape':    e.preventDefault(); close(true); break;
                case 'Tab':       close(false); break;
                default:
                    // Type-ahead on printable characters.
                    if (e.key.length === 1) {
                        var ch = e.key.toLowerCase();
                        for (var n = 1; n <= options.length; n++) {
                            var i = (activeIndex + n) % options.length;
                            if (options[i].textContent.trim().toLowerCase().indexOf(ch) === 0) {
                                setActive(i);
                                break;
                            }
                        }
                    }
            }
        });

        // Close when focus genuinely leaves the control (Tab away), but not
        // when it merely moves to the button or a row inside it.
        list.addEventListener('blur', function (e) {
            if (e.relatedTarget && combo.contains(e.relatedTarget)) return;
            close(false);
        });

        // form.reset() restores the select's value but fires before that lands.
        var form = select.form;
        if (form) form.addEventListener('reset', function () { setTimeout(syncFromSelect, 0); });

        // Anything that sets the select programmatically keeps the label honest.
        select.addEventListener('change', syncFromSelect);

        syncFromSelect();
    }

    function closeAll(except) {
        Array.prototype.forEach.call(document.querySelectorAll('.pj-combo.' + OPEN), function (c) {
            if (c === except) return;
            c.classList.remove(OPEN);
            var b = c.querySelector('.pj-combo__button');
            if (b) b.setAttribute('aria-expanded', 'false');
        });
    }

    document.addEventListener('click', function (e) {
        if (!e.target.closest || !e.target.closest('.pj-combo')) closeAll();
    });

    function init() {
        Array.prototype.forEach.call(document.querySelectorAll('select.pj-select'), build);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
