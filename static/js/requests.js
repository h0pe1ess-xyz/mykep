/* Keep deadlines active through response parsing, including on older WebKit. */
async function withRequestTimeout(milliseconds, operation) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return operation(AbortSignal.timeout(milliseconds));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), milliseconds);
    try { return await operation(controller.signal); }
    finally { clearTimeout(timer); }
}
