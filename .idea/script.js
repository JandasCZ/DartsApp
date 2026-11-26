// =========================================================
// KONFIGURACE TERČE A HRY
// =========================================================
const BOARD_NUMBERS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const PLAYER_COLORS = ['#3b82f6', '#22c55e', '#facc15', '#ef4444'];
const ROUND_THRESHOLDS = { 301: 8, 501: 12, 701: 16 };
const BOARD_RADIUS_SVG = 235;
const BOARD_RADIUS_CM = 22.5;

// Klíče pro dvě oddělené tabulky v localStorage
const STORAGE_KEY_PLAYERS = 'darts_db_players';
const STORAGE_KEY_STATS = 'darts_db_stats';

// =========================================================
// DATABÁZOVÁ VRSTVA (2 oddělené tabulky: players & stats)
// =========================================================
let playersTable = []; // [{ id: 'p_1', name: 'Jan' }]
let statsTable = [];   // [{ playerId: 'p_1', wins: 0, t20: 0, t19: 0, misses: 0, bestTurn: 0 }]

// Záloha DB před přičtením konce hry (kvůli tlačítku "Omyl, vrátit poslední hod")
let preWinDbSnapshot = null;

function loadDatabase() {
    try {
        playersTable = JSON.parse(localStorage.getItem(STORAGE_KEY_PLAYERS)) || [];
        statsTable = JSON.parse(localStorage.getItem(STORAGE_KEY_STATS)) || [];
    } catch {
        playersTable = [];
        statsTable = [];
    }
}

function saveDatabase() {
    localStorage.setItem(STORAGE_KEY_PLAYERS, JSON.stringify(playersTable));
    localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(statsTable));
}

function getOrCreatePlayer(rawName) {
    const cleanName = rawName.trim();
    const existing = playersTable.find(p => p.name.toLowerCase() === cleanName.toLowerCase());
    if (existing) {
        ensureStatsRow(existing.id);
        return existing;
    }

    const newPlayer = {
        id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: cleanName
    };
    playersTable.push(newPlayer);
    ensureStatsRow(newPlayer.id);
    saveDatabase();
    return newPlayer;
}

function ensureStatsRow(playerId) {
    let row = statsTable.find(s => s.playerId === playerId);
    if (!row) {
        row = { playerId, wins: 0, t20: 0, t19: 0, misses: 0, bestTurn: 0 };
        statsTable.push(row);
    }
    return row;
}

// Uloží statistiky ze skončené hry do tabulky stats
function commitMatchToDb(winnerPlayerId) {
    preWinDbSnapshot = {
        players: JSON.parse(JSON.stringify(playersTable)),
        stats: JSON.parse(JSON.stringify(statsTable))
    };

    state.players.forEach(p => {
        const row = ensureStatsRow(p.id);
        row.t20 += p.matchStats.t20;
        row.t19 += p.matchStats.t19;
        row.misses += p.matchStats.misses;
        if (p.matchStats.bestTurn > row.bestTurn) {
            row.bestTurn = p.matchStats.bestTurn;
        }
        if (p.id === winnerPlayerId) {
            row.wins += 1;
        }
    });

    saveDatabase();
}

function rollbackLastDbCommit() {
    if (!preWinDbSnapshot) return;
    playersTable = preWinDbSnapshot.players;
    statsTable = preWinDbSnapshot.stats;
    preWinDbSnapshot = null;
    saveDatabase();
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
}

