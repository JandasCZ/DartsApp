// =========================================================
// MENU: VÝBĚR HRÁČŮ (COMBOBOX) + LEADERBOARD
// =========================================================
function setLeaderboardTab(tab) {
    activeLeaderboardTab = tab;
    document.querySelectorAll('.lb-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
    });
    renderLeaderboard();
}

gameModeSelect.addEventListener('change', () => {
    const isCricket = gameModeSelect.value === 'cricket';
    doubleOutRow.style.display = isCricket ? 'none' : 'flex';
    setLeaderboardTab(isCricket ? 'cricket' : 'x01');
});

playerCountSelect.addEventListener('change', renderPlayerInputs);

function renderPlayerInputs() {
    const count = parseInt(playerCountSelect.value, 10);

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
            syncPlayerSelectOptions();
            if (select.value === '__new__') input.focus();
        });
        syncVisibility();

        combo.appendChild(select);
        combo.appendChild(input);
        row.appendChild(dot);
        row.appendChild(combo);
        playerNamesDiv.appendChild(row);
    }
    syncPlayerSelectOptions();
}

function syncPlayerSelectOptions() {
    const count = parseInt(playerCountSelect.value, 10);
    const selectedIds = new Set();

    for (let i = 0; i < count; i++) {
        const sel = document.getElementById(`player-select-${i}`);
        if (sel && sel.value !== '__new__') {
            selectedIds.add(sel.value);
        }
    }

    for (let i = 0; i < count; i++) {
        const sel = document.getElementById(`player-select-${i}`);
        if (!sel) continue;
        Array.from(sel.options).forEach(opt => {
            if (opt.value === '__new__') {
                opt.disabled = false;
            } else {
                opt.disabled = selectedIds.has(opt.value) && sel.value !== opt.value;
            }
        });
    }
}

// Přepínání záložek x01 / Cricket
document.querySelectorAll('.lb-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        setLeaderboardTab(btn.dataset.tab);
    });
});

