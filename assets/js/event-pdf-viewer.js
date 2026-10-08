/*
 * Event PDF viewer — page carousel shown at the bottom of /events/:slug.
 * Renders pages with PDF.js (loaded on demand) into a track where the
 * current page sits centred and its neighbours peek out behind it.
 */
(function () {
    'use strict';

    var PDFJS_VERSION = '3.11.174';
    var PDFJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VERSION + '/';
    var PRELOAD_RADIUS = 2;

    var pdfjsPromise = null;

    function loadPdfJs() {
        if (window.pdfjsLib) {
            return Promise.resolve(window.pdfjsLib);
        }
        if (!pdfjsPromise) {
            pdfjsPromise = new Promise(function (resolve, reject) {
                var s = document.createElement('script');
                s.src = PDFJS_BASE + 'pdf.min.js';
                s.onload = function () {
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + 'pdf.worker.min.js';
                    resolve(window.pdfjsLib);
                };
                s.onerror = reject;
                document.head.appendChild(s);
            });
        }
        return pdfjsPromise;
    }

    function Viewer(root) {
        this.root = root;
        this.stage = root.querySelector('.event-pdf__stage');
        this.track = root.querySelector('[data-pdf-track]');
        this.loading = root.querySelector('[data-pdf-loading]');
        this.prevBtn = root.querySelector('[data-pdf-prev]');
        this.nextBtn = root.querySelector('[data-pdf-next]');
        this.currentEl = root.querySelector('[data-pdf-current]');
        this.totalEl = root.querySelector('[data-pdf-total]');
        this.doc = null;
        this.pages = [];      // slide elements, index 0 = page 1
        this.rendered = {};   // pageNumber -> Promise
        this.index = 0;
        this.renderHeight = 0;
    }

    Viewer.prototype.init = function () {
        var self = this;

        loadPdfJs()
            .then(function (pdfjsLib) {
                return pdfjsLib.getDocument(self.root.getAttribute('data-src')).promise;
            })
            .then(function (doc) {
                self.doc = doc;
                self.build();
            })
            .catch(function () {
                self.loading.textContent = 'The PDF could not be displayed. Use “Download PDF” to open it.';
                self.root.classList.add('is-error');
            });
    };

    Viewer.prototype.build = function () {
        var self = this;
        var total = this.doc.numPages;

        this.totalEl.textContent = total;

        for (var i = 0; i < total; i++) {
            var slide = document.createElement('button');
            slide.type = 'button';
            slide.className = 'event-pdf__page';
            slide.setAttribute('aria-label', 'Page ' + (i + 1));
            slide.setAttribute('data-index', i);
            slide.addEventListener('click', function (e) {
                var idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
                if (idx !== self.index) {
                    self.go(idx);
                }
            });
            this.track.appendChild(slide);
            this.pages.push(slide);
        }

        this.prevBtn.addEventListener('click', function () { self.go(self.index - 1); });
        this.nextBtn.addEventListener('click', function () { self.go(self.index + 1); });

        this.stage.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowLeft') { e.preventDefault(); self.go(self.index - 1); }
            if (e.key === 'ArrowRight') { e.preventDefault(); self.go(self.index + 1); }
        });

        this.bindSwipe();

        // Re-render at the new size when the stage height changes noticeably
        var resizeTimer;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                var h = self.targetHeight();
                if (Math.abs(h - self.renderHeight) > 120) {
                    self.rendered = {};
                    self.update();
                }
            }, 250);
        });

        this.go(0);
    };

    Viewer.prototype.bindSwipe = function () {
        var self = this;
        var startX = null;

        this.stage.addEventListener('touchstart', function (e) {
            startX = e.touches[0].clientX;
        }, { passive: true });

        this.stage.addEventListener('touchend', function (e) {
            if (startX === null) { return; }
            var dx = e.changedTouches[0].clientX - startX;
            startX = null;
            if (Math.abs(dx) > 40) {
                self.go(self.index + (dx < 0 ? 1 : -1));
            }
        });
    };

    Viewer.prototype.go = function (idx) {
        if (!this.doc) { return; }
        idx = Math.max(0, Math.min(this.pages.length - 1, idx));
        this.index = idx;
        this.update();
    };

    Viewer.prototype.update = function () {
        var idx = this.index;

        this.pages.forEach(function (el, i) {
            var offset = i - idx;
            el.classList.remove('is-current', 'is-prev', 'is-next', 'is-before', 'is-after');
            if (offset === 0) { el.classList.add('is-current'); }
            else if (offset === -1) { el.classList.add('is-prev'); }
            else if (offset === 1) { el.classList.add('is-next'); }
            else if (offset < 0) { el.classList.add('is-before'); }
            else { el.classList.add('is-after'); }
            el.tabIndex = Math.abs(offset) === 1 ? 0 : -1;
            el.setAttribute('aria-hidden', Math.abs(offset) > 1 ? 'true' : 'false');
        });

        this.currentEl.textContent = idx + 1;
        this.prevBtn.disabled = idx === 0;
        this.nextBtn.disabled = idx === this.pages.length - 1;

        for (var d = 0; d <= PRELOAD_RADIUS; d++) {
            this.render(idx + d);
            if (d) { this.render(idx - d); }
        }
    };

    Viewer.prototype.targetHeight = function () {
        var ratio = Math.min(window.devicePixelRatio || 1, 2);
        return Math.round(this.stage.clientHeight * 0.92 * ratio);
    };

    Viewer.prototype.render = function (idx) {
        var self = this;
        if (idx < 0 || idx >= this.pages.length || this.rendered[idx]) { return; }

        this.renderHeight = this.targetHeight();
        var targetHeight = this.renderHeight;

        this.rendered[idx] = this.doc.getPage(idx + 1).then(function (page) {
            var base = page.getViewport({ scale: 1 });
            var viewport = page.getViewport({ scale: targetHeight / base.height });
            var canvas = document.createElement('canvas');
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);

            return page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise
                .then(function () {
                    var slide = self.pages[idx];
                    slide.style.aspectRatio = base.width + ' / ' + base.height;
                    slide.innerHTML = '';
                    slide.appendChild(canvas);
                    slide.classList.add('is-ready');
                    if (idx === self.index) {
                        self.loading.hidden = true;
                    }
                });
        });
    };

    // Editors can place the viewer anywhere in the description with
    // <div id="PDF-Viewer"></div>; otherwise it stays where it was rendered.
    function placeViewer() {
        var slot = document.getElementById('PDF-Viewer');
        var viewer = document.querySelector('[data-event-pdf]');
        if (slot && viewer) {
            slot.innerHTML = '';
            slot.appendChild(viewer);
        }
    }

    function boot() {
        placeViewer();
        var nodes = document.querySelectorAll('[data-event-pdf]');
        for (var i = 0; i < nodes.length; i++) {
            new Viewer(nodes[i]).init();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