// =========================================================
// STAV HRY A DOM PRVKY
// =========================================================
let state = {
    phase: 'normal',
    startScore: 501,
    doubleOut: false,
    roundNumber: 1,
    bullsPending: false,
    players: [],
    currentPlayerIndex: 0,
    currentTurn: [],
    currentTurnPoints: 0,
    turnStartScore: 501,
    bullsThrows: [],
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
const setupError = document.getElementById('setup-error');
const hoverInfo = document.getElementById('hover-info');
const svg = document.getElementById('dartboard');
const bullsBtn = document.getElementById('bulls-btn');
const missBtn = document.getElementById('miss-btn');
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

// =========================================================
// MENU: VÝBĚR HRÁČŮ (COMBOBOX) + LEADERBOARD
// =========================================================
function renderPlayerInputs() {
    const count = parseInt(playerCountSelect.value, 10);

    // Zapamatovat si aktuálně zvolené hodnoty při změně počtu hráčů
    const prevValues = [];
    for (let i = 0; i < 4; i++) {
        const sel = document.getElementById(`player-select-${i}`);
        const inp = document.getElementById(`player-input-${i}`);
        if (sel) prevValues.push({ select: sel.value, input: inp ? inp.value : '' });
    }

    playerNamesDiv.innerHTML = '';

    for (let i = 0; i < count; i++) {
        const row = document.createElement('div');
        row.className = 'player-input-row';

        const dot = document.createElement('span');
        dot.className = 'color-dot';
        dot.style.background = PLAYER_COLORS[i];

        const combo = document.createElement('div');
        combo.className = 'player-combo';

        const select = document.createElement('select');
        select.id = `player-select-${i}`;

        const newOpt = document.createElement('option');
        newOpt.value = '__new__';
        newOpt.textContent = '➕ Nový hráč...';
        select.appendChild(newOpt);

        playersTable.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            select.appendChild(opt);
        });

        const input = document.createElement('input');
        input.type = 'text';
        input.id = `player-input-${i}`;
        input.placeholder = `Jméno hráče ${i + 1}`;

        // Obnovení předchozí volby, nebo předvybrání existujícího hráče z DB
        if (prevValues[i]) {
            const validExisting = playersTable.some(p => p.id === prevValues[i].select);
            select.value = validExisting ? prevValues[i].select : '__new__';
            input.value = prevValues[i].input;
        } else if (playersTable[i]) {
            select.value = playersTable[i].id;
        } else {
            select.value = '__new__';
            input.value = `Hráč ${i + 1}`;
        }

        const syncVisibility = () => {
            input.style.display = select.value === '__new__' ? 'block' : 'none';
        };
        select.addEventListener('change', () => {
            syncVisibility();
            if (select.value === '__new__') input.focus();
        });
        syncVisibility();

        combo.appendChild(select);
        combo.appendChild(input);
        row.appendChild(dot);
        row.appendChild(combo);
        playerNamesDiv.appendChild(row);
    }
}

function renderLeaderboard() {
    // Spojení tabulek players + stats přes playerId (JOIN)
    const joined = playersTable.map(p => {
        const s = statsTable.find(row => row.playerId === p.id) || {
            wins: 0, t20: 0, t19: 0, misses: 0, bestTurn: 0
        };
        return {
            id: p.id,
            name: p.name,
            wins: s.wins || 0,
            t20: s.t20 || 0,
            t19: s.t19 || 0,
            t20t19: (s.t20 || 0) + (s.t19 || 0),
            misses: s.misses || 0,
            bestTurn: s.bestTurn || 0
        };
    });

    // 1) Pedestály – Nejvíc výher (pořadí zleva: 2., 1., 3.)
    const byWins = [...joined].sort((a, b) => b.wins - a.wins || b.bestTurn - a.bestTurn);
    const podiumOrder = [
        { rank: 2, medal: '🥈', data: byWins[1] },
        { rank: 1, medal: '🥇', data: byWins[0] },
        { rank: 3, medal: '🥉', data: byWins[2] }
    ];

    const podiumEl = document.getElementById('wins-podium');
    podiumEl.innerHTML = podiumOrder.map(slot => {
        const hasPlayer = Boolean(slot.data);
        const name = hasPlayer ? escapeHtml(slot.data.name) : '—';
        const winsText = hasPlayer ? `${slot.data.wins}× výhra` : '0×';
        return `
      <div class="podium-slot place-${slot.rank}">
        <div class="podium-trophy">${slot.medal}</div>
        <div class="podium-name" title="${name}">${name}</div>
        <div class="podium-block">
          <div class="podium-rank">${slot.rank}.</div>
          <div class="podium-wins">${winsText}</div>
        </div>
      </div>
    `;
    }).join('');

    // 2) Karty rekordů
    const topTriples = [...joined].sort((a, b) => b.t20t19 - a.t20t19)[0];
    const topMisses = [...joined].sort((a, b) => b.misses - a.misses)[0];
    const topTurn = [...joined].sort((a, b) => b.bestTurn - a.bestTurn)[0];

    const recordsEl = document.getElementById('records-grid');
    recordsEl.innerHTML = `
    <div class="record-card">
      <div class="record-title">🎯 Nejvíc T20 / T19</div>
      <div class="record-player">${topTriples && topTriples.t20t19 > 0 ? escapeHtml(topTriples.name) : '—'}</div>
      <div class="record-value">${topTriples && topTriples.t20t19 > 0 ? `${topTriples.t20t19}×` : '0×'}</div>
      <div class="record-sub">${topTriples && topTriples.t20t19 > 0 ? `${topTriples.t20}× T20 • ${topTriples.t19}× T19` : 'Zatím nic'}</div>
    </div>
    <div class="record-card">
      <div class="record-title">🧱 Nejvíc zdí (vedle)</div>
      <div class="record-player">${topMisses && topMisses.misses > 0 ? escapeHtml(topMisses.name) : '—'}</div>
      <div class="record-value">${topMisses && topMisses.misses > 0 ? `${topMisses.misses}×` : '0×'}</div>
      <div class="record-sub">Hodů za 0 bodů</div>
    </div>
    <div class="record-card">
      <div class="record-title">🔥 Nejlepší 1 kolo</div>
      <div class="record-player">${topTurn && topTurn.bestTurn > 0 ? escapeHtml(topTurn.name) : '—'}</div>
      <div class="record-value">${topTurn && topTurn.bestTurn > 0 ? `${topTurn.bestTurn} b.` : '0 b.'}</div>
      <div class="record-sub">Max bodů za 3 šipky</div>
    </div>
  `;

    // 3) Tabulka všech hráčů
    const tbody = document.getElementById('lb-table-body');
    if (byWins.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="lb-empty">Zatím nejsou uloženi žádní hráči. Odehraj první hru!</td></tr>';
    } else {
        tbody.innerHTML = byWins.map(p => `
      <tr>
        <td><strong>${escapeHtml(p.name)}</strong></td>
        <td>${p.wins}</td>
        <td>${p.t20t19} <span style="color:var(--muted);font-size:0.76rem;">(${p.t20}/${p.t19})</span></td>
        <td>${p.misses}</td>
        <td>${p.bestTurn}</td>
      </tr>
    `).join('');
    }
}

