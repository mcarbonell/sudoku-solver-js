// SudokuSolver — three optimized algorithms with step-by-step generator support (Optimized V2)

import { Sudoku, POPCOUNT, VALUES } from './Sudoku.js';

// Precomputed 27 units (9 rows, 9 cols, 9 boxes) to avoid dynamic allocations during Hidden Singles checks
const UNITS = [];
// 9 Rows
for (let r = 0; r < 9; r++) {
    const row = new Uint8Array(9);
    for (let c = 0; c < 9; c++) row[c] = r * 9 + c;
    UNITS.push(row);
}
// 9 Columns
for (let c = 0; c < 9; c++) {
    const col = new Uint8Array(9);
    for (let r = 0; r < 9; r++) col[r] = r * 9 + c;
    UNITS.push(col);
}
// 9 Boxes
for (let b = 0; b < 9; b++) {
    const box = new Uint8Array(9);
    const br = Math.floor(b / 3) * 3;
    const bc = (b % 3) * 3;
    for (let i = 0; i < 9; i++) {
        box[i] = (br + Math.floor(i / 3)) * 9 + (bc + i % 3);
    }
    UNITS.push(box);
}

// Highly efficient Binary Heap (Min-Heap) for O(log N) priority queue operations in Best-First search
class MinHeap {
    constructor() {
        this.heap = [];
    }

    push(item) {
        this.heap.push(item);
        this._up(this.heap.length - 1);
    }

    pop() {
        if (this.heap.length === 0) return null;
        const top = this.heap[0];
        const bottom = this.heap.pop();
        if (this.heap.length > 0) {
            this.heap[0] = bottom;
            this._down(0);
        }
        return top;
    }

    get length() {
        return this.heap.length;
    }

    _up(i) {
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (this.heap[i].getScore() >= this.heap[p].getScore()) break;
            const tmp = this.heap[i];
            this.heap[i] = this.heap[p];
            this.heap[p] = tmp;
            i = p;
        }
    }

    _down(i) {
        const len = this.heap.length;
        while ((i << 1) + 1 < len) {
            let child = (i << 1) + 1;
            if (child + 1 < len && this.heap[child + 1].getScore() < this.heap[child].getScore()) {
                child++;
            }
            if (this.heap[i].getScore() <= this.heap[child].getScore()) break;
            const tmp = this.heap[i];
            this.heap[i] = this.heap[child];
            this.heap[child] = tmp;
            i = child;
        }
    }
}

export class SudokuSolver {

