// =========================================================
// LOGIKA HRY
// =========================================================
function startGame(gameMode, doubleOut, selectedPlayers) {
    preWinDbSnapshot = null;
    const isCricket = gameMode === 'cricket';
    const startScore = isCricket ? 0 : parseInt(gameMode, 10);

    const players = selectedPlayers.map((p, i) => ({
        id: p.id,
        name: p.name,
        color: PLAYER_COLORS[i],
        score: startScore,
        dartsThrown: 0,
        lastTurn: [],
        finishedRank: null,
        cricketMarks: { 20: 0, 19: 0, 18: 0, 17: 0, 16: 0, 15: 0, 25: 0 },
        matchStats: { t20: 0, t19: 0, misses: 0, bestTurn: 0, scoringPoints: 0, scoringDarts: 0, cricketMarksHit: 0 }
    }));

    state = {
        gameMode: isCricket ? 'cricket' : startScore,
        phase: 'normal',
        startScore,
        doubleOut: isCricket ? false : doubleOut,
        roundNumber: 1,
        bullsPending: false,
        players,
        finishedOrder: [],
        currentPlayerIndex: 0,
        currentTurn: [],
        currentTurnPoints: 0,
        turnScoringPoints: 0,
        turnScoringDarts: 0,
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
    const rawMode = document.getElementById('game-mode').value;
    const gameMode = rawMode === 'cricket' ? 'cricket' : parseInt(rawMode, 10);
    const count = parseInt(playerCountSelect.value, 10);
    const doubleOut = document.getElementById('double-out').checked;

    const pendingPlayers = [];
    const usedKeys = new Set();

    for (let i = 0; i < count; i++) {
        const sel = document.getElementById(`player-select-${i}`);
        const inp = document.getElementById(`player-input-${i}`);

        let name;
        let existing = null;

        if (sel.value === '__new__') {
            name = inp.value.trim() || `Hráč ${i + 1}`;
            existing = playersTable.find(p => p.name.toLowerCase() === name.toLowerCase()) || null;
        } else {
            existing = playersTable.find(p => p.id === sel.value) || null;
            name = existing ? existing.name : `Hráč ${i + 1}`;
        }

        const key = existing ? existing.id : `new:${name.toLowerCase()}`;
        if (usedKeys.has(key)) {
            setupError.textContent = `Hráč "${name}" je vybrán vícekrát. Zvol prosím různé hráče.`;
            return;
        }

        usedKeys.add(key);
        pendingPlayers.push({ existing, name });
    }

    const chosenPlayers = pendingPlayers.map(item => item.existing || getOrCreatePlayer(item.name));
    startGame(gameMode, doubleOut, chosenPlayers);
});