// Export / Import JSON databáze
document.getElementById('export-db-btn').addEventListener('click', () => {
    const payload = {
        players: playersTable,
        stats: statsTable
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sipky-databaze.json';
    a.click();
    URL.revokeObjectURL(url);
});

const importFileInput = document.getElementById('import-db-file');
document.getElementById('import-db-btn').addEventListener('click', () => importFileInput.click());

importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const parsed = JSON.parse(reader.result);
            if (!Array.isArray(parsed.players) || !Array.isArray(parsed.stats)) {
                alert('Neplatný formát JSON souboru (chybí pole "players" nebo "stats").');
                return;
            }
            playersTable = parsed.players;
            statsTable = parsed.stats;
            saveDatabase();
            renderPlayerInputs();
            renderLeaderboard();
        } catch {
            alert('Nepodařilo se načíst JSON soubor.');
        }
        importFileInput.value = '';
    };
    reader.readAsText(file);
});

playerCountSelect.addEventListener('change', renderPlayerInputs);

// =========================================================
// VYKRESLENÍ SVG TERČE A ŠIPEK PRO STŘEDY
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

    const outerBull = createEl('circle', { cx: 0, cy: 0, r: 28, fill: '#16a34a', class: 'segment' });
    outerBull.addEventListener('mouseenter', () => { if (state.phase === 'normal') hoverInfo.textContent = '25 (Vnější střed)'; });
    outerBull.addEventListener('mouseleave', () => { if (state.phase === 'normal') hoverInfo.textContent = 'Klikni na plošku terče'; });
    outerBull.addEventListener('click', (e) => {
        if (state.phase === 'normal') { e.stopPropagation(); handleThrow(25, '25', false); }
    });
    boardLayer.appendChild(outerBull);

    const innerBull = createEl('circle', { cx: 0, cy: 0, r: 12, fill: '#dc2626', class: 'segment' });
    innerBull.addEventListener('mouseenter', () => { if (state.phase === 'normal') hoverInfo.textContent = 'BULL (50 b.)'; });
    innerBull.addEventListener('mouseleave', () => { if (state.phase === 'normal') hoverInfo.textContent = 'Klikni na plošku terče'; });
    innerBull.addEventListener('click', (e) => {
        if (state.phase === 'normal') { e.stopPropagation(); handleThrow(50, 'BULL', true); }
    });
    boardLayer.appendChild(innerBull);
}

svg.addEventListener('mousemove', (e) => {
    if (state.phase !== 'bulls' || state.winner) return;
    const pt = getSvgPoint(e);
    const dist = svgDistToCm(pt.x, pt.y);
    const player = state.players[state.currentPlayerIndex];
    hoverInfo.textContent = `${player.name}: klikni místo zásahu (~${dist.toFixed(1)} cm od středu)`;
});

svg.addEventListener('mouseleave', () => {
    if (state.phase === 'bulls' && !state.winner) {
        hoverInfo.textContent = `Středy – na řadě: ${state.players[state.currentPlayerIndex].name}`;
    }
});

