// Pořadí čísel na terči po směru hodinových ručiček od 12 hodin
const BOARD_NUMBERS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

// Barvy šipek pro jednotlivé hráče
const PLAYER_COLORS = ['#3b82f6', '#22c55e', '#facc15', '#ef4444'];

// Po kolika odehraných kolech se nabídne tlačítko "Středy?"
const ROUND_THRESHOLDS = {
    301: 8,
    501: 12,
    701: 16
};

// Rozměry terče: 45 cm průměr (poloměr 22.5 cm) odpovídá SVG poloměru 235
const BOARD_RADIUS_SVG = 235;
const BOARD_RADIUS_CM = 22.5;

let state = {
    phase: 'normal', // 'normal' | 'bulls'
    startScore: 501,
    doubleOut: false,
    roundNumber: 1,
    bullsPending: false,
    players: [],
    currentPlayerIndex: 0,
    currentTurn: [],
    turnStartScore: 501,
    bullsThrows: [], // [{ playerIndex, x, y, distCm }]
    winner: null,
    statusMessage: null,
    statusType: null
};

let historyStack = [];

const NS = 'http://www.w3.org/2000/svg';
const setupScreen = document.getElementById('setup-screen');
const gameScreen = document.getElementById('game-screen');
const playerCountSelect = document.getElementById('player-count');
const playerNamesDiv = document.getElementById('player-names');
const hoverInfo = document.getElementById('hover-info');
const svg = document.getElementById('dartboard');
const bullsBtn = document.getElementById('bulls-btn');
const missBtn = document.getElementById('miss-btn');
const newGameBtn = document.getElementById('new-game-btn');
const winModal = document.getElementById('win-modal');
const winTitle = document.getElementById('win-title');
const winSubtitle = document.getElementById('win-subtitle');
const minimizeModalBtn = document.getElementById('minimize-modal-btn');
const restoreModalBtn = document.getElementById('restore-modal-btn');

function createEl(tag, attrs = {}) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
}

// Dynamická pole pro jména hráčů s barevnou tečkou
function renderPlayerInputs() {
    const count = parseInt(playerCountSelect.value, 10);
    playerNamesDiv.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const row = document.createElement('div');
        row.className = 'player-input-row';

        const dot = document.createElement('span');
        dot.className = 'color-dot';
        dot.style.background = PLAYER_COLORS[i];

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = `Hráč ${i + 1}`;
        input.value = `Hráč ${i + 1}`;
        input.id = `player-input-${i}`;

        row.appendChild(dot);
        row.appendChild(input);
        playerNamesDiv.appendChild(row);
    }
}

playerCountSelect.addEventListener('change', renderPlayerInputs);
renderPlayerInputs();

// Převod kliknutí myší na přesné SVG souřadnice
function getSvgPoint(evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
}

function svgDistToCm(x, y) {
    return (Math.hypot(x, y) / BOARD_RADIUS_SVG) * BOARD_RADIUS_CM;
}

// Vykreslení klikatelného SVG terče
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

    // Vnější černý kruh (Miss = 0)
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
                class: 'segment'
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
                    handleThrow(points, label, ring.isDouble);
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
            style: 'pointer-events: none;'
        });
        text.textContent = num;
        boardLayer.appendChild(text);
    });

    // Vnější střed (25)
    const outerBull = createEl('circle', {
        cx: 0, cy: 0, r: 28,
        fill: '#16a34a',
        class: 'segment'
    });
    outerBull.addEventListener('mouseenter', () => {
        if (state.phase === 'normal') hoverInfo.textContent = '25 (Vnější střed)';
    });
    outerBull.addEventListener('mouseleave', () => {
        if (state.phase === 'normal') hoverInfo.textContent = 'Klikni na plošku terče';
    });
    outerBull.addEventListener('click', (e) => {
        if (state.phase === 'normal') {
            e.stopPropagation();
            handleThrow(25, '25', false);
        }
    });
    boardLayer.appendChild(outerBull);

    // Bullseye (50)
    const innerBull = createEl('circle', {
        cx: 0, cy: 0, r: 12,
        fill: '#dc2626',
        class: 'segment'
    });
    innerBull.addEventListener('mouseenter', () => {
        if (state.phase === 'normal') hoverInfo.textContent = 'BULL (50 b.)';
    });
    innerBull.addEventListener('mouseleave', () => {
        if (state.phase === 'normal') hoverInfo.textContent = 'Klikni na plošku terče';
    });
    innerBull.addEventListener('click', (e) => {
        if (state.phase === 'normal') {
            e.stopPropagation();
            handleThrow(50, 'BULL', true);
        }
    });
    boardLayer.appendChild(innerBull);
}

