// =========================================================
// VYKRESLENÍ SVG TERČE, ŠIPEK PRO STŘEDY A CRICKET TABULKY
// =========================================================
function getSvgPoint(evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
}

function svgDistToCm(x, y) {
    return (Math.hypot(x, y) / BOARD_RADIUS_SVG) * BOARD_RADIUS_CM;
}

function buildDartboard() {
    svg.innerHTML = '';

    const defs = createEl('defs');
    const filter = createEl('filter', { id: 'label-shadow', x: '-20%', y: '-20%', width: '140%', height: '140%' });
    filter.appendChild(createEl('feDropShadow', { dx: 0, dy: 2, stdDeviation: 2.5, 'flood-color': '#000', 'flood-opacity': 0.45 }));
    defs.appendChild(filter);
    svg.appendChild(defs);

    const boardLayer = createEl('g', { id: 'board-layer' });
    const dartsLayer = createEl('g', { id: 'darts-layer' });
    svg.appendChild(boardLayer);
    svg.appendChild(dartsLayer);

    const outerRing = createEl('circle', {
        cx: 0, cy: 0, r: BOARD_RADIUS_SVG,
        fill: '#111317',
        stroke: '#333b46',
        'stroke-width': 3,
        class: 'segment'
    });
    outerRing.addEventListener('mouseenter', () => {
        if (state.phase === 'normal') hoverInfo.textContent = 'Vedle (0)';
    });
    outerRing.addEventListener('mouseleave', () => {
        if (state.phase === 'normal') hoverInfo.textContent = 'Klikni na plošku terče';
    });
    outerRing.addEventListener('click', () => {
        if (state.phase === 'normal') handleThrow(0, '0', false);
    });
    boardLayer.appendChild(outerRing);

    function sectorPath(r1, r2, startDeg, endDeg) {
        const rad = Math.PI / 180;
        const a1 = startDeg * rad;
        const a2 = endDeg * rad;
        const x1 = r1 * Math.cos(a1), y1 = r1 * Math.sin(a1);
        const x2 = r2 * Math.cos(a1), y2 = r2 * Math.sin(a1);
        const x3 = r2 * Math.cos(a2), y3 = r2 * Math.sin(a2);
        const x4 = r1 * Math.cos(a2), y4 = r1 * Math.sin(a2);
        return `M ${x1} ${y1} L ${x2} ${y2} A ${r2} ${r2} 0 0 1 ${x3} ${y3} L ${x4} ${y4} A ${r1} ${r1} 0 0 0 ${x1} ${y1} Z`;
    }

    const rings = [
        { r1: 28,  r2: 95,  mult: 1, prefix: '',  isDouble: false },
        { r1: 95,  r2: 113, mult: 3, prefix: 'T', isDouble: false },
        { r1: 113, r2: 168, mult: 1, prefix: '',  isDouble: false },
        { r1: 168, r2: 186, mult: 2, prefix: 'D', isDouble: true  }
    ];

    BOARD_NUMBERS.forEach((num, i) => {
        const centerDeg = -90 + i * 18;
        const startDeg = centerDeg - 9;
        const endDeg = centerDeg + 9;
        const isEven = i % 2 === 0;

        rings.forEach(ring => {
            const fill = ring.mult === 1
                ? (isEven ? '#16181d' : '#f3e5c0')
                : (isEven ? '#dc2626' : '#16a34a');

            const points = num * ring.mult;
            const label = `${ring.prefix}${num}`;

            const path = createEl('path', {
                d: sectorPath(ring.r1, ring.r2, startDeg, endDeg),
                fill,
                class: 'segment',
                'data-num': num
            });

            path.addEventListener('mouseenter', () => {
                if (state.phase === 'normal') hoverInfo.textContent = `${label} (${points} b.)`;
            });
            path.addEventListener('mouseleave', () => {
                if (state.phase === 'normal') hoverInfo.textContent = 'Klikni na plošku terče';
            });
            path.addEventListener('click', (e) => {
                if (state.phase === 'normal') {
                    e.stopPropagation();
                    handleThrow(points, label, ring.isDouble, false, num, ring.mult);
                }
            });

            boardLayer.appendChild(path);
        });

        const rad = centerDeg * Math.PI / 180;
        const text = createEl('text', {
            x: 211 * Math.cos(rad),
            y: 211 * Math.sin(rad),
            fill: '#f3f4f6',
            'font-size': '19',
            'font-weight': '700',
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            class: 'board-num',
            'data-num': num,
            style: 'pointer-events: none;'
        });
        text.textContent = num;
        boardLayer.appendChild(text);
    });

    const outerBull = createEl('circle', { cx: 0, cy: 0, r: 28, fill: '#16a34a', class: 'segment', 'data-num': 25 });
    outerBull.addEventListener('mouseenter', () => { if (state.phase === 'normal') hoverInfo.textContent = '25 (Vnější střed)'; });
    outerBull.addEventListener('mouseleave', () => { if (state.phase === 'normal') hoverInfo.textContent = 'Klikni na plošku terče'; });
    outerBull.addEventListener('click', (e) => {
        if (state.phase === 'normal') {
            e.stopPropagation();
            handleThrow(25, '25', false, false, 25, 1);
        }
    });
    boardLayer.appendChild(outerBull);

    const innerBull = createEl('circle', { cx: 0, cy: 0, r: 12, fill: '#dc2626', class: 'segment', 'data-num': 25 });
    innerBull.addEventListener('mouseenter', () => { if (state.phase === 'normal') hoverInfo.textContent = 'BULL (50 b.)'; });
    innerBull.addEventListener('mouseleave', () => { if (state.phase === 'normal') hoverInfo.textContent = 'Klikni na plošku terče'; });
    innerBull.addEventListener('click', (e) => {
        if (state.phase === 'normal') {
            e.stopPropagation();
            handleThrow(50, 'BULL', true, false, 25, 2);
        }
    });
    boardLayer.appendChild(innerBull);
}