svg.addEventListener('click', (e) => {
    if (state.phase !== 'bulls' || state.winner) return;
    const pt = getSvgPoint(e);
    handleBullsThrow(pt.x, pt.y);
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

// =========================================================
// LOGIKA HRY
// =========================================================
function startGame(startScore, doubleOut, selectedPlayers) {
    preWinDbSnapshot = null;

    const players = selectedPlayers.map((p, i) => ({
        id: p.id,
        name: p.name,
        color: PLAYER_COLORS[i],
        score: startScore,
        dartsThrown: 0,
        lastTurn: [],
        matchStats: { t20: 0, t19: 0, misses: 0, bestTurn: 0 }
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
        currentTurnPoints: 0,
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
    setupError.textContent = '';
    const startScore = parseInt(document.getElementById('game-mode').value, 10);
    const count = parseInt(playerCountSelect.value, 10);
    const doubleOut = document.getElementById('double-out').checked;

    const chosenPlayers = [];
    const usedIds = new Set();

    for (let i = 0; i < count; i++) {
        const sel = document.getElementById(`player-select-${i}`);
        const inp = document.getElementById(`player-input-${i}`);
        let playerObj;

        if (sel.value === '__new__') {
            const name = inp.value.trim() || `Hráč ${i + 1}`;
            playerObj = getOrCreatePlayer(name);
        } else {
            playerObj = playersTable.find(p => p.id === sel.value);
            if (!playerObj) playerObj = getOrCreatePlayer(`Hráč ${i + 1}`);
        }

        if (usedIds.has(playerObj.id)) {
            setupError.textContent = `Hráč "${playerObj.name}" je vybrán vícekrát. Zvol prosím různé hráče.`;
            return;
        }
        usedIds.add(playerObj.id);
        chosenPlayers.push(playerObj);
    }

    startGame(startScore, doubleOut, chosenPlayers);
});

function handleThrow(points, label, isDouble) {
    if (state.winner || state.phase !== 'normal') return;

    historyStack.push(JSON.parse(JSON.stringify(state)));
    state.statusMessage = null;
    state.statusType = null;

    const player = state.players[state.currentPlayerIndex];
    const newScore = player.score - points;
    player.dartsThrown += 1;

    // Průběžné statistiky hodu
    if (label === 'T20') player.matchStats.t20 += 1;
    if (label === 'T19') player.matchStats.t19 += 1;
    if (points === 0) player.matchStats.misses += 1;

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
        state.currentTurnPoints += points;
        if (state.currentTurnPoints > player.matchStats.bestTurn) {
            player.matchStats.bestTurn = state.currentTurnPoints;
        }
        player.lastTurn = [...state.currentTurn];
        state.winner = player.name;
        state.bullsPending = false;
        state.statusMessage = `🏆 ${player.name} vyhrál za ${player.dartsThrown} šipek!`;
        state.statusType = 'win';
        commitMatchToDb(player.id);
    } else {
        player.score = newScore;
        state.currentTurn.push(label);
        state.currentTurnPoints += points;
        if (state.currentTurn.length === 3) {
            if (state.currentTurnPoints > player.matchStats.bestTurn) {
                player.matchStats.bestTurn = state.currentTurnPoints;
            }
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
    state.currentTurnPoints = 0;
    state.turnStartScore = state.players[state.currentPlayerIndex].score;
}

function startBullsPhase() {
    state.phase = 'bulls';
    state.bullsPending = false;
    state.currentPlayerIndex = 0;
    state.currentTurn = [];
    state.currentTurnPoints = 0;
    state.bullsThrows = [];
    state.statusMessage = '🎯 Rozhodující STŘEDY! Každý hráč hodí 1 šipku co nejblíže středu.';
    state.statusType = 'info';
}

function handleBullsThrow(x, y) {
    historyStack.push(JSON.parse(JSON.stringify(state)));

    const distCm = svgDistToCm(x, y);
    state.bullsThrows.push({
        playerIndex: state.currentPlayerIndex,
        x, y, distCm
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
        commitMatchToDb(winnerPlayer.id);
    }

    renderGame();
}

// =========================================================
// OVLÁDACÍ TLAČÍTKA A MODAL
// =========================================================
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

missBtn.addEventListener('click', () => handleThrow(0, '0', false));

function undoLastAction() {
    if (historyStack.length === 0) return;
    if (state.winner) {
        rollbackLastDbCommit();
    }
    state = historyStack.pop();
    renderGame();
}

document.getElementById('undo-btn').addEventListener('click', undoLastAction);
document.getElementById('modal-undo-btn').addEventListener('click', undoLastAction);

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

document.getElementById('rematch-btn').addEventListener('click', () => {
    hideModalCompletely();
    const samePlayers = state.players.map(p => ({ id: p.id, name: p.name }));
    startGame(state.startScore, state.doubleOut, samePlayers);
});

function returnToMenu() {
    hideModalCompletely();
    gameScreen.style.display = 'none';
    setupScreen.style.display = 'flex';
    renderPlayerInputs();
    renderLeaderboard();
}

document.getElementById('menu-btn').addEventListener('click', returnToMenu);
document.getElementById('new-game-btn').addEventListener('click', returnToMenu);

// =========================================================
// PŘEKRESLENÍ HERNÍ OBRAZOVKY
// =========================================================
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
          <span class="player-name">${escapeHtml(p.name)}</span>
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

// =========================================================
// INICIALIZACE PO NAČTENÍ STRÁNKY
// =========================================================
loadDatabase();
renderPlayerInputs();
renderLeaderboard();