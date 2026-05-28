(function ($) {
    'use strict';

    var SELECTORS = {
        modal: '#pgtAuthModal',
        modalContent: '#authFlowModalContent',
        welcome: '#pgtWelcomeCard'
    };

    function openModal() {
        var $m = $(SELECTORS.modal);
        $m.addClass('is-open').attr('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        var $m = $(SELECTORS.modal);
        $m.removeClass('is-open').attr('aria-hidden', 'true');
        $(SELECTORS.modalContent).empty();
        document.body.style.overflow = '';
    }

    function loadStep(step, extraData) {
        var data = $.extend({ step: step }, extraData || {});
        return $.request('authFlow::onShowStep', {
            data: data,
            success: function (response) {
                this.success(response).done(function () {
                    openModal();
                });
            }
        });
    }

    $(document).on('click', '[data-pgt-step]', function (e) {
        e.preventDefault();
        var step = $(this).data('pgt-step');
        loadStep(step);
    });

    $(document).on('click', '[data-pgt-close]', function (e) {
        e.preventDefault();
        closeModal();
    });

    $(document).on('click', '[data-pgt-close-welcome]', function (e) {
        e.preventDefault();
        $(SELECTORS.welcome).fadeOut(200);
    });

    $(document).on('click', '[data-pgt-toggle-password]', function (e) {
        e.preventDefault();
        var target = $(this).data('pgt-toggle-password');
        var $input = $(target);
        var isPw = $input.attr('type') === 'password';
        $input.attr('type', isPw ? 'text' : 'password');
        $(this).find('.pgt-password-toggle__text').text(isPw ? 'Hide' : 'Show');
        $(this).attr('aria-label', isPw ? 'Hide password' : 'Show password');
    });

    // ESC closes the modal
    $(document).on('keydown', function (e) {
        if (e.key === 'Escape' && $(SELECTORS.modal).hasClass('is-open')) {
            closeModal();
        }
    });

    $(function () {
        if (window.PGT_AUTH && window.PGT_AUTH.justActivated) {
            loadStep('activated');
        }
        if (window.PGT_AUTH && window.PGT_AUTH.activationError) {
            alert(window.PGT_AUTH.activationError);
        }
        if (window.PGT_AUTH && window.PGT_AUTH.resetCode) {
            loadStep('reset', { code: window.PGT_AUTH.resetCode });
        }

        // Arrived via a redirect that asks for a specific auth popup (e.g. the
        // retired /login → /?login=1, /forgot → /?forgot=1, /register →
        // /?register=1). The URL flag maps to an auth-flow step (registration
        // starts at the "reasons" step). Only act if the modal shell exists
        // (guests); logged-in pages don't render it.
        var stepParams = { login: 'login', forgot: 'forgot', register: 'reasons' };
        for (var param in stepParams) {
            if (!Object.prototype.hasOwnProperty.call(stepParams, param)) continue;
            if (new RegExp('[?&]' + param + '=1(&|$)').test(window.location.search) && $(SELECTORS.modal).length) {
                loadStep(stepParams[param]);
                // Strip the flag so a refresh / back-button doesn't reopen the popup.
                if (window.history && window.history.replaceState) {
                    var cleaned = window.location.search.replace(new RegExp('[?&]' + param + '=1'), '');
                    if (cleaned.charAt(0) === '&') cleaned = '?' + cleaned.slice(1);
                    window.history.replaceState({}, document.title, window.location.pathname + cleaned + window.location.hash);
                }
                break;
            }
        }
    });

    // Expose for inline handlers if needed
    window.PGT_AUTH = window.PGT_AUTH || {};
    window.PGT_AUTH.loadStep = loadStep;
    window.PGT_AUTH.closeModal = closeModal;
})(jQuery);
