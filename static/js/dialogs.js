/* Native modals own focus, Escape, and background inertness. */
const Dialogs = (() => {
    const opened = new Map();
    function finish(modal) {
        if (modal.open) return;
        const onClose = opened.get(modal);
        opened.delete(modal);
        onClose?.();
    }
    function close(modal) {
        modal.close();
        finish(modal);
    }
    function open(modal, onClose, invoker = document.activeElement) {
        if (modal.open) return;
        opened.set(modal, onClose);
        // Safari does not focus clicked buttons; establish the native return target.
        invoker?.focus({preventScroll:true});
        modal.showModal();
    }
    for (const modal of document.querySelectorAll('dialog.modal-overlay')) {
        modal.addEventListener('close', () => finish(modal));
        if ('closedBy' in HTMLDialogElement.prototype) continue;
        // Safari needs light-dismiss; require both ends outside the panel.
        const outside = event => {
            const box = modal.getBoundingClientRect();
            return event.clientX < box.left || event.clientX > box.right ||
                event.clientY < box.top || event.clientY > box.bottom;
        };
        let outsidePointer = null;
        modal.addEventListener('pointerdown', event => {
            outsidePointer = event.button === 0 && outside(event) ? event.pointerId : null;
        });
        modal.addEventListener('pointerup', event => {
            if (outsidePointer === event.pointerId && outside(event)) close(modal);
            outsidePointer = null;
        });
        modal.addEventListener('pointercancel', () => { outsidePointer = null; });
    }
    window.addEventListener('popstate', () => [...opened.keys()].reverse().forEach(close));
    return {open, close};
})();
