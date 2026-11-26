// =========================================================
// KONFIGURACE TERČE A HRY
// =========================================================
const BOARD_NUMBERS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const PLAYER_COLORS = ['#3b82f6', '#22c55e', '#facc15', '#ef4444'];
const ROUND_THRESHOLDS = { 301: 10, 501: 15, 701: 20 };
const BOARD_RADIUS_SVG = 235;
const BOARD_RADIUS_CM = 22.5;
const SCORING_RADIUS_SVG = 186; // vnější okraj Double prstence
const CRICKET_TARGETS = [20, 19, 18, 17, 16, 15, 25];

const STORAGE_KEY_PLAYERS = 'darts_db_players';
const STORAGE_KEY_STATS = 'darts_db_stats';
const STORAGE_KEY_MATCHES = 'darts_db_matches';
const STORAGE_KEY_CRICKET_STATS = 'darts_db_cricket_stats';
let activeLeaderboardTab = 'x01'; // 'x01' | 'cricket'

const NS = 'http://www.w3.org/2000/svg';

// =========================================================
// STAV HRY A HISTORIE
// =========================================================
let state = {
    gameMode: 501,
    phase: 'normal',
    startScore: 501,
    doubleOut: false,
    roundNumber: 1,
    bullsPending: false,
    players: [],
    finishedOrder: [],
    currentPlayerIndex: 0,
    currentTurn: [],
    currentTurnPoints: 0,
    turnScoringPoints: 0,
    turnScoringDarts: 0,
    turnStartScore: 501,
    bullsThrows: [],
    winner: null,
    statusMessage: null,
    statusType: null
};

let historyStack = [];

// =========================================================
// DOM PRVKY
// =========================================================
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
const endGameBtn = document.getElementById('end-game-btn');
const gameModeSelect = document.getElementById('game-mode');
const doubleOutRow = document.getElementById('double-out-row');
const cricketBoardEl = document.getElementById('cricket-board');

// =========================================================
// POMOCNÉ FUNKCE
// =========================================================
function createEl(tag, attrs = {}) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
}