svg.addEventListener('click', (e) => {
    if (state.winner) return;

    if (state.phase === 'bulls') {
        const pt = getSvgPoint(e);
        handleBullsThrow(pt.x, pt.y);
    } else if (state.phase === 'normal' && e.target === svg) {
        handleThrow(0, '0', false, true); // Kliknutí až za černým okrajem = zeď
    }
});

function renderBullsDarts() {
    const dartsLayer = document.getElementById('darts-layer');
    if (!dartsLayer) return;
    dartsLayer.innerHTML = '';
    if (state.phase !== 'bulls') return;

    function createArrowGraphic(length, strokeColor, strokeWidth, opacity = 1) {
        const g = createEl('g', {
            stroke: strokeColor, 'stroke-width': strokeWidth,
            'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity
        });
        g.appendChild(createEl('line', { x1: 0, y1: 0, x2: length, y2: 0 }));
        [0.70, 0.83, 0.96].forEach(ratio => {
            const bx = length * ratio;
            const tipX = bx + 11;
            g.appendChild(createEl('line', { x1: bx, y1: 0, x2: tipX, y2: -10 }));
            g.appendChild(createEl('line', { x1: bx, y1: 0, x2: tipX, y2: 10 }));
        });
        return g;
    }

    const fallbackAngles = [-135, -45, 45, 135];
    const arrowLen = 82;
    const shadowsGroup = createEl('g');
    const arrowsGroup = createEl('g');
    const labelsGroup = createEl('g');

    state.bullsThrows.forEach((t) => {
        const player = state.players[t.playerIndex];
        const color = player.color;

        const distSvg = Math.hypot(t.x, t.y);
        const dartAngleDeg = distSvg > 12
            ? (Math.atan2(t.y, t.x) * 180) / Math.PI
            : fallbackAngles[t.playerIndex % fallbackAngles.length];

        const shadowG = createEl('g', { transform: `translate(${t.x}, ${t.y}) rotate(22) scale(0.95, 0.65)` });
        shadowG.appendChild(createArrowGraphic(arrowLen, '#000000', 5.5, 0.42));
        shadowsGroup.appendChild(shadowG);

        const arrowG = createEl('g', { transform: `translate(${t.x}, ${t.y}) rotate(${dartAngleDeg})` });
        arrowG.appendChild(createArrowGraphic(arrowLen, '#0f172a', 7.5, 0.75));
        arrowG.appendChild(createArrowGraphic(arrowLen, color, 4.8, 1));
        arrowG.appendChild(createEl('circle', { cx: 0, cy: 0, r: 3.5, fill: '#ffffff', stroke: '#111', 'stroke-width': 1.2 }));
        arrowsGroup.appendChild(arrowG);

        const rad = (dartAngleDeg * Math.PI) / 180;
        let lx = t.x + Math.cos(rad) * (arrowLen * 0.58);
        let ly = t.y + Math.sin(rad) * (arrowLen * 0.58) - 20;

        const labelText = t.isMiss ? 'Mimo' : `${t.distCm.toFixed(1)} cm`;
        const boxW = Math.max(72, labelText.length * 8.5 + 24);
        const boxH = 26;

        lx = Math.max(-265 + boxW / 2, Math.min(265 - boxW / 2, lx));
        ly = Math.max(-265 + boxH / 2, Math.min(265 - boxH / 2, ly));

        const lblG = createEl('g', {
            transform: `translate(${lx - boxW / 2}, ${ly - boxH / 2})`,
            filter: 'url(#label-shadow)'
        });
        lblG.appendChild(createEl('rect', {
            x: 0, y: 0, width: boxW, height: boxH, rx: 6, ry: 6,
            fill: '#ffffff', stroke: color, 'stroke-width': 2.2
        }));
        lblG.appendChild(createEl('circle', { cx: 11, cy: boxH / 2, r: 4.2, fill: color }));

        const txt = createEl('text', {
            x: 20, y: boxH / 2 + 1, fill: '#111827',
            'font-size': '12.5', 'font-weight': '800', 'dominant-baseline': 'central'
        });
        txt.textContent = labelText;
        lblG.appendChild(txt);
        labelsGroup.appendChild(lblG);
    });

    dartsLayer.appendChild(shadowsGroup);
    dartsLayer.appendChild(arrowsGroup);
    dartsLayer.appendChild(labelsGroup);
}

