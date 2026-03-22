import { Sudoku } from './src/Sudoku.js';
import { SudokuSolver } from './src/SudokuSolver.js';

// ── Presets ──────────────────────────────────────────────────────────────────
const PRESETS = {
    'Easy':     '530070000600195000098000060800060003400803001700020006060000280000419005000080079',
    'Medium':   '000000907000420180000705026100904000050000040000507009920108000034059000507000000',
    'Hard':     '800000000003600000070090200060005030004000100030040070002006000500300000000008006',
    'Hardest':  '000000000000003085001020000000507000004000100090000000500000073002010000000040009',
    'Extreme':  '000000000000000000000000000000000000000000000000000000000000000000000000000000001',
};

// ── State ─────────────────────────────────────────────────────────────────────
let currentPuzzle = PRESETS['Easy'];
let animFrameId   = null;
let isAnimating   = false;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const gridEl       = document.getElementById('grid');
const statusEl     = document.getElementById('status');
const inputEl      = document.getElementById('puzzle-input');
const algoSelect   = document.getElementById('algo-select');
const solveBtn     = document.getElementById('solve-btn');
const animBtn      = document.getElementById('anim-btn');
const stopBtn      = document.getElementById('stop-btn');
const speedRange   = document.getElementById('speed');
const statNodes    = document.getElementById('stat-nodes');
const statTime     = document.getElementById('stat-time');
const statSteps    = document.getElementById('stat-steps');
const statAlgo     = document.getElementById('stat-algo');

// ── Build grid ────────────────────────────────────────────────────────────────
function buildGrid() {
    gridEl.innerHTML = '';
    for (let i = 0; i < 81; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.idx = i;
        cell.dataset.row = Math.floor(i / 9);
        cell.dataset.col = i % 9;
        gridEl.appendChild(cell);
    }
}

function renderGrid(grid, givenMask, highlightIdx = -1, conflictIdx = -1) {
    const cells = gridEl.querySelectorAll('.cell');
    cells.forEach((cell, i) => {
        const v = grid[i];
        cell.textContent = v || '';
        cell.className = 'cell';
        if (givenMask[i])       cell.classList.add('given');
        else if (v)             cell.classList.add('solved');
        if (i === highlightIdx) cell.classList.add('active');
        if (i === conflictIdx)  cell.classList.add('conflict');
    });
}

function flashCell(idx) {
    const cell = gridEl.querySelector(`[data-idx="${idx}"]`);
    if (!cell) return;
    cell.classList.remove('flash');
    void cell.offsetWidth; // reflow
    cell.classList.add('flash');
}

// ── Solve (instant) ───────────────────────────────────────────────────────────
function solveInstant() {
    stopAnimation();
    const puzzle = inputEl.value.trim() || currentPuzzle;
    const algo   = algoSelect.value;

    setStatus('Solving…', 'running');
    const t0 = performance.now();

    const solver   = new SudokuSolver(puzzle);
    const solution = solver.solve(algo);
    const elapsed  = performance.now() - t0;

    const given = new Sudoku(puzzle).grid.map(v => v !== 0);

    if (solution) {
        renderGrid(solution.grid, given);
        setStatus('Solved ✓', 'ok');
        updateStats(solver.steps.length, elapsed, solver.steps.length, algo);
    } else {
        setStatus('No solution found', 'error');
        updateStats(0, elapsed, 0, algo);
    }
}

// ── Solve (animated) ─────────────────────────────────────────────────────────
function solveAnimated() {
    stopAnimation();
    const puzzle = inputEl.value.trim() || currentPuzzle;
    const algo   = algoSelect.value;

    const given  = new Sudoku(puzzle).grid.map(v => v !== 0);
    const solver = new SudokuSolver(puzzle);

    setStatus('Solving…', 'running');
    const t0 = performance.now();
    const solution = solver.solve(algo);
    const elapsed  = performance.now() - t0;

    if (!solution) {
        setStatus('No solution found', 'error');
        return;
    }

    const steps = solver.steps;
    let stepIdx = 0;
    isAnimating = true;
    solveBtn.disabled = true;
    animBtn.disabled  = true;
    stopBtn.disabled  = false;

    function nextStep() {
        if (!isAnimating || stepIdx >= steps.length) {
            isAnimating = false;
            solveBtn.disabled = false;
            animBtn.disabled  = false;
            stopBtn.disabled  = true;
            setStatus('Solved ✓', 'ok');
            updateStats(steps.length, elapsed, steps.length, algo);
            return;
        }

        const step = steps[stepIdx++];
        renderGrid(step.grid, given);

        // Find last changed cell for highlight
        if (stepIdx > 1) {
            const prev = steps[stepIdx - 2].grid;
            for (let i = 0; i < 81; i++) {
                if (step.grid[i] !== prev[i]) { flashCell(i); break; }
            }
        }

        statSteps.textContent = stepIdx;

        const delay = Math.max(1, 600 - parseInt(speedRange.value) * 5);
        animFrameId = setTimeout(nextStep, delay);
    }

    nextStep();
}

function stopAnimation() {
    if (animFrameId) clearTimeout(animFrameId);
    isAnimating   = false;
    solveBtn.disabled = false;
    animBtn.disabled  = false;
    stopBtn.disabled  = true;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function setStatus(msg, type = '') {
    statusEl.textContent = msg;
    statusEl.className   = 'status ' + type;
}

function updateStats(nodes, ms, steps, algo) {
    statNodes.textContent = nodes;
    statTime.textContent  = ms < 1 ? '<1 ms' : Math.round(ms) + ' ms';
    statSteps.textContent = steps;
    statAlgo.textContent  = algo;
}

function loadPuzzle(str) {
    currentPuzzle = str;
    inputEl.value = str;
    const sudoku  = new Sudoku(str);
    const given   = sudoku.grid.map(v => v !== 0);
    renderGrid(sudoku.grid, given);
    setStatus('Ready');
    updateStats('—', '—', '—', algoSelect.value);
}

// ── Preset buttons ────────────────────────────────────────────────────────────
document.querySelectorAll('.presets button').forEach(btn => {
    btn.addEventListener('click', () => loadPuzzle(PRESETS[btn.dataset.preset]));
});

// ── Event listeners ───────────────────────────────────────────────────────────
solveBtn.addEventListener('click', solveInstant);
animBtn.addEventListener('click',  solveAnimated);
stopBtn.addEventListener('click',  stopAnimation);

inputEl.addEventListener('change', () => {
    const v = inputEl.value.trim();
    if (v.length === 81) loadPuzzle(v);
});

algoSelect.addEventListener('change', () => {
    statAlgo.textContent = algoSelect.value;
});

// ── Init ──────────────────────────────────────────────────────────────────────
buildGrid();
loadPuzzle(currentPuzzle);
stopBtn.disabled = true;
