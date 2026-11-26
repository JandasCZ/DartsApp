// =========================================================
// DATABÁZOVÁ VRSTVA (players, stats [x01], cricketStats, matches)
// =========================================================
let playersTable = [];
let statsTable = [];
let cricketStatsTable = [];
let matchesTable = [];
let preWinDbSnapshot = null;

function loadDatabase() {
    try {
        playersTable = JSON.parse(localStorage.getItem(STORAGE_KEY_PLAYERS)) || [];
        statsTable = JSON.parse(localStorage.getItem(STORAGE_KEY_STATS)) || [];
        cricketStatsTable = JSON.parse(localStorage.getItem(STORAGE_KEY_CRICKET_STATS)) || [];
        matchesTable = JSON.parse(localStorage.getItem(STORAGE_KEY_MATCHES)) || [];
    } catch {
        playersTable = [];
        statsTable = [];
        cricketStatsTable = [];
        matchesTable = [];
    }
}

function saveDatabase() {
    localStorage.setItem(STORAGE_KEY_PLAYERS, JSON.stringify(playersTable));
    localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(statsTable));
    localStorage.setItem(STORAGE_KEY_CRICKET_STATS, JSON.stringify(cricketStatsTable));
    localStorage.setItem(STORAGE_KEY_MATCHES, JSON.stringify(matchesTable));
}

function getOrCreatePlayer(rawName) {
    const cleanName = rawName.trim();
    const existing = playersTable.find(p => p.name.toLowerCase() === cleanName.toLowerCase());
    if (existing) {
        ensureStatsRow(existing.id);
        ensureCricketStatsRow(existing.id);
        return existing;
    }

    const newPlayer = {
        id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: cleanName
    };
    playersTable.push(newPlayer);
    ensureStatsRow(newPlayer.id);
    ensureCricketStatsRow(newPlayer.id);
    saveDatabase();
    return newPlayer;
}

function ensureStatsRow(playerId) {
    let row = statsTable.find(s => s.playerId === playerId);
    if (!row) {
        row = {
            playerId,
            games: 0,
            wins: 0,
            t20: 0,
            t19: 0,
            misses: 0,
            bestTurn: 0,
            scoringPoints: 0,
            scoringDarts: 0
        };
        statsTable.push(row);
    }
    return row;
}

function ensureCricketStatsRow(playerId) {
    let row = cricketStatsTable.find(s => s.playerId === playerId);
    if (!row) {
        row = {
            playerId,
            games: 0,
            wins: 0,
            fastestWinDarts: null,
            totalMarks: 0,
            totalDarts: 0,
            bestScore: 0
        };
        cricketStatsTable.push(row);
    }
    return row;
}

function commitMatchToDb(winnerPlayerId) {
    preWinDbSnapshot = {
        players: JSON.parse(JSON.stringify(playersTable)),
        stats: JSON.parse(JSON.stringify(statsTable)),
        cricketStats: JSON.parse(JSON.stringify(cricketStatsTable)),
        matches: JSON.parse(JSON.stringify(matchesTable))
    };

    if (state.gameMode === 'cricket') {
        state.players.forEach(p => {
            const row = ensureCricketStatsRow(p.id);
            row.games = (row.games || 0) + 1;
            row.totalMarks = (row.totalMarks || 0) + (p.matchStats.cricketMarksHit || 0);
            row.totalDarts = (row.totalDarts || 0) + p.dartsThrown;
            if (p.score > (row.bestScore || 0)) {
                row.bestScore = p.score;
            }
            if (p.id === winnerPlayerId) {
                row.wins = (row.wins || 0) + 1;
                if (row.fastestWinDarts === null || p.dartsThrown < row.fastestWinDarts) {
                    row.fastestWinDarts = p.dartsThrown;
                }
            }
        });
    } else {
        state.players.forEach(p => {
            const row = ensureStatsRow(p.id);
            row.games = (row.games || 0) + 1;
            row.t20 += p.matchStats.t20;
            row.t19 += p.matchStats.t19;
            row.misses += p.matchStats.misses;
            row.scoringPoints = (row.scoringPoints || 0) + p.matchStats.scoringPoints;
            row.scoringDarts = (row.scoringDarts || 0) + p.matchStats.scoringDarts;
            if (p.matchStats.bestTurn > row.bestTurn) {
                row.bestTurn = p.matchStats.bestTurn;
            }
            if (p.id === winnerPlayerId) {
                row.wins += 1;
            }
        });
    }

    const matchRecord = {
        id: `m_${Date.now()}`,
        date: new Date().toLocaleString('cs-CZ', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
        }),
        mode: state.gameMode === 'cricket' ? 'Cricket' : state.startScore,
        doubleOut: state.doubleOut,
        endedByBulls: state.phase === 'bulls',
        winnerId: winnerPlayerId,
        players: state.players.map((p, idx) => {
            const bThrow = state.bullsThrows.find(t => t.playerIndex === idx);
            return {
                id: p.id,
                name: p.name,
                score: p.score,
                darts: p.dartsThrown,
                bullsText: bThrow ? (bThrow.isMiss ? 'Mimo' : `${bThrow.distCm.toFixed(1)} cm`) : null
            };
        })
    };

    matchesTable.unshift(matchRecord);
    if (matchesTable.length > 20) matchesTable.length = 20;

    saveDatabase();
}

function rollbackLastDbCommit() {
    if (!preWinDbSnapshot) return;
    playersTable = preWinDbSnapshot.players;
    statsTable = preWinDbSnapshot.stats;
    cricketStatsTable = preWinDbSnapshot.cricketStats;
    matchesTable = preWinDbSnapshot.matches;
    preWinDbSnapshot = null;
    saveDatabase();
}

// Export / Import JSON databáze
document.getElementById('export-db-btn').addEventListener('click', () => {
    const payload = {
        players: playersTable,
        stats: statsTable,
        cricketStats: cricketStatsTable,
        matches: matchesTable
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
            cricketStatsTable = Array.isArray(parsed.cricketStats) ? parsed.cricketStats : [];
            matchesTable = Array.isArray(parsed.matches) ? parsed.matches : [];
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