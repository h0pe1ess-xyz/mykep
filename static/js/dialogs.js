/* Shared lifecycle for settings dialogs; viewport sizing stays in app.css. */
const Dialogs = (() => {
    const opened = new Map();
    function close(modal) {
        const state = opened.get(modal);
        modal.classList.remove('active');
        if (!state) return;
        opened.delete(modal);
        document.getElementById('main-app').inert = state.inert;
        state.onClose?.();
        if (state.focus?.isConnected && !state.focus.closest('[inert]')) state.focus.focus({preventScroll:true});
    }
    function open(modal, focus, onClose, returnFocus = document.activeElement) {
        if (opened.has(modal)) return;
        const main = document.getElementById('main-app');
        opened.set(modal,{focus:returnFocus,inert:main.inert,onClose});
        main.inert=true;
        modal.classList.add('active');
        (focus || modal.querySelector('button, input, select'))?.focus({preventScroll:true});
    }
    document.addEventListener('click', event => {
        if (opened.has(event.target)) close(event.target);
    });
    document.addEventListener('keydown', event => {
        const modal=[...opened.keys()].at(-1);
        if (!modal) return;
        if (event.key === 'Escape') { event.preventDefault(); close(modal); }
        if (event.key !== 'Tab') return;
        const controls=[...modal.querySelectorAll('button, input, select, a[href], [tabindex="0"]')].filter(n => !n.disabled && n.getClientRects().length);
        const first=controls[0],last=controls.at(-1);
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    window.addEventListener('popstate',() => [...opened.keys()].reverse().forEach(close));
    return {open,close};
})();
