/* Fit contents to the actual main track, without viewport/safe-area overrides. */
(() => {
    let frame = 0;
    function fit() {
        frame = 0;
        const main = document.getElementById('dashboard-main');
        if (!main || !main.clientHeight) return;
        for (let density = 0; density <= 4; density++) {
            main.dataset.density = String(density);
            const style = getComputedStyle(main);
            const children = [...main.children].filter(node => getComputedStyle(node).display !== 'none');
            const needed = children.reduce((height, node) => {
                const css = getComputedStyle(node);
                return height + node.getBoundingClientRect().height + parseFloat(css.marginTop || 0) + parseFloat(css.marginBottom || 0);
            }, 0) + Math.max(0, children.length - 1) * (parseFloat(style.rowGap) || 0)
                + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
            if (needed <= main.clientHeight + 1) break;
        }
    }
    window.requestDashboardFit = () => {
        if (!frame) frame = requestAnimationFrame(fit);
    };
    document.addEventListener('DOMContentLoaded', () => {
        const main = document.getElementById('dashboard-main');
        if (!main) return;
        if (typeof ResizeObserver !== 'undefined') new ResizeObserver(window.requestDashboardFit).observe(main);
        new MutationObserver(window.requestDashboardFit).observe(main, { childList: true, subtree: true, characterData: true });
        document.fonts?.ready.then(window.requestDashboardFit);
        window.requestDashboardFit();
    });
    window.addEventListener('resize', window.requestDashboardFit);
    window.addEventListener('pageshow', window.requestDashboardFit);
})();