// Události na SVG pro režim Středy
svg.addEventListener('mousemove', (e) => {
    if (state.phase !== 'bulls' || state.winner) return;
    const pt = getSvgPoint(e);
    const dist = svgDistToCm(pt.x, pt.y);
    const player = state.players[state.currentPlayerIndex];
    hoverInfo.textContent = `${player.name}: klikni místo zásahu (~${dist.toFixed(1)} cm od středu)`;
});

svg.addEventListener('mouseleave', () => {
    if (state.phase === 'bulls' && !state.winner) {
        const player = state.players[state.currentPlayerIndex];
        hoverInfo.textContent = `Středy – na řadě: ${player.name}`;
    }
});

svg.addEventListener('click', (e) => {
    if (state.phase !== 'bulls' || state.winner) return;
    const pt = getSvgPoint(e);
    handleBullsThrow(pt.x, pt.y);
});

// Vykreslení zapíchnutých šipek se stínem a bílým štítkem vzdálenosti
function renderBullsDarts() {
    const dartsLayer = document.getElementById('darts-layer');
    if (!dartsLayer) return;
    dartsLayer.innerHTML = '';

    if (state.phase !== 'bulls') return;

    function createArrowGraphic(length, strokeColor, strokeWidth, opacity = 1) {
        const g = createEl('g', {
            stroke: strokeColor,
            'stroke-width': strokeWidth,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            opacity
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

        // Stín šipky
        const shadowG = createEl('g', {
            transform: `translate(${t.x}, ${t.y}) rotate(22) scale(0.95, 0.65)`
        });
        shadowG.appendChild(createArrowGraphic(arrowLen, '#000000', 5.5, 0.42));
        shadowsGroup.appendChild(shadowG);

        // Samotná šipka
        const arrowG = createEl('g', {
            transform: `translate(${t.x}, ${t.y}) rotate(${dartAngleDeg})`
        });
        arrowG.appendChild(createArrowGraphic(arrowLen, '#0f172a', 7.5, 0.75));
        arrowG.appendChild(createArrowGraphic(arrowLen, color, 4.8, 1));
        arrowG.appendChild(createEl('circle', { cx: 0, cy: 0, r: 3.5, fill: '#ffffff', stroke: '#111', 'stroke-width': 1.2 }));
        arrowsGroup.appendChild(arrowG);

        // Bílý rámeček se vzdáleností
        const rad = (dartAngleDeg * Math.PI) / 180;
        let lx = t.x + Math.cos(rad) * (arrowLen * 0.58);
        let ly = t.y + Math.sin(rad) * (arrowLen * 0.58) - 20;

        const labelText = `${t.distCm.toFixed(1)} cm`;
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
            fill: '#ffffff',
            stroke: color,
            'stroke-width': 2.2
        }));

        lblG.appendChild(createEl('circle', {
            cx: 11, cy: boxH / 2, r: 4.2, fill: color
        }));

        const txt = createEl('text', {
            x: 20, y: boxH / 2 + 1,
            fill: '#111827',
            'font-size': '12.5',
            'font-weight': '800',
            'dominant-baseline': 'central'
        });
        txt.textContent = labelText;
        lblG.appendChild(txt);

        labelsGroup.appendChild(lblG);
    });

    dartsLayer.appendChild(shadowsGroup);
    dartsLayer.appendChild(arrowsGroup);
    dartsLayer.appendChild(labelsGroup);
}

// Spuštění / zopakování hry
function startGame(startScore, doubleOut, playerNames) {
    const players = playerNames.map((name, i) => ({
        name,
        color: PLAYER_COLORS[i],
        score: startScore,
        dartsThrown: 0,
        lastTurn: []
    }));

    state = {
        phase: 'normal',
        startScore,
        doubleOut,
        roundNumber: 1,
        bullsPending: false,
        players,
        currentPlayerIndex: 0,
        currentTurn: [],
        turnStartScore: startScore,
        bullsThrows: [],
        winner: null,
        statusMessage: null,
        statusType: null
    };
    historyStack = [];

    setupScreen.style.display = 'none';
    gameScreen.style.display = 'flex';
    buildDartboard();
    renderGame();
}

document.getElementById('start-btn').addEventListener('click', () => {
    const startScore = parseInt(document.getElementById('game-mode').value, 10);
    const count = parseInt(playerCountSelect.value, 10);
    const doubleOut = document.getElementById('double-out').checked;

    const names = [];
    for (let i = 0; i < count; i++) {
        names.push(document.getElementById(`player-input-${i}`).value.trim() || `Hráč ${i + 1}`);
    }

    startGame(startScore, doubleOut, names);
});