function handleThrow(points, label, isDouble, isWall = false, hitNum = 0, mult = 1) {
    if (state.winner || state.phase !== 'normal') return;

    historyStack.push(JSON.parse(JSON.stringify(state)));
    state.statusMessage = null;
    state.statusType = null;

    const player = state.players[state.currentPlayerIndex];
    player.dartsThrown += 1;

    if (label === 'T20') player.matchStats.t20 += 1;
    if (label === 'T19') player.matchStats.t19 += 1;
    if (isWall) player.matchStats.misses += 1;

    // === LOGIKA PRO CRICKET ===
    if (state.gameMode === 'cricket') {
        let earnedPoints = 0;

        if (CRICKET_TARGETS.includes(hitNum)) {
            const currentMarks = player.cricketMarks[hitNum];
            const newMarks = Math.min(3, currentMarks + mult);
            const overflow = (currentMarks + mult) - 3;
            const closingMarks = newMarks - currentMarks;
            player.cricketMarks[hitNum] = newMarks;

            const someoneStillOpen = state.players.some(
                (other, idx) => idx !== state.currentPlayerIndex && other.cricketMarks[hitNum] < 3
            );

            // Platné značky pro MPR (zavírání + bodování otevřeného čísla)
            const scoringMarks = (overflow > 0 && someoneStillOpen) ? overflow : 0;
            player.matchStats.cricketMarksHit += closingMarks + scoringMarks;

            if (scoringMarks > 0) {
                earnedPoints = scoringMarks * hitNum;
                player.score += earnedPoints;
            }
        }

        state.currentTurn.push(label);
        state.currentTurnPoints += earnedPoints;

        const allClosed = CRICKET_TARGETS.every(t => player.cricketMarks[t] >= 3);
        const hasTopScore = state.players.every(other => player.score >= other.score);

        if (allClosed && hasTopScore) {
            if (state.currentTurnPoints > player.matchStats.bestTurn) {
                player.matchStats.bestTurn = state.currentTurnPoints;
            }
            player.lastTurn = [...state.currentTurn];
            state.winner = player.name;
            state.statusMessage = `🏆 ${player.name} vyhrál Cricket (${player.score} b., ${player.dartsThrown} šipek)!`;
            state.statusType = 'win';
            commitMatchToDb(player.id);
        } else if (state.currentTurn.length === 3) {
            if (state.currentTurnPoints > player.matchStats.bestTurn) {
                player.matchStats.bestTurn = state.currentTurnPoints;
            }
            player.lastTurn = [...state.currentTurn];
            nextPlayer();
        }

        renderGame();
        return;
    }

    // === LOGIKA PRO 301 / 501 / 701 ===
    const scoreBeforeThrow = player.score;
    const newScore = player.score - points;

    if (scoreBeforeThrow >= 40) {
        state.turnScoringDarts += 1;
        state.turnScoringPoints += points;
    }

    const isBust =
        newScore < 0 ||
        (state.doubleOut && newScore === 1) ||
        (state.doubleOut && newScore === 0 && !isDouble);

    if (isBust) {
        player.score = state.turnStartScore;
        player.matchStats.scoringDarts += state.turnScoringDarts;
        player.lastTurn = [...state.currentTurn, `${label} (BUST)`];
        state.statusMessage = `💥 ${player.name} přehodil (BUST)! Skóre se vrací na ${state.turnStartScore}.`;
        state.statusType = 'bust';
        nextPlayer();
    } else if (newScore === 0) {
        player.score = 0;
        state.currentTurn.push(label);
        state.currentTurnPoints += points;
        player.matchStats.scoringDarts += state.turnScoringDarts;
        player.matchStats.scoringPoints += state.turnScoringPoints;
        if (state.currentTurnPoints > player.matchStats.bestTurn) {
            player.matchStats.bestTurn = state.currentTurnPoints;
        }
        player.lastTurn = [...state.currentTurn];

        player.finishedRank = state.finishedOrder.length + 1;
        state.finishedOrder.push(player.id);
        state.bullsPending = false;

        const remainingPlayers = state.players.filter(p => p.finishedRank === null);

        if (remainingPlayers.length <= 1) {
            const firstPlace = state.players.find(p => p.id === state.finishedOrder[0]);
            state.winner = firstPlace.name;
            state.statusMessage = `🏆 ${firstPlace.name} vyhrál za ${firstPlace.dartsThrown} šipek!`;
            state.statusType = 'win';
            commitMatchToDb(firstPlace.id);
        } else {
            const medals = ['🥇', '🥈', '🥉'];
            const medal = medals[player.finishedRank - 1] || '🏅';
            state.statusMessage = `${medal} ${player.name} zavřel na ${player.finishedRank}. místě (${player.dartsThrown} šipek)! Hra pokračuje.`;
            state.statusType = 'info';
            nextPlayer();
        }
    } else {
        player.score = newScore;
        state.currentTurn.push(label);
        state.currentTurnPoints += points;
        if (state.currentTurn.length === 3) {
            player.matchStats.scoringDarts += state.turnScoringDarts;
            player.matchStats.scoringPoints += state.turnScoringPoints;
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
    const total = state.players.length;
    let nextIdx = state.currentPlayerIndex;

    for (let step = 1; step <= total; step++) {
        const candidate = (state.currentPlayerIndex + step) % total;
        if (state.players[candidate].finishedRank === null) {
            nextIdx = candidate;
            break;
        }
    }

    const isEndOfRound = nextIdx <= state.currentPlayerIndex;

    if (isEndOfRound && state.bullsPending && state.finishedOrder.length === 0) {
        startBullsPhase();
        return;
    }

    if (isEndOfRound) {
        state.roundNumber += 1;
    }

    state.currentPlayerIndex = nextIdx;
    state.currentTurn = [];
    state.currentTurnPoints = 0;
    state.turnScoringPoints = 0;
    state.turnScoringDarts = 0;
    state.turnStartScore = state.players[state.currentPlayerIndex].score;
}

function startBullsPhase() {
    state.phase = 'bulls';
    state.bullsPending = false;
    state.currentPlayerIndex = 0;
    state.currentTurn = [];
    state.currentTurnPoints = 0;
    state.turnScoringPoints = 0;
    state.turnScoringDarts = 0;
    state.bullsThrows = [];
    state.statusMessage = '🎯 Rozhodující STŘEDY! Každý hráč hodí 1 šipku co nejblíže středu.';
    state.statusType = 'info';
}

function handleBullsThrow(x, y) {
    historyStack.push(JSON.parse(JSON.stringify(state)));

    const distSvg = Math.hypot(x, y);
    const distCm = svgDistToCm(x, y);
    const isMiss = distSvg > SCORING_RADIUS_SVG;
    const isWall = distSvg > BOARD_RADIUS_SVG;

    if (isWall) {
        state.players[state.currentPlayerIndex].matchStats.misses += 1;
    }

    state.bullsThrows.push({
        playerIndex: state.currentPlayerIndex,
        x, y, distCm, isMiss
    });

    if (state.currentPlayerIndex < state.players.length - 1) {
        state.currentPlayerIndex += 1;
    } else {
        const sorted = [...state.bullsThrows].sort((a, b) => a.distCm - b.distCm);
        const best = sorted[0];
        const winnerPlayer = state.players[best.playerIndex];
        state.winner = winnerPlayer.name;
        state.statusMessage = best.isMiss
            ? `🏆 ${winnerPlayer.name} vyhrává Středy (všichni mimo, nejblíže středu)!`
            : `🏆 ${winnerPlayer.name} vyhrává Středy (${best.distCm.toFixed(1)} cm od středu)!`;
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

endGameBtn.addEventListener('click', () => {
    if (state.winner || state.finishedOrder.length === 0) return;

    historyStack.push(JSON.parse(JSON.stringify(state)));
    const firstPlace = state.players.find(p => p.id === state.finishedOrder[0]);
    state.winner = firstPlace.name;
    state.statusMessage = `🏆 ${firstPlace.name} vyhrál za ${firstPlace.dartsThrown} šipek!`;
    state.statusType = 'win';
    commitMatchToDb(firstPlace.id);
    renderGame();
});

missBtn.addEventListener('click', () => handleThrow(0, 'Zeď', false, true));

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
    startGame(state.gameMode, state.doubleOut, samePlayers);
});

function returnToMenu() {
    hideModalCompletely();
    gameScreen.style.display = 'none';
    setupScreen.style.display = 'flex';
    renderPlayerInputs();
    renderLeaderboard();
}

function getCheckoutSuggestion(score, dartsLeft, doubleOut) {
    if (score <= 0 || dartsLeft <= 0) return null;
    if (doubleOut && (score > 170 || score === 1)) return null;
    if (!doubleOut && score > 180) return null;

    // Preferované zavírací hody (u Double Out jen doubly + Bull)
    const finishDarts = [];
    if (doubleOut) {
        const preferredDoubles = [20, 16, 8, 10, 12, 4, 18, 14, 6, 2, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1];
        preferredDoubles.forEach(n => finishDarts.push({ label: `D${n}`, val: n * 2 }));
        finishDarts.push({ label: 'BULL', val: 50 });
    } else {
        for (let n = 20; n >= 1; n--) finishDarts.push({ label: `${n}`, val: n });
        finishDarts.push({ label: '25', val: 25 }, { label: 'BULL', val: 50 });
        for (let n = 20; n >= 1; n--) finishDarts.push({ label: `D${n}`, val: n * 2 });
        for (let n = 20; n >= 1; n--) finishDarts.push({ label: `T${n}`, val: n * 3 });
    }

    // Mapa pro rychlé dohledání posledního hodu
    const finishMap = new Map();
    finishDarts.forEach(d => {
        if (!finishMap.has(d.val)) finishMap.set(d.val, d.label);
    });

    // Přípravné hody (nejdřív singly pro čisté 2-šipkové zavření, pak triply a středy)
    const setupDarts = [];
    for (let n = 20; n >= 1; n--) setupDarts.push({ label: `${n}`, val: n });
    for (let n = 20; n >= 1; n--) setupDarts.push({ label: `T${n}`, val: n * 3 });
    setupDarts.push({ label: 'BULL', val: 50 }, { label: '25', val: 25 });
    for (let n = 20; n >= 1; n--) setupDarts.push({ label: `D${n}`, val: n * 2 });

    // 1 šipka
    if (finishMap.has(score)) {
        return [finishMap.get(score)];
    }
    if (dartsLeft < 2) return null;

    // 2 šipky
    for (const d1 of setupDarts) {
        const rem = score - d1.val;
        if (rem > 0 && finishMap.has(rem)) {
            return [d1.label, finishMap.get(rem)];
        }
    }
    if (dartsLeft < 3) return null;

    // 3 šipky
    for (const d1 of setupDarts) {
        if (d1.val >= score) continue;
        for (const d2 of setupDarts) {
            const rem = score - d1.val - d2.val;
            if (rem > 0 && finishMap.has(rem)) {
                return [d1.label, d2.label, finishMap.get(rem)];
            }
        }
    }

    return null;
}

document.getElementById('menu-btn').addEventListener('click', returnToMenu);
document.getElementById('new-game-btn').addEventListener('click', returnToMenu);

// =========================================================
// PŘEKRESLENÍ HERNÍ OBRAZOVKY
// =========================================================
function renderGame() {
    const threshold = ROUND_THRESHOLDS[state.startScore] || 12;
    const completedRounds = state.roundNumber - 1;

    const modeLabel = state.gameMode === 'cricket'
        ? 'Cricket'
        : `${state.startScore} ${state.doubleOut ? '(DO)' : '(SO)'}`;
    document.getElementById('mode-display').innerHTML =
        `Režim: <strong>${modeLabel}</strong> • Kolo: <strong>${state.roundNumber}</strong>`;

    if (state.phase === 'bulls') {
        svg.classList.add('bulls-mode');
        missBtn.style.display = 'none';
        bullsBtn.style.display = 'none';
        endGameBtn.style.display = 'none';
        hoverInfo.textContent = state.winner
            ? 'Středy dokončeny!'
            : `Středy – na řadě: ${state.players[state.currentPlayerIndex].name}`;
    } else {
        svg.classList.remove('bulls-mode');
        missBtn.style.display = 'block';
        hoverInfo.textContent = 'Klikni na plošku terče';

        endGameBtn.style.display = (state.finishedOrder.length > 0 && !state.winner) ? 'block' : 'none';
        if (state.gameMode !== 'cricket' && completedRounds >= threshold && !state.winner && state.finishedOrder.length === 0) {
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
        const dartsLeft = isCurrent
            ? 3 - (state.currentTurn ? state.currentTurn.length : 0)
            : 3;
        const checkout = (!state.winner && state.phase === 'normal' && state.gameMode !== 'cricket')
            ? getCheckoutSuggestion(p.score, dartsLeft, state.doubleOut)
            : null;

        const checkoutHtml = checkout
            ? `<span class="checkout-hints">${checkout.map((d, i) =>
                `<span class="checkout-badge${i === checkout.length - 1 ? ' finish' : ''}">${d}</span>`
            ).join('')}</span>`
            : '';

        const bullsThrow = state.bullsThrows.find(t => t.playerIndex === idx);
        const avg = p.dartsThrown > 0
            ? (((state.startScore - p.score) / p.dartsThrown) * 3).toFixed(1)
            : '0.0';
        const cricketEff = p.dartsThrown > 0
            ? ((p.matchStats.cricketMarksHit / p.dartsThrown) * 100).toFixed(0)
            : '0';
        const statLabel = state.gameMode === 'cricket'
            ? `Přesnost: ${cricketEff} %`
            : `Průměr: ${avg}`;

        const medals = ['🥇', '🥈', '🥉'];
        const rightValue = state.phase === 'bulls'
            ? (bullsThrow ? (bullsThrow.isMiss ? 'Mimo' : `${bullsThrow.distCm.toFixed(1)} cm`) : '—')
            : (p.finishedRank ? `${medals[p.finishedRank - 1] || '🏅'} ${p.finishedRank}.` : p.score);

        const card = document.createElement('div');
        card.className = `player-card${isCurrent ? ' active' : ''}${p.finishedRank ? ' finished' : ''}`;
        card.innerHTML = `
      <div>
        <div class="player-name-row">
          <span class="color-dot" style="background: ${p.color};"></span>
          <div class="player-name-row">
          <span class="player-name">${escapeHtml(p.name)}</span>
        </div>
        </div>
        <div class="player-meta">
          ${state.phase === 'bulls'
            ? `Skóre ze hry: ${p.score} b.`
            : `${statLabel} | Šipek: ${p.dartsThrown}${p.lastTurn.length ? `<br>Poslední kolo: ${p.lastTurn.join(', ')}` : ''}`
        }
        </div>
      </div>
      <div class="player-score${state.phase === 'bulls' ? ' dist' : ''}">${rightValue}</div>
    `;
        const row = document.createElement('div');
        row.className = 'player-row';
        row.appendChild(card);

        if (checkout) {
            const checkoutBox = document.createElement('div');
            checkoutBox.className = `checkout-side-box${isCurrent ? ' active' : ''}`;
            checkoutBox.innerHTML = checkout.map((d, i) =>
                `<span class="checkout-badge${i === checkout.length - 1 ? ' finish' : ''}">${d}</span>`
            ).join('');
            row.appendChild(checkoutBox);
        }

        grid.appendChild(row);
    });

    renderBullsDarts();
    updateBoardHighlights();
    renderCricketBoard();

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