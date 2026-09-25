/* MyKep Admin: tiny dependency-free SVG charts.
   Security: text is only ever written with textContent; SVG is built with
   createElementNS/setAttribute (no innerHTML), so data cannot inject markup. */
(() => {
    'use strict';
    const NS = 'http://www.w3.org/2000/svg';
    const nf = new Intl.NumberFormat('uk-UA');
    const nf1 = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 1 });
    let uid = 0;
    const PALETTE = ['#ff5500', '#ffb020', '#2dd4bf', '#60a5fa', '#a78bfa', '#f472b6', '#4ade80', '#dfd1c9', '#94a3b8', '#fb7185'];

    function svg(tag, attrs = {}, parent) {
        const node = document.createElementNS(NS, tag);
        for (const [k, v] of Object.entries(attrs)) {
            if (v === undefined || v === null || /^on/i.test(k) || k === 'style' || k === 'href') continue;
            node.setAttribute(k, String(v));
        }
        if (parent) parent.appendChild(node);
        return node;
    }
    function el(tag, cls, text) {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }
    function niceMax(value) {
        if (!(value > 0)) return 1;
        const exp = Math.pow(10, Math.floor(Math.log10(value)));
        const f = value / exp;
        const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
        return nice * exp;
    }
    function fmt(v) { return Number.isInteger(v) ? nf.format(v) : nf1.format(v); }
    function compact(v) {
        if (v >= 10000) return nf1.format(v / 1000) + 'k';
        return fmt(Math.round(v * 10) / 10);
    }

    // Fritsch–Carlson monotone cubic: smooth lines that never overshoot below 0.
    function monotonePath(pts) {
        const n = pts.length;
        if (n === 0) return '';
        if (n < 3) return pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
        const dx = [], dy = [], m = [], t = [];
        for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; dy[i] = pts[i + 1][1] - pts[i][1]; m[i] = dy[i] / dx[i]; }
        t[0] = m[0]; t[n - 1] = m[n - 2];
        for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
        for (let i = 0; i < n - 1; i++) {
            if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
            const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
            if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
        }
        let d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
        for (let i = 0; i < n - 1; i++) {
            const h = dx[i] / 3;
            d += 'C' + (pts[i][0] + h).toFixed(1) + ' ' + (pts[i][1] + h * t[i]).toFixed(1) + ' ' +
                (pts[i + 1][0] - h).toFixed(1) + ' ' + (pts[i + 1][1] - h * t[i + 1]).toFixed(1) + ' ' +
                pts[i + 1][0].toFixed(1) + ' ' + pts[i + 1][1].toFixed(1);
        }
        return d;
    }

    function prepare(container, opts, render) {
        container.classList.add('chart');
        container._chart = { opts, render };
        if (!container._observer && 'ResizeObserver' in window) {
            let lastWidth = 0;
            container._observer = new ResizeObserver(() => {
                const w = Math.round(container.clientWidth);
                if (w && Math.abs(w - lastWidth) > 4) { lastWidth = w; container._chart.render(container, container._chart.opts); }
            });
            container._observer.observe(container);
        }
        render(container, opts);
    }

    function legend(container, series) {
        if (series.length < 2) return;
        const box = el('div', 'chart-legend');
        series.forEach(s => {
            const item = el('span', 'chart-legend-item');
            const dot = el('i', 'chart-dot');
            dot.style.background = s.color;
            item.append(dot, document.createTextNode(s.name));
            box.appendChild(item);
        });
        container.appendChild(box);
    }

    function tooltip(container) {
        const tip = el('div', 'chart-tip');
        tip.hidden = true;
        container.appendChild(tip);
        return {
            show(x, y, title, rows) {
                tip.replaceChildren(el('div', 'chart-tip-title', title));
                rows.forEach(r => {
                    const row = el('div', 'chart-tip-row');
                    const dot = el('i', 'chart-dot'); dot.style.background = r.color;
                    row.append(dot, el('span', 'chart-tip-name', r.name), el('b', null, r.value));
                    tip.appendChild(row);
                });
                tip.hidden = false;
                const cw = container.clientWidth, tw = tip.offsetWidth;
                // Keep the tooltip inside the chart so it never widens the page.
                let left = x + 12;
                if (left + tw > cw) left = x - tw - 12;
                left = Math.max(0, Math.min(left, cw - tw));
                tip.style.left = left + 'px';
                tip.style.top = Math.max(0, y - 10) + 'px';
            },
            hide() { tip.hidden = true; }
        };
    }

    function axes(g, W, H, pad, yMax, yFmt) {
        const steps = 4;
        for (let i = 0; i <= steps; i++) {
            const v = yMax / steps * i;
            const y = H - pad.b - (H - pad.t - pad.b) * (i / steps);
            svg('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: i ? 'gridline' : 'gridline base' }, g);
            const t = svg('text', { x: pad.l - 6, y: y + 3.5, 'text-anchor': 'end', class: 'axis' }, g);
            t.textContent = (yFmt || compact)(v);
        }
    }

    function xTicks(g, labels, xAt, H, pad, maxTicks) {
        const n = labels.length;
        const every = Math.max(1, Math.ceil(n / maxTicks));
        for (let i = 0; i < n; i += every) {
            const t = svg('text', { x: xAt(i), y: H - pad.b + 16, 'text-anchor': 'middle', class: 'axis' }, g);
            t.textContent = labels[i];
        }
    }

    /* ---------------------------------------------------------------- line */
    function renderLine(container, o) {
        container.replaceChildren();
        const series = o.series.filter(s => s && s.values);
        legend(container, series);
        const W = Math.max(280, container.clientWidth || 600), H = o.height || 220;
        const pad = { l: 38, r: 12, t: 12, b: 26 };
        const n = o.labels.length;
        const maxV = Math.max(0, ...series.flatMap(s => s.values.filter(v => Number.isFinite(v))));
        const yMax = niceMax(maxV * 1.08);
        const x = i => pad.l + (n <= 1 ? (W - pad.l - pad.r) / 2 : (W - pad.l - pad.r) * i / (n - 1));
        const y = v => H - pad.b - (H - pad.t - pad.b) * (v / yMax);
        const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img', 'aria-label': o.aria || 'Графік' });
        const defs = svg('defs', {}, root);
        const g = svg('g', {}, root);
        // Optional highlighted bands (e.g. lesson times).
        (o.bands || []).forEach(b => {
            const x1 = x(b.from), x2 = x(b.to);
            svg('rect', { x: x1, y: pad.t, width: Math.max(1, x2 - x1), height: H - pad.t - pad.b, class: 'band' }, g);
            if (b.label && x2 - x1 > 14) {
                const t = svg('text', { x: (x1 + x2) / 2, y: pad.t + 10, 'text-anchor': 'middle', class: 'band-label' }, g);
                t.textContent = b.label;
            }
        });
        axes(g, W, H, pad, yMax, o.yFmt);
        xTicks(g, o.labels, x, H, pad, Math.max(3, Math.floor(W / 70)));
        series.forEach(s => {
            const pts = s.values.map((v, i) => [x(i), y(v || 0)]);
            const d = monotonePath(pts);
            if (s.area !== false) {
                const id = 'lg' + (++uid);
                const grad = svg('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
                svg('stop', { offset: '0%', 'stop-color': s.color, 'stop-opacity': s.dashed ? 0 : 0.35 }, grad);
                svg('stop', { offset: '100%', 'stop-color': s.color, 'stop-opacity': 0 }, grad);
                if (pts.length) svg('path', { d: d + `L${pts[pts.length - 1][0]} ${H - pad.b}L${pts[0][0]} ${H - pad.b}Z`, fill: `url(#${id})` }, g);
            }
            svg('path', { d, fill: 'none', stroke: s.color, 'stroke-width': s.width || 2.2, 'stroke-linecap': 'round',
                'stroke-linejoin': 'round', 'stroke-dasharray': s.dashed ? '5 5' : null, class: 'line-path' }, g);
        });
        const cursor = svg('line', { y1: pad.t, y2: H - pad.b, class: 'cursor', visibility: 'hidden' }, g);
        const dots = series.map(s => svg('circle', { r: 4, fill: s.color, stroke: '#0e0a08', 'stroke-width': 2, visibility: 'hidden' }, g));
        const hit = svg('rect', { x: pad.l, y: 0, width: W - pad.l - pad.r, height: H, fill: 'transparent' }, root);
        container.appendChild(root);
        const tip = tooltip(container);
        const move = ev => {
            const rect = root.getBoundingClientRect();
            const px = (ev.clientX - rect.left) * (W / rect.width);
            const i = Math.max(0, Math.min(n - 1, Math.round((px - pad.l) / ((W - pad.l - pad.r) / Math.max(1, n - 1)))));
            cursor.setAttribute('x1', x(i)); cursor.setAttribute('x2', x(i)); cursor.setAttribute('visibility', 'visible');
            series.forEach((s, k) => {
                const v = s.values[i];
                dots[k].setAttribute('cx', x(i)); dots[k].setAttribute('cy', y(v || 0));
                dots[k].setAttribute('visibility', v === undefined || v === null ? 'hidden' : 'visible');
            });
            tip.show(x(i) * rect.width / W, (ev.clientY - rect.top), (o.titles || o.labels)[i],
                series.map(s => ({ name: s.name, color: s.color,
                    value: s.values[i] === undefined || s.values[i] === null ? '–' : (o.tipFmt || fmt)(s.values[i]) })));
        };
        const leave = () => { cursor.setAttribute('visibility', 'hidden'); dots.forEach(d => d.setAttribute('visibility', 'hidden')); tip.hide(); };
        hit.addEventListener('pointermove', move);
        hit.addEventListener('pointerdown', move);
        hit.addEventListener('pointerleave', leave);
    }

    /* ----------------------------------------------------------------- bar */
    function renderBars(container, o) {
        container.replaceChildren();
        const series = o.series || [{ name: o.name || 'Значення', values: o.values, color: o.color || PALETTE[0] }];
        legend(container, series);
        const W = Math.max(280, container.clientWidth || 600), H = o.height || 200;
        const pad = { l: 38, r: 8, t: 14, b: 26 };
        const n = o.labels.length;
        const totals = o.labels.map((_, i) => series.reduce((a, s) => a + (s.values[i] || 0), 0));
        const yMax = niceMax(Math.max(0, ...totals) * 1.08);
        const band = (W - pad.l - pad.r) / Math.max(1, n);
        const bw = Math.max(2, Math.min(band * 0.72, 42));
        const x = i => pad.l + band * i + band / 2;
        const y = v => H - pad.b - (H - pad.t - pad.b) * (v / yMax);
        const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img', 'aria-label': o.aria || 'Графік' });
        const g = svg('g', {}, root);
        axes(g, W, H, pad, yMax, o.yFmt);
        xTicks(g, o.labels, x, H, pad, Math.max(3, Math.floor(W / 46)));
        const maxIndex = totals.indexOf(Math.max(...totals));
        const bars = [];
        o.labels.forEach((_, i) => {
            let acc = 0;
            series.forEach((s, k) => {
                const v = s.values[i] || 0;
                if (v <= 0) return;
                const top = y(acc + v), bottom = y(acc);
                const isTop = k === series.length - 1 || series.slice(k + 1).every(t => !(t.values[i] > 0));
                const r = svg('rect', { x: x(i) - bw / 2, y: top, width: bw, height: Math.max(1, bottom - top),
                    rx: isTop ? Math.min(5, bw / 3) : 0, fill: s.color,
                    class: 'bar' + (o.highlightMax && i === maxIndex && series.length === 1 ? ' bar-peak' : '') }, g);
                bars.push(r);
                acc += v;
            });
        });
        if (o.highlightMax && totals[maxIndex] > 0) {
            const t = svg('text', { x: x(maxIndex), y: y(totals[maxIndex]) - 5, 'text-anchor': 'middle', class: 'peak-label' }, g);
            t.textContent = compact(totals[maxIndex]);
        }
        const hit = svg('rect', { x: pad.l, y: 0, width: W - pad.l - pad.r, height: H, fill: 'transparent' }, root);
        const cursor = svg('rect', { y: pad.t, height: H - pad.t - pad.b, width: band, class: 'bar-cursor', visibility: 'hidden' }, g);
        g.insertBefore(cursor, g.firstChild);
        container.appendChild(root);
        const tip = tooltip(container);
        const move = ev => {
            const rect = root.getBoundingClientRect();
            const px = (ev.clientX - rect.left) * (W / rect.width);
            const i = Math.max(0, Math.min(n - 1, Math.floor((px - pad.l) / band)));
            cursor.setAttribute('x', pad.l + band * i); cursor.setAttribute('visibility', 'visible');
            const rows = series.map(s => ({ name: s.name, color: s.color, value: (o.tipFmt || fmt)(s.values[i] || 0) }));
            if (series.length > 1) rows.push({ name: 'Разом', color: 'transparent', value: (o.tipFmt || fmt)(totals[i]) });
            tip.show(x(i) * rect.width / W, ev.clientY - rect.top, (o.titles || o.labels)[i], rows);
        };
        hit.addEventListener('pointermove', move);
        hit.addEventListener('pointerdown', move);
        hit.addEventListener('pointerleave', () => { cursor.setAttribute('visibility', 'hidden'); tip.hide(); });
    }

    /* ------------------------------------------------------------- heatmap */
    function renderHeatmap(container, o) {
        container.replaceChildren();
        const rows = o.rows, cols = 24;
        const W = Math.max(300, container.clientWidth || 600);
        const padL = 28, padT = 6, padB = 20;
        const cell = Math.max(8, Math.floor((W - padL) / cols));
        const gap = cell > 14 ? 3 : 2;
        const H = padT + rows.length * cell + padB;
        const max = Math.max(1, ...o.matrix.flat());
        const root = svg('svg', { viewBox: `0 0 ${padL + cell * cols} ${H}`, width: '100%', role: 'img', 'aria-label': 'Теплова карта активності' });
        const g = svg('g', {}, root);
        const tip = tooltip(container);
        o.matrix.forEach((row, r) => {
            const label = svg('text', { x: padL - 6, y: padT + r * cell + cell / 2 + 4, 'text-anchor': 'end', class: 'axis' }, g);
            label.textContent = rows[r];
            row.forEach((v, c) => {
                const intensity = v / max;
                const rect = svg('rect', { x: padL + c * cell + gap / 2, y: padT + r * cell + gap / 2, width: cell - gap, height: cell - gap,
                    rx: Math.min(4, cell / 4), fill: v ? '#ff5500' : '#ffffff', 'fill-opacity': v ? (0.12 + 0.88 * Math.pow(intensity, 0.75)).toFixed(3) : 0.04, class: 'heat-cell' }, g);
                rect.addEventListener('pointerenter', () => {
                    const box = rect.getBoundingClientRect(), cbox = container.getBoundingClientRect();
                    tip.show(box.left - cbox.left + box.width / 2, box.top - cbox.top,
                        `${rows[r]}, ${String(c).padStart(2, '0')}:00–${String(c + 1).padStart(2, '0')}:00`,
                        [{ name: o.valueName || 'Переглядів', color: '#ff5500', value: fmt(v) }]);
                });
                rect.addEventListener('pointerleave', () => tip.hide());
            });
        });
        for (let c = 0; c < cols; c += (cell < 14 ? 3 : 2)) {
            const t = svg('text', { x: padL + c * cell + cell / 2, y: H - 5, 'text-anchor': 'middle', class: 'axis' }, g);
            t.textContent = String(c).padStart(2, '0');
        }
        container.insertBefore(root, container.firstChild);
    }

    /* --------------------------------------------------------------- donut */
    function renderDonut(container, o) {
        container.replaceChildren();
        const items = o.items.filter(i => i.value > 0);
        const total = items.reduce((a, i) => a + i.value, 0);
        const wrap = el('div', 'donut-wrap');
        const size = 150, r = 60, stroke = 20, cx = size / 2, cy = size / 2;
        const root = svg('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img', 'aria-label': o.aria || 'Діаграма' });
        svg('circle', { cx, cy, r, fill: 'none', stroke: 'rgba(255,255,255,0.06)', 'stroke-width': stroke }, root);
        let angle = -Math.PI / 2;
        items.forEach((item, idx) => {
            const frac = item.value / total;
            const a2 = angle + frac * Math.PI * 2 - (items.length > 1 ? 0.03 : 0);
            const large = a2 - angle > Math.PI ? 1 : 0;
            const color = item.color || PALETTE[idx % PALETTE.length];
            if (frac >= 0.9999) svg('circle', { cx, cy, r, fill: 'none', stroke: color, 'stroke-width': stroke }, root);
            else svg('path', { d: `M${cx + r * Math.cos(angle)} ${cy + r * Math.sin(angle)} A${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a2)} ${cy + r * Math.sin(a2)}`,
                fill: 'none', stroke: color, 'stroke-width': stroke, 'stroke-linecap': 'butt' }, root);
            angle += frac * Math.PI * 2;
        });
        const t1 = svg('text', { x: cx, y: cy + 2, 'text-anchor': 'middle', class: 'donut-total' }, root);
        t1.textContent = compact(total);
        const t2 = svg('text', { x: cx, y: cy + 18, 'text-anchor': 'middle', class: 'donut-sub' }, root);
        t2.textContent = o.unit || '';
        const list = el('div', 'donut-legend');
        items.forEach((item, idx) => {
            const row = el('div', 'donut-row');
            const dot = el('i', 'chart-dot'); dot.style.background = item.color || PALETTE[idx % PALETTE.length];
            row.append(dot, el('span', 'donut-name', item.label), el('b', null, Math.round(item.value / total * 1000) / 10 + '%'),
                el('span', 'donut-val', fmt(item.value)));
            list.appendChild(row);
        });
        if (!items.length) list.appendChild(el('p', 'muted', 'Немає даних'));
        wrap.append(root, list);
        container.appendChild(wrap);
    }

    /* ---------------------------------------------------------- horizontal */
    function renderHBars(container, o) {
        container.replaceChildren();
        const max = Math.max(1, ...o.items.map(i => i.value));
        const list = el('div', 'hbars');
        o.items.forEach((item, idx) => {
            const row = el('div', 'hbar');
            const head = el('div', 'hbar-head');
            head.append(el('span', 'hbar-label', item.label), el('span', 'hbar-value', fmt(item.value) + (item.suffix || '')));
            const track = el('div', 'hbar-track');
            const fill = el('div', 'hbar-fill');
            fill.style.width = Math.max(1.5, item.value / max * 100) + '%';
            if (item.color || o.color) fill.style.background = item.color || o.color;
            track.appendChild(fill);
            row.append(head, track);
            if (item.sub) row.appendChild(el('div', 'hbar-sub', item.sub));
            list.appendChild(row);
        });
        if (!o.items.length) list.appendChild(el('p', 'muted', 'Немає даних'));
        container.appendChild(list);
    }

    /* --------------------------------------------------------------- gauge */
    function renderGauge(container, o) {
        container.replaceChildren();
        const pct = Math.max(0, Math.min(100, o.value || 0));
        const W = 180, H = 104, cx = 90, cy = 94, r = 76;
        const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', class: 'gauge', role: 'img', 'aria-label': `${pct}%` });
        const arc = frac => {
            const a = Math.PI * (1 - frac);
            return `${cx + r * Math.cos(a)} ${cy - r * Math.sin(a)}`;
        };
        svg('path', { d: `M${arc(0)} A${r} ${r} 0 0 1 ${arc(1)}`, fill: 'none', stroke: 'rgba(255,255,255,0.08)', 'stroke-width': 14, 'stroke-linecap': 'round' }, root);
        if (pct > 0) svg('path', { d: `M${arc(0)} A${r} ${r} 0 0 1 ${arc(pct / 100)}`, fill: 'none', stroke: 'url(#gg)', 'stroke-width': 14, 'stroke-linecap': 'round' }, root);
        const defs = svg('defs', {}, root);
        const grad = svg('linearGradient', { id: 'gg', x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
        svg('stop', { offset: '0%', 'stop-color': '#ffb020' }, grad);
        svg('stop', { offset: '100%', 'stop-color': '#ff5500' }, grad);
        const t = svg('text', { x: cx, y: cy - 16, 'text-anchor': 'middle', class: 'gauge-value' }, root);
        t.textContent = nf1.format(pct) + '%';
        container.appendChild(root);
    }

    /* ----------------------------------------------------------- sparkline */
    function sparkline(container, values, color = '#ff5500') {
        container.replaceChildren();
        const W = 120, H = 34;
        const max = Math.max(1, ...values);
        const pts = values.map((v, i) => [values.length > 1 ? i * W / (values.length - 1) : W / 2, H - 3 - (H - 6) * (v / max)]);
        const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
        const id = 'sp' + (++uid);
        const defs = svg('defs', {}, root);
        const grad = svg('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
        svg('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': 0.3 }, grad);
        svg('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0 }, grad);
        const d = monotonePath(pts);
        if (pts.length) svg('path', { d: d + `L${W} ${H}L0 ${H}Z`, fill: `url(#${id})` }, root);
        svg('path', { d, fill: 'none', stroke: color, 'stroke-width': 1.8, 'vector-effect': 'non-scaling-stroke' }, root);
        container.appendChild(root);
    }

    window.MyKepCharts = Object.freeze({
        line: (c, o) => prepare(c, o, renderLine),
        bars: (c, o) => prepare(c, o, renderBars),
        heatmap: (c, o) => prepare(c, o, renderHeatmap),
        donut: (c, o) => prepare(c, o, renderDonut),
        hbars: (c, o) => renderHBars(c, o),
        gauge: (c, o) => renderGauge(c, o),
        sparkline, fmt, compact, PALETTE
    });
})();
