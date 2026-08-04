/**
 * Rich-text editors for the forum's body fields (create-post, the discussion
 * composer and each comment's reply form).
 *
 * Any <textarea data-richtext> is upgraded to a CKEditor 5 instance limited to
 * bold / italic / link / bulleted list / numbered list. CKEditor writes its HTML
 * back into the textarea on submit, so October's AJAX framework serialises the
 * markup without any extra plumbing. Everything posted is re-checked
 * server-side by Pensoft\Forum\Classes\RichText.
 */
window.PGT_RichText = (function () {
    'use strict';

    var TOOLBAR = ['bold', 'italic', '|', 'link', '|', 'bulletedList', 'numberedList'];

    // textarea element -> editor instance
    var editors = new WeakMap();

    function isReady() {
        return typeof window.ClassicEditor !== 'undefined';
    }

    /**
     * Visible character count of the editor's content, taken from the model
     * rather than the serialised HTML so markup never counts against the user.
     * Each block after the first counts as one character (its line break).
     */
    function textLength(editor) {
        var length = 0;
        var blocks = 0;
        var model  = editor.model;
        var root   = model.document.getRoot();

        for (var item of model.createRangeIn(root).getItems()) {
            if (item.is('$text') || item.is('$textProxy')) {
                length += item.data.length;
            } else if (item.is('element') && model.schema.isBlock(item)) {
                blocks++;
            }
        }

        return length + Math.max(0, blocks - 1);
    }

    /** Visible character count of content about to be inserted. */
    function insertedLength(model, content) {
        if (typeof content === 'string') {
            return content.length;
        }
        if (!content || typeof content.getChildren !== 'function') {
            return 0;
        }

        var length = 0;
        for (var item of model.createRangeIn(content).getItems()) {
            if (item.is('$text') || item.is('$textProxy')) {
                length += item.data.length;
            }
        }
        return length;
    }

    /**
     * Hard limit on the field's length. `maxlength` stops applying once
     * CKEditor hides the textarea, so the cap is enforced on the model: any
     * insertion (typing, paste, drop) that would take the content past the
     * limit is stopped before it lands. Re-checked server-side.
     */
    function bindLimit(textarea, editor) {
        var max = parseInt(textarea.getAttribute('data-maxlength'), 10);
        if (!max || max < 1) {
            return null;
        }

        editor.model.on('insertContent', function (evt, args) {
            var selection = editor.model.document.selection;

            // Whatever the selection covers is about to be replaced, so it
            // gives its characters back to the budget.
            var freed = 0;
            if (!selection.isCollapsed) {
                for (var item of selection.getFirstRange().getItems()) {
                    if (item.is('$text') || item.is('$textProxy')) {
                        freed += item.data.length;
                    }
                }
            }

            if (textLength(editor) - freed + insertedLength(editor.model, args[0]) > max) {
                evt.stop();
            }
        }, { priority: 'high' });

        return max;
    }

    /**
     * Mirror the editor's length into the field's character counter
     * (create-post shows "n/1500"), flagging it when the limit is reached. The
     * textarea's own `input` event never fires once CKEditor owns the input.
     */
    function bindCounter(textarea, editor, max) {
        var field = textarea.closest('.create-post__field');
        var count = field ? field.querySelector('[data-char-count]') : null;
        if (!count) {
            return;
        }

        // Flag the counter wrapper rather than the number, so the whole
        // "n/1500" reads as at-limit without needing :has() support.
        var wrap = count.closest('.create-post__counter') || count;

        var update = function () {
            var length = textLength(editor);
            count.textContent = length;
            if (max) {
                wrap.classList.toggle('is-at-limit', length >= max);
            }
        };

        editor.model.document.on('change:data', update);
        update();
    }

    function create(textarea) {
        if (editors.has(textarea)) {
            return Promise.resolve(editors.get(textarea));
        }

        // Claim it up front so a second init pass (e.g. two ajaxUpdateComplete
        // events in a row) cannot start building a duplicate editor.
        editors.set(textarea, null);

        return window.ClassicEditor
            .create(textarea, {
                toolbar: { items: TOOLBAR, shouldNotGroupWhenFull: true },
                link: { addTargetToExternalLinks: true },
                placeholder: textarea.getAttribute('placeholder') || ''
            })
            .then(function (editor) {
                editors.set(textarea, editor);
                bindCounter(textarea, editor, bindLimit(textarea, editor));
                return editor;
            })
            .catch(function (err) {
                // Leave the plain textarea in place — the field still works.
                editors.delete(textarea);
                if (window.console) console.error('CKEditor init failed', err);
            });
    }

    /** Upgrade every not-yet-initialised [data-richtext] under `scope`. */
    function init(scope) {
        if (!isReady()) {
            return;
        }

        var root = scope || document;
        root.querySelectorAll('textarea[data-richtext]').forEach(function (textarea) {
            if (!editors.has(textarea)) {
                create(textarea);
            }
        });
    }

    /** Empty the editor attached to `textarea`, if there is one. */
    function clear(textarea) {
        var editor = textarea && editors.get(textarea);
        if (editor) {
            editor.setData('');
        }
    }

    /** Empty every editor inside `scope` (used after a form posts or resets). */
    function clearWithin(scope) {
        if (!scope) {
            return;
        }
        scope.querySelectorAll('textarea[data-richtext]').forEach(clear);
    }

    document.addEventListener('DOMContentLoaded', function () { init(); });

    // Partial updates (a posted comment re-rendering #forum-messages) bring in
    // fresh reply forms that need editors of their own.
    if (window.jQuery) {
        window.jQuery(window).on('ajaxUpdateComplete', function () { init(); });
    }

    // A form reset (the composer's "Cancel") clears the textarea but not the
    // editor that shadows it.
    document.addEventListener('reset', function (e) {
        var form = e.target;
        if (form && form.querySelector && form.querySelector('textarea[data-richtext]')) {
            setTimeout(function () { clearWithin(form); }, 0);
        }
    });

    return { init: init, clear: clear, clearWithin: clearWithin };
})();
