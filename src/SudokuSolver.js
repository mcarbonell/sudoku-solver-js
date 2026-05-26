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

    solve(algorithm = 'tryouts') {
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
    // Algorithm 1: Tryouts (stochastic restart + history heuristic)
    // -------------------------------------------------------------------------

    _solveTryouts() {
        const history = {};
        for (let r = 0; r < 9; r++)
            for (let c = 0; c < 9; c++)
                for (let v = 1; v <= 9; v++)
                    history[`${r*9+c},${v}`] = 0;

        const MAX_NODES = 100000;
        let nodes = 0;

        while (nodes++ < MAX_NODES) {
            const sudoku = this.initial.clone();
            this._record(sudoku, 'restart');

            if (!sudoku.applyOnlyMoves() || !sudoku.isValid) continue;
            if (sudoku.checkSolved()) { this._record(sudoku, 'solved'); return sudoku; }

            let failed = false;
            while (true) {
                const moves = this._getMoves(sudoku);
                if (!moves || !sudoku.isValid) { failed = true; break; }
                if (sudoku.checkSolved()) { this._record(sudoku, 'solved'); return sudoku; }
                if (moves.length === 0) { failed = true; break; }

                // Pick move with fewest candidates
                const move = moves[0];

                // Sort candidates by history score (lowest = least failed = preferred)
                const sorted = move.values.slice().sort(
                    (a, b) => (history[`${move.idx},${a}`] || 0) - (history[`${move.idx},${b}`] || 0)
                );

                const chosen = sorted[0];
                this._record(sudoku, 'try');

                if (!sudoku.setValue(move.idx, chosen) || !sudoku.applyOnlyMoves()) {
                    history[`${move.idx},${chosen}`] = (history[`${move.idx},${chosen}`] || 0) + 1;
                    failed = true;
                    break;
                }

                this._record(sudoku, 'set');
                if (sudoku.checkSolved()) { this._record(sudoku, 'solved'); return sudoku; }
            }

            if (failed) {
                // Penalize all moves made in this failed attempt
                for (const { idx, value } of sudoku.moveHistory) {
                    history[`${idx},${value}`] = (history[`${idx},${value}`] || 0) + 1;
                }
            }
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // Algorithm 2: Queue (best-first search with Min-Heap)
    // -------------------------------------------------------------------------

    _solveQueue() {
        const queue = new MinHeap();
        queue.push(this.initial.clone());
        let nodes = 0;
        const MAX_NODES = 100000;

        while (queue.length && nodes++ < MAX_NODES) {
            // Pop best scored state in O(log N) from Min-Heap
            const sudoku = queue.pop();

            if (!sudoku.applyOnlyMoves() || !sudoku.isValid) continue;
            this._record(sudoku, 'expand');
            if (sudoku.checkSolved()) { this._record(sudoku, 'solved'); return sudoku; }

            const moves = this._getMoves(sudoku);
            if (!moves || !sudoku.isValid) continue;
            if (sudoku.checkSolved()) { this._record(sudoku, 'solved'); return sudoku; }

            const move = moves[0];
            for (const value of move.values) {
                const branch = sudoku.clone();
                branch.alternatives = (branch.alternatives || 0) + move.values.length - 1;
                if (branch.setValue(move.idx, value) && branch.applyOnlyMoves() && branch.isValid) {
                    this._record(branch, 'branch');
                    if (branch.checkSolved()) { this._record(branch, 'solved'); return branch; }
                    queue.push(branch);
                }
            }
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // Algorithm 3: Backtracking (iterative deepening by used alternatives)
    // -------------------------------------------------------------------------

    _solveBacktracking() {
        const MAX_DEPTH = 200;
        for (let maxAlt = 0; maxAlt <= MAX_DEPTH; maxAlt++) {
            const sudoku = this.initial.clone();
            const result = this._btRecurse(sudoku, maxAlt);
            if (result) return result;
        }
        return null;
    }

    _btRecurse(sudoku, maxAlt) {
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
            const result = this._btRecurse(branch, maxAlt);
            if (result) return result;
        }
        return null;
    }
}