// Zpracování hodu v normální hře
function handleThrow(points, label, isDouble) {
    if (state.winner || state.phase !== 'normal') return;

    historyStack.push(JSON.parse(JSON.stringify(state)));

    state.statusMessage = null;
    state.statusType = null;

    const player = state.players[state.currentPlayerIndex];
    const newScore = player.score - points;
    player.dartsThrown += 1;

    const isBust =
        newScore < 0 ||
        (state.doubleOut && newScore === 1) ||
        (state.doubleOut && newScore === 0 && !isDouble);

    if (isBust) {
        player.score = state.turnStartScore;
        player.lastTurn = [...state.currentTurn, `${label} (BUST)`];
        state.statusMessage = `💥 ${player.name} přehodil (BUST)! Skóre se vrací na ${state.turnStartScore}.`;
        state.statusType = 'bust';
        nextPlayer();
    } else if (newScore === 0) {
        player.score = 0;
        state.currentTurn.push(label);
        player.lastTurn = [...state.currentTurn];
        state.winner = player.name;
        state.bullsPending = false;
        state.statusMessage = `🏆 ${player.name} vyhrál za ${player.dartsThrown} šipek!`;
        state.statusType = 'win';
    } else {
        player.score = newScore;
        state.currentTurn.push(label);
        if (state.currentTurn.length === 3) {
            player.lastTurn = [...state.currentTurn];
            nextPlayer();
        }
    }

    renderGame();
}

function nextPlayer() {
    const isEndOfRound = state.currentPlayerIndex === state.players.length - 1;

    if (isEndOfRound && state.bullsPending) {
        startBullsPhase();
        return;
    }

    if (isEndOfRound) {
        state.roundNumber += 1;
    }

    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
    state.currentTurn = [];
    state.turnStartScore = state.players[state.currentPlayerIndex].score;
}

function startBullsPhase() {
    state.phase = 'bulls';
    state.bullsPending = false;
    state.currentPlayerIndex = 0;
    state.currentTurn = [];
    state.bullsThrows = [];
    state.statusMessage = '🎯 Rozhodující STŘEDY! Každý hráč hodí 1 šipku co nejblíže středu.';
    state.statusType = 'info';
}

// Zpracování hodu v režimu Středy
function handleBullsThrow(x, y) {
    historyStack.push(JSON.parse(JSON.stringify(state)));

    const distCm = svgDistToCm(x, y);
    state.bullsThrows.push({
        playerIndex: state.currentPlayerIndex,
        x,
        y,
        distCm
    });

    if (state.currentPlayerIndex < state.players.length - 1) {
        state.currentPlayerIndex += 1;
    } else {
        const sorted = [...state.bullsThrows].sort((a, b) => a.distCm - b.distCm);
        const best = sorted[0];
        const winnerPlayer = state.players[best.playerIndex];
        state.winner = winnerPlayer.name;
        state.statusMessage = `🏆 ${winnerPlayer.name} vyhrává Středy (${best.distCm.toFixed(1)} cm od středu)!`;
        state.statusType = 'win';
    }

    renderGame();
}

// Tlačítko "Středy?"
bullsBtn.addEventListener('click', () => {
    if (state.winner || state.phase !== 'normal') return;

    historyStack.push(JSON.parse(JSON.stringify(state)));

    if (state.currentPlayerIndex === 0 && state.currentTurn.length === 0) {
        startBullsPhase();
    } else {
        state.bullsPending = !state.bullsPending;
        if (state.bullsPending) {
            state.statusMessage = '🎯 Po dohrání probíhajícího kola rozhodnou o vítězi Středy!';
            state.statusType = 'info';
        } else {
            state.statusMessage = null;
            state.statusType = null;
        }
    }

    renderGame();
});

// Tlačítka Vedle, Zpět, Nová hra
missBtn.addEventListener('click', () => handleThrow(0, '0', false));

document.getElementById('undo-btn').addEventListener('click', () => {
    if (historyStack.length === 0) return;
    state = historyStack.pop();
    renderGame();
});

function hideModalCompletely() {
    winModal.classList.remove('show', 'minimized');
    restoreModalBtn.classList.remove('show');
}

minimizeModalBtn.addEventListener('click', () => {
    winModal.classList.add('minimized');
    restoreModalBtn.classList.add('show');
});

restoreModalBtn.addEventListener('click', () => {
    winModal.classList.remove('minimized');
    restoreModalBtn.classList.remove('show');
});

document.getElementById('menu-btn').addEventListener('click', () => {
    hideModalCompletely();
    gameScreen.style.display = 'none';
    setupScreen.style.display = 'block';
});

document.getElementById('new-game-btn').addEventListener('click', () => {
    hideModalCompletely();
    gameScreen.style.display = 'none';
    setupScreen.style.display = 'block';
});

function undoLastAction() {
    if (historyStack.length === 0) return;
    state = historyStack.pop();
    renderGame();
}