function renderPodium(sortedPlayers) {
    const podiumOrder = [
        { rank: 2, medal: '🥈', data: sortedPlayers[1] },
        { rank: 1, medal: '🥇', data: sortedPlayers[0] },
        { rank: 3, medal: '🥉', data: sortedPlayers[2] }
    ];

    document.getElementById('wins-podium').innerHTML = podiumOrder.map(slot => {
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
}

function renderRecentMatches() {
    const recentEl = document.getElementById('recent-games-list');
    if (matchesTable.length === 0) {
        recentEl.innerHTML = '<div class="lb-empty" style="font-size:0.85rem;">Zatím žádné odehrané hry.</div>';
        return;
    }

    recentEl.innerHTML = matchesTable.map(m => {
        const modeTag = `${m.mode}${m.doubleOut ? ' DO' : ''}${m.endedByBulls ? ' • Středy' : ''}`;
        const chips = m.players.map(p => {
            const isWinner = p.id === m.winnerId;
            const detail = m.endedByBulls && p.bullsText
                ? p.bullsText
                : (isWinner ? `${p.darts} šipek` : (m.mode === 'Cricket' ? `${p.score} b.` : `zb. ${p.score}`));
            return `<span class="recent-player-chip${isWinner ? ' winner' : ''}">${isWinner ? '🏆 ' : ''}${escapeHtml(p.name)} (${detail})</span>`;
        }).join('');

        return `
      <div class="recent-item">
        <div class="recent-top">
          <span class="recent-badge">${modeTag}</span>
          <span>${escapeHtml(m.date)}</span>
        </div>
        <div class="recent-players">${chips}</div>
      </div>
    `;
    }).join('');
}

function renderLeaderboard() {
    const thead = document.getElementById('lb-table-head');
    const tbody = document.getElementById('lb-table-body');
    const recordsEl = document.getElementById('records-grid');

    if (activeLeaderboardTab === 'cricket') {
        const joined = playersTable.map(p => {
            const s = cricketStatsTable.find(row => row.playerId === p.id) || {
                games: 0, wins: 0, fastestWinDarts: null, totalMarks: 0, totalDarts: 0, bestScore: 0
            };
            const mprNum = s.totalDarts > 0 ? (s.totalMarks / s.totalDarts) * 3 : 0;
            return {
                id: p.id,
                name: p.name,
                games: s.games || 0,
                wins: s.wins || 0,
                mpr: mprNum.toFixed(2),
                mprNum,
                fastestWinDarts: s.fastestWinDarts ?? null,
                bestScore: s.bestScore || 0
            };
        });

        const byWins = [...joined].sort((a, b) =>
            b.wins - a.wins || b.mprNum - a.mprNum || (a.fastestWinDarts ?? 9999) - (b.fastestWinDarts ?? 9999)
        );
        renderPodium(byWins);

        const fastest = [...joined].filter(p => p.fastestWinDarts !== null).sort((a, b) => a.fastestWinDarts - b.fastestWinDarts)[0];
        const topMpr = [...joined].filter(p => p.mprNum > 0).sort((a, b) => b.mprNum - a.mprNum)[0];
        const topScore = [...joined].filter(p => p.bestScore > 0).sort((a, b) => b.bestScore - a.bestScore)[0];

        recordsEl.innerHTML = `
      <div class="record-card">
        <div class="record-title">⚡ Nejrychlejší výhra</div>
        <div class="record-player">${fastest ? escapeHtml(fastest.name) : '—'}</div>
        <div class="record-value">${fastest ? `${fastest.fastestWinDarts} šipek` : '—'}</div>
        <div class="record-sub">Nejméně šipek k výhře</div>
      </div>
      <div class="record-card">
        <div class="record-title">🎯 Nejlepší MPR</div>
        <div class="record-player">${topMpr ? escapeHtml(topMpr.name) : '—'}</div>
        <div class="record-value">${topMpr ? topMpr.mpr : '0.00'}</div>
        <div class="record-sub">Značek na 1 kolo</div>
      </div>
      <div class="record-card">
        <div class="record-title">🔥 Nejvyšší skóre</div>
        <div class="record-player">${topScore ? escapeHtml(topScore.name) : '—'}</div>
        <div class="record-value">${topScore ? `${topScore.bestScore} b.` : '0 b.'}</div>
        <div class="record-sub">Max bodů v 1 hře</div>
      </div>
    `;

        thead.innerHTML = `
      <tr>
        <th>Hráč</th>
        <th>Hry</th>
        <th>Výhry</th>
        <th>MPR</th>
        <th>Nejrychlejší</th>
        <th>Max skóre</th>
      </tr>
    `;

        if (byWins.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="lb-empty">Zatím nejsou uloženi žádní hráči. Odehraj první hru!</td></tr>';
        } else {
            tbody.innerHTML = byWins.map(p => `
        <tr>
          <td><strong>${escapeHtml(p.name)}</strong></td>
          <td>${p.games}</td>
          <td>${p.wins}</td>
          <td>${p.mpr}</td>
          <td>${p.fastestWinDarts !== null ? `${p.fastestWinDarts} š.` : '—'}</td>
          <td>${p.bestScore}</td>
        </tr>
      `).join('');
        }
    } else {
        // === ZÁLOŽKA x01 ===
        const joined = playersTable.map(p => {
            const s = statsTable.find(row => row.playerId === p.id) || {
                games: 0, wins: 0, t20: 0, t19: 0, misses: 0, bestTurn: 0, scoringPoints: 0, scoringDarts: 0
            };
            const sPoints = s.scoringPoints || 0;
            const sDarts = s.scoringDarts || 0;
            const avgNum = sDarts > 0 ? (sPoints / sDarts) * 3 : 0;
            return {
                id: p.id,
                name: p.name,
                games: s.games || 0,
                wins: s.wins || 0,
                avg: avgNum.toFixed(1),
                avgNum,
                t20: s.t20 || 0,
                t19: s.t19 || 0,
                t20t19: (s.t20 || 0) + (s.t19 || 0),
                misses: s.misses || 0,
                bestTurn: s.bestTurn || 0
            };
        });

        const byWins = [...joined].sort((a, b) =>
            b.wins - a.wins || b.avgNum - a.avgNum || b.bestTurn - a.bestTurn
        );
        renderPodium(byWins);

        const topTriples = [...joined].sort((a, b) => b.t20t19 - a.t20t19)[0];
        const topMisses = [...joined].sort((a, b) => b.misses - a.misses)[0];
        const topTurn = [...joined].sort((a, b) => b.bestTurn - a.bestTurn)[0];

        recordsEl.innerHTML = `
      <div class="record-card">
        <div class="record-title">🎯 Nejvíc T20 / T19</div>
        <div class="record-player">${topTriples && topTriples.t20t19 > 0 ? escapeHtml(topTriples.name) : '—'}</div>
        <div class="record-value">${topTriples && topTriples.t20t19 > 0 ? `${topTriples.t20t19}×` : '0×'}</div>
        <div class="record-sub">${topTriples && topTriples.t20t19 > 0 ? `${topTriples.t20}× T20 • ${topTriples.t19}× T19` : 'Zatím nic'}</div>
      </div>
      <div class="record-card">
        <div class="record-title">🧱 Nejvíce zdí</div>
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

        thead.innerHTML = `
      <tr>
        <th>Hráč</th>
        <th>Hry</th>
        <th>Výhry</th>
        <th>Průměr</th>
        <th>T20/T19</th>
        <th>Zdi</th>
        <th>Max kolo</th>
      </tr>
    `;

        if (byWins.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="lb-empty">Zatím nejsou uloženi žádní hráči. Odehraj první hru!</td></tr>';
        } else {
            tbody.innerHTML = byWins.map(p => `
        <tr>
          <td><strong>${escapeHtml(p.name)}</strong></td>
          <td>${p.games}</td>
          <td>${p.wins}</td>
          <td>${p.avg}</td>
          <td>${p.t20t19} <span style="color:var(--muted);font-size:0.76rem;">(${p.t20}/${p.t19})</span></td>
          <td>${p.misses}</td>
          <td>${p.bestTurn}</td>
        </tr>
      `).join('');
        }
    }

    renderRecentMatches();
}