function updateBoardHighlights() {
    const isCricket = state.gameMode === 'cricket';
    const elements = svg.querySelectorAll('[data-num]');

    elements.forEach(el => {
        const num = parseInt(el.getAttribute('data-num'), 10);
        if (!isCricket) {
            el.classList.remove('dimmed');
            return;
        }

        const isTarget = CRICKET_TARGETS.includes(num);
        const isDead = isTarget && state.players.length > 0 && state.players.every(p => p.cricketMarks[num] >= 3);
        el.classList.toggle('dimmed', !isTarget || isDead);
    });
}

function renderCricketBoard() {
    if (state.gameMode !== 'cricket') {
        cricketBoardEl.style.display = 'none';
        return;
    }

    cricketBoardEl.style.display = 'block';
    const markSymbols = ['', '/', 'X', '⊗'];

    const headerCells = state.players.map(p =>
        `<th style="color:${p.color};">${escapeHtml(p.name)}</th>`
    ).join('');

    const rows = CRICKET_TARGETS.map(target => {
        const isDead = state.players.every(p => p.cricketMarks[target] >= 3);
        const label = target === 25 ? 'BULL' : target;
        const cells = state.players.map(p => {
            const m = p.cricketMarks[target];
            return `<td class="cricket-mark${m >= 3 ? ' closed' : ''}">${markSymbols[m]}</td>`;
        }).join('');
        return `<tr class="${isDead ? 'dead-row' : ''}"><td class="cricket-target">${label}</td>${cells}</tr>`;
    }).join('');

    cricketBoardEl.innerHTML = `
    <table class="cricket-table">
      <thead><tr><th>Cíl</th>${headerCells}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}