document.getElementById('undo-btn').addEventListener('click', undoLastAction);
document.getElementById('modal-undo-btn').addEventListener('click', undoLastAction);

document.getElementById('rematch-btn').addEventListener('click', () => {
    const names = state.players.map(p => p.name);
    startGame(state.startScore, state.doubleOut, names);
});
// Překreslení celého rozhraní
function renderGame() {
    const threshold = ROUND_THRESHOLDS[state.startScore] || 12;
    const completedRounds = state.roundNumber - 1;

    document.getElementById('mode-display').innerHTML =
        `Režim: <strong>${state.startScore}</strong> ${state.doubleOut ? '(DO)' : '(SO)'} • Kolo: <strong>${state.roundNumber}</strong>`;

    if (state.phase === 'bulls') {
        svg.classList.add('bulls-mode');
        missBtn.style.display = 'none';
        bullsBtn.style.display = 'none';
        hoverInfo.textContent = state.winner
            ? 'Středy dokončeny!'
            : `Středy – na řadě: ${state.players[state.currentPlayerIndex].name}`;
    } else {
        svg.classList.remove('bulls-mode');
        missBtn.style.display = 'block';
        hoverInfo.textContent = 'Klikni na plošku terče';

        if (completedRounds >= threshold && !state.winner) {
            bullsBtn.style.display = 'block';
            if (state.bullsPending) {
                bullsBtn.classList.add('pending');
                bullsBtn.textContent = '⏳ Středy po tomto kole (klikni pro zrušení)';
            } else {
                bullsBtn.classList.remove('pending');
                bullsBtn.textContent = '🎯 Středy?';
            }
        } else {
            bullsBtn.style.display = 'none';
        }
    }

    const banner = document.getElementById('status-banner');
    if (state.statusMessage) {
        banner.textContent = state.statusMessage;
        banner.className = state.statusType;
    } else {
        banner.className = '';
        banner.textContent = '';
    }

    const activePlayer = state.players[state.currentPlayerIndex];
    const dartSlots = document.getElementById('dart-slots');

    if (state.phase === 'bulls') {
        document.getElementById('turn-label').textContent = state.winner
            ? 'Výsledky rozstřelu na středy'
            : `Středy – na řadě: ${activePlayer.name} (1 šipka)`;
        dartSlots.style.display = 'none';
    } else {
        dartSlots.style.display = 'flex';
        document.getElementById('turn-label').textContent = state.winner
            ? 'Konec hry'
            : `Na řadě: ${activePlayer.name}`;

        for (let i = 0; i < 3; i++) {
            const slot = document.getElementById(`slot-${i}`);
            if (state.currentTurn[i] !== undefined) {
                slot.textContent = state.currentTurn[i];
                slot.classList.add('filled');
            } else {
                slot.textContent = '-';
                slot.classList.remove('filled');
            }
        }
    }

    const grid = document.getElementById('players-grid');
    grid.innerHTML = '';

    state.players.forEach((p, idx) => {
        const isCurrent = idx === state.currentPlayerIndex && !state.winner;
        const bullsThrow = state.bullsThrows.find(t => t.playerIndex === idx);

        const avg = p.dartsThrown > 0
            ? (((state.startScore - p.score) / p.dartsThrown) * 3).toFixed(1)
            : '0.0';

        const rightValue = state.phase === 'bulls'
            ? (bullsThrow ? `${bullsThrow.distCm.toFixed(1)} cm` : '—')
            : p.score;

        const card = document.createElement('div');
        card.className = `player-card${isCurrent ? ' active' : ''}`;
        card.innerHTML = `
      <div>
        <div class="player-name-row">
          <span class="color-dot" style="background: ${p.color};"></span>
          <span class="player-name">${p.name}</span>
        </div>
        <div class="player-meta">
          ${state.phase === 'bulls'
            ? `Skóre ze hry: ${p.score} b.`
            : `Průměr: ${avg} | Šipek: ${p.dartsThrown}${p.lastTurn.length ? `<br>Poslední kolo: ${p.lastTurn.join(', ')}` : ''}`
        }
        </div>
      </div>
      <div class="player-score${state.phase === 'bulls' ? ' dist' : ''}">${rightValue}</div>
    `;
        grid.appendChild(card);
    });

    renderBullsDarts();

    if (state.winner) {
        winTitle.textContent = `${state.winner} vyhrál!`;
        winSubtitle.textContent = (state.statusMessage || '').replace('🏆 ', '');
        minimizeModalBtn.textContent = state.phase === 'bulls'
            ? '🎯 Prohlédnout středy'
            : '👀 Prohlédnout výsledky';
        winModal.classList.add('show');
    } else {
        hideModalCompletely();
    }
}