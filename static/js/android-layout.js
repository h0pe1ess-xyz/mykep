/* Android only: reserve navigation space inside the measured visible viewport.
 * Do not subtract a guessed system-bar height, and do not alter iOS safe areas.
 */
(function () {
    if (!/Android/i.test(navigator.userAgent || '')) return;
    var root = document.documentElement;
    root.classList.add('android-viewport');
    var frame = 0;
    function writePx(name, value) {
        var text = Math.round(value * 100) / 100 + 'px';
        if (root.style.getPropertyValue(name) !== text) root.style.setProperty(name, text);
    }
    function update() {
        frame = 0;
        var height = window.innerHeight;
        var visual = window.visualViewport;
        if (visual && visual.height > 0 && Math.abs((visual.scale || 1) - 1) < 0.01) {
            height = height > 0 ? Math.min(height, visual.height) : visual.height;
        }
        if (height > 0) writePx('--android-viewport-height', height);
        var nav = document.querySelector('.app-container > .bottom-nav');
        if (nav) {
            var navHeight = nav.getBoundingClientRect().height;
            if (navHeight > 0) writePx('--android-nav-height', navHeight);
        }
    }
    function schedule() {
        if (!frame) frame = window.requestAnimationFrame(update);
    }
    update();
    window.addEventListener('resize', schedule);
    window.addEventListener('pageshow', schedule);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', schedule);
    document.addEventListener('DOMContentLoaded', function () {
        update();
        var nav = document.querySelector('.app-container > .bottom-nav');
        if (nav && typeof ResizeObserver !== 'undefined') new ResizeObserver(schedule).observe(nav);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    });
})();