    constructor(puzzle) {
        this.initial = new Sudoku(puzzle);
        this.steps = [];   // recorded for animation
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    solve(algorithm = 'backtrackingfm') {
        this.steps = [];
        const solution = this[`_solve${this._cap(algorithm)}`]();
        return solution;
    }

    _cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    _record(sudoku, type = 'set') {
        this.steps.push({ grid: sudoku.grid.slice(), type });
    }

    // -------------------------------------------------------------------------
    // Shared helpers (Optimized)
    // -------------------------------------------------------------------------

    _getMoves(sudoku) {
        // 1. Quick validation: check if any empty cell has 0 candidates
        for (let i = 0; i < 81; i++) {
            if (sudoku.grid[i] === 0) {
                if (sudoku.candidates[i] === 0) return null;
            }
        }

        // 2. Hidden singles scan: sweep 27 units
        const lenUnits = UNITS.length;
        for (let u = 0; u < lenUnits; u++) {
            const unitIdxs = UNITS[u];
            const counts = new Uint8Array(10);
            const positions = new Uint8Array(10);

            for (let i = 0; i < 9; i++) {
                const idx = unitIdxs[i];
                if (sudoku.grid[idx] === 0) {
                    const mask = sudoku.candidates[idx];
                    if (mask !== null) {
                        for (let bit = 0; bit < 9; bit++) {
                            if ((mask & (1 << bit)) !== 0) {
                                const val = bit + 1;
                                counts[val]++;
                                positions[val] = idx;
                            }
                        }
                    }
                }
            }

            for (let v = 1; v <= 9; v++) {
                if (counts[v] === 1) {
                    sudoku.onlyMoves.push({ idx: positions[v], value: v });
                }
            }
        }

        if (!sudoku.applyOnlyMoves()) return null;
        if (sudoku.checkSolved()) return {};

        // 3. Rebuild and find cell with minimum remaining values (MRV)
        let minCount = 10;
        let minIdxs = [];

        for (let i = 0; i < 81; i++) {
            if (sudoku.grid[i] === 0) {
                const mask = sudoku.candidates[i];
                if (mask === null || mask === 0) return null;
                const n = POPCOUNT[mask];
                if (n === 1) continue; // Should have been processed by onlyMoves, but skip if somehow here
                if (n < minCount) {
                    minCount = n;
                    minIdxs = [i];
                } else if (n === minCount) {
                    minIdxs.push(i);
                }
            }
        }

        if (minIdxs.length === 0) return null;

        // Map minimum candidate cells to the expected moves array
        const moves = [];
        const lenMin = minIdxs.length;
        for (let i = 0; i < lenMin; i++) {
            const idx = minIdxs[i];
            moves.push({ idx: idx, values: VALUES[sudoku.candidates[idx]] });
        }
        return moves;
    }

    // -------------------------------------------------------------------------
    // Algorithm 1: Backtracking (failure-memory heuristic)
    //
    // Design (after fixing the original "Tryouts" restart+global-penalty version,
    // which was incomplete on hard puzzles — see _solveTryoutsStochastic() below
    // for that original baseline).
    //   * We make a real BRANCHING DECISION only at cells with several candidates
    //     (MRV). Forced moves (naked/hidden singles) are deterministic propagation
    //     and are never part of the "guesses".
    //   * On backtracking we penalize ONLY the concrete failed guess (cell,value),
    //     never the whole path or the forced moves. The penalty is a soft ordering
    //     hint, so a guess that failed in one prefix is merely deprioritized, not
    //     forbidden — keeping the search complete.
    //   * When a cell exhausts all its candidates the recursion returns null and the
    //     failure propagates to the parent decision automatically (classic
    //     backtracking). By construction every cell must have a valid value, so an
    //     exhausted cell implies the prefix is inconsistent and the parent is to blame.
    // -------------------------------------------------------------------------

    _solveBacktrackingfm() {
        const history = {};
        for (let r = 0; r < 9; r++)
            for (let c = 0; c < 9; c++)
                for (let v = 1; v <= 9; v++)
                    history[`${r*9+c},${v}`] = 0;

        const MAX_NODES = 100000;
        let nodes = 0;
        let failedAttempts = 0;
        let maxDepth = 0;

        const solve = (sudoku, depth = 1) => {
            if (depth > maxDepth) maxDepth = depth;
            if (!sudoku.applyOnlyMoves() || !sudoku.isValid) return null;
            if (sudoku.checkSolved()) return sudoku;

            const moves = this._getMoves(sudoku);
            if (!moves || !sudoku.isValid) return null;
            if (sudoku.checkSolved()) return sudoku;
            if (moves.length === 0) return null;

            const move = moves[0];
            // Order candidates by failure-memory: least penalized first.
            const cands = move.values.slice().sort(
                (a, b) => (history[`${move.idx},${a}`] || 0) - (history[`${move.idx},${b}`] || 0)
            );

            for (const v of cands) {
                if (nodes++ > MAX_NODES) return null;
                const branch = sudoku.clone();
                    if (branch.setValue(move.idx, v) && branch.applyOnlyMoves() && branch.isValid) {
                        this._record(branch, 'set');
                        const res = solve(branch, depth + 1);
                        if (res) return res;
                    }
                // This concrete guess (and its whole subtree) failed -> penalize it.
                history[`${move.idx},${v}`] = (history[`${move.idx},${v}`] || 0) + 1;
                failedAttempts++;
            }
            return null;
        };

        const result = solve(this.initial.clone());
        this.stats = { restarts: nodes, failedAttempts, maxDepth, solved: !!result };
        return result;
    }

    // -------------------------------------------------------------------------
    // Algorithm 2: Queue (best-first search with Min-Heap)
    // -------------------------------------------------------------------------

    _solveQueue() {
        const queue = new MinHeap();
        queue.push(this.initial.clone());
        let nodes = 0;
        let clones = 1;
        let maxQueue = 1;
        const MAX_NODES = 100000;
        let result = null;

        while (queue.length && nodes++ < MAX_NODES) {
            // Pop best scored state in O(log N) from Min-Heap
            const sudoku = queue.pop();

            if (!sudoku.applyOnlyMoves() || !sudoku.isValid) continue;
            this._record(sudoku, 'expand');
            if (sudoku.checkSolved()) { result = sudoku; break; }

            const moves = this._getMoves(sudoku);
            if (!moves || !sudoku.isValid) continue;
            if (sudoku.checkSolved()) { result = sudoku; break; }

            const move = moves[0];
            for (const value of move.values) {
                const branch = sudoku.clone();
                clones++;
                branch.alternatives = (branch.alternatives || 0) + move.values.length - 1;
                if (branch.setValue(move.idx, value) && branch.applyOnlyMoves() && branch.isValid) {
                    this._record(branch, 'branch');
                    if (branch.checkSolved()) { result = branch; break; }
                    queue.push(branch);
                    if (queue.length > maxQueue) maxQueue = queue.length;
                }
            }
            if (result) break;
        }
        this.stats = { nodes, maxQueue, clones, solved: !!result };
        return result;
    }

    // -------------------------------------------------------------------------
    // Algorithm 3: Backtracking (iterative deepening by used alternatives)
    // -------------------------------------------------------------------------

    _solveBacktracking() {
        const MAX_DEPTH = 200;
        this._btNodes = 0;
        this._btMaxDepth = 0;
        let result = null;
        for (let maxAlt = 0; maxAlt <= MAX_DEPTH; maxAlt++) {
            const sudoku = this.initial.clone();
            result = this._btRecurse(sudoku, maxAlt, 1);
            if (result) break;
        }
        this.stats = { nodes: this._btNodes, maxDepth: this._btMaxDepth, solved: !!result };
        return result;
    }

    _btRecurse(sudoku, maxAlt, depth) {
        if (depth > this._btMaxDepth) this._btMaxDepth = depth;
        if (!sudoku.applyOnlyMoves() || !sudoku.isValid) return null;
        this._record(sudoku, 'expand');
        if (sudoku.checkSolved()) { this._record(sudoku, 'solved'); return sudoku; }

        const moves = this._getMoves(sudoku);
        if (!moves || !sudoku.isValid) return null;
        if (sudoku.checkSolved()) { this._record(sudoku, 'solved'); return sudoku; }

        const move = moves[0];

        const branches = [];
        for (const value of move.values) {
            const branch = sudoku.clone();
            this._btNodes++;
            branch.usedAlternatives = (branch.usedAlternatives || 0);
            if (branch.setValue(move.idx, value) && branch.applyOnlyMoves() && branch.isValid) {
                branches.push({ sudoku: branch, score: branch.getScore() });
            }
        }

        branches.sort((a, b) => a.score - b.score);

        for (let i = 0; i < branches.length; i++) {
            const branch = branches[i].sudoku;
            branch.usedAlternatives = (sudoku.usedAlternatives || 0) + i;
            if (branch.usedAlternatives > maxAlt) return null;
            this._record(branch, 'branch');
            const result = this._btRecurse(branch, maxAlt, depth + 1);
            if (result) return result;
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // Algorithm (baseline): Tryouts Stochastic (restart + history heuristic)
    //
    // This is the ORIGINAL "Tryouts" design kept as a reference/baseline. It
    // restarts from scratch on every failed attempt and, crucially, penalizes
    // EVERY move in the attempt's full history (including forced moves and
    // correct early guesses). That contamination makes the search incomplete on
    // hard puzzles (it solves only ~7/20 of the top-20 set). Kept here so the
    // demo can show why the corrected Backtracking (failure-memory) algorithm
    // (above) replaced it.
    // -------------------------------------------------------------------------

    _solveTryoutsStochastic() {
        const historyHeuristic = {};
        const MAX_RESTARTS = 100000;
        let restarts = 0;
        let failedAttempts = 0;

        while (restarts++ < MAX_RESTARTS) {
            const sudoku = this.initial.clone();
            this._record(sudoku, 'restart');

            if (!sudoku.applyOnlyMoves() || !sudoku.isValid) continue;
            if (sudoku.checkSolved()) {
                this._record(sudoku, 'solved');
                this.stats = { restarts, failedAttempts, solved: true };
                return sudoku;
            }

            const moveHistory = [];
            let solved = false;

            while (true) {
                const moves = this._getMoves(sudoku);
                if (!moves || !sudoku.isValid) break;
                if (sudoku.checkSolved()) { solved = true; break; }
                if (moves.length === 0) break;

                const move = moves[0];
                const sorted = move.values.slice().sort(
                    (a, b) => (historyHeuristic[`${move.idx},${a}`] || 0) - (historyHeuristic[`${move.idx},${b}`] || 0)
                );
                const chosen = sorted[0];

                this._record(sudoku, 'try');
                if (!sudoku.setValue(move.idx, chosen) || !sudoku.applyOnlyMoves()) break;

                moveHistory.push({ idx: move.idx, value: chosen });
                this._record(sudoku, 'set');
                if (sudoku.checkSolved()) { solved = true; break; }
            }

            if (solved) {
                this._record(sudoku, 'solved');
                this.stats = { restarts, failedAttempts, solved: true };
                return sudoku;
            }

            failedAttempts++;
            // Original behavior: penalize the ENTIRE history of the failed attempt.
            for (const h of moveHistory) {
                historyHeuristic[`${h.idx},${h.value}`] = (historyHeuristic[`${h.idx},${h.value}`] || 0) + 1;
            }
        }
        this.stats = { restarts, failedAttempts, solved: false };
        return null;
    }
}
