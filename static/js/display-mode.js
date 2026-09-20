/* Run in <head>: only installed iOS gets the legacy full-height app shell.
 * Safari tabs, Android and the installation/onboarding UI keep their layout.
 */
function getMyKepDisplayMode(nav = navigator, view = window) {
    const ua = nav.userAgent || '';
    const ios = /iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && nav.maxTouchPoints > 1);
    const standalone = nav.standalone === true || view.matchMedia('(display-mode: standalone)').matches;
    return { ios, standalone };
}
function updateMyKepDisplayMode() {
    const mode = getMyKepDisplayMode();
    document.documentElement.classList.toggle('ios-standalone', mode.ios && mode.standalone);
}
updateMyKepDisplayMode();
window.matchMedia('(display-mode: standalone)').addEventListener?.('change', updateMyKepDisplayMode);
window.addEventListener('pageshow', updateMyKepDisplayMode);

/* Optional local diagnosis from Safari's console; never sends anything.
 * No group, URL, credentials, localStorage or other user data is included.
 */
window.mykepViewportReport = function() {
    function rect(selector) {
        const node = document.querySelector(selector);
        if (!node) return null;
        const r = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return { top: r.top, bottom: r.bottom, height: r.height,
            paddingTop: style.paddingTop, paddingBottom: style.paddingBottom,
            position: style.position };
    }
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:0;top:0;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px);';
    document.body.appendChild(probe);
    const safeStyle = window.getComputedStyle(probe);
    const safeArea = { top: safeStyle.paddingTop, bottom: safeStyle.paddingBottom };
    probe.style.padding = '0';
    const units = {};
    for (const unit of ['vh', 'dvh', 'lvh']) {
        probe.style.height = '';
        probe.style.height = `100${unit}`;
        units[unit] = probe.style.height ? probe.getBoundingClientRect().height : null;
    }
    probe.remove();
    const viewport = window.visualViewport;
    return { version: '2.6.8', mode: getMyKepDisplayMode(),
        iosFixActive: document.documentElement.classList.contains('ios-standalone'),
        innerHeight: window.innerHeight, clientHeight: document.documentElement.clientHeight,
        visualViewport: viewport ? { height: viewport.height, offsetTop: viewport.offsetTop, scale: viewport.scale } : null,
        units, safeArea, body: rect('body'), app: rect('.app-container'), nav: rect('.bottom-nav') };
};
