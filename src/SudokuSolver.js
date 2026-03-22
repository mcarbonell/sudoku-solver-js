// SudokuSolver — three algorithms with step-by-step generator support

import { Sudoku } from './Sudoku.js';

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
    // Shared helpers
    // -------------------------------------------------------------------------

    _getMoves(sudoku) {
        // Returns moves grouped by number of candidates, lowest first
        const byCount = {};

        for (let i = 0; i < 81; i++) {
            if (sudoku.grid[i]) continue;
            const cands = sudoku.candidates[i];
            if (!cands || cands.size === 0) return null; // invalid
            if (cands.size === 1) continue;              // handled by onlyMoves
            const n = cands.size;
            if (!byCount[n]) byCount[n] = [];
            byCount[n].push({ idx: i, values: [...cands] });
        }

        // Hidden singles: value that appears only once in a row/col/box
        for (let unit = 0; unit < 9; unit++) {
            for (const getIdxs of [
                u => Array.from({length: 9}, (_, c) => u * 9 + c),
                u => Array.from({length: 9}, (_, r) => r * 9 + u),
                u => { const br = Math.floor(u/3)*3, bc = (u%3)*3; return Array.from({length:9},(_,i) => (br+Math.floor(i/3))*9+(bc+i%3)); }
            ]) {
                const idxs = getIdxs(unit).filter(i => !sudoku.grid[i]);
                const valueCount = {};
                for (const i of idxs) {
                    if (!sudoku.candidates[i]) continue;
                    for (const v of sudoku.candidates[i]) {
                        if (!valueCount[v]) valueCount[v] = [];
                        valueCount[v].push(i);
                    }
                }
                for (const [v, cells] of Object.entries(valueCount)) {
                    if (cells.length === 0) { return null; }
                    if (cells.length === 1) {
                        sudoku.onlyMoves.push({ idx: cells[0], value: parseInt(v) });
                    }
                }
            }
        }

        if (!sudoku.applyOnlyMoves()) return null;
        if (sudoku.checkSolved()) return {};

        // Rebuild after only moves
        const moves = {};
        for (let i = 0; i < 81; i++) {
            if (sudoku.grid[i]) continue;
            const cands = sudoku.candidates[i];
            if (!cands || cands.size === 0) return null;
            const n = cands.size;
            if (!moves[n]) moves[n] = [];
            moves[n].push({ idx: i, values: [...cands] });
        }

        const minKey = Object.keys(moves).map(Number).sort((a,b) => a-b)[0];
        return minKey ? moves[minKey] : null;
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
                if (Object.keys(moves).length === 0) { failed = true; break; }

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
    // Algorithm 2: Queue (best-first search)
    // -------------------------------------------------------------------------

    _solveQueue() {
        const queue = [this.initial.clone()];
        let nodes = 0;
        const MAX_NODES = 100000;

        while (queue.length && nodes++ < MAX_NODES) {
            // Pop best scored state
            queue.sort((a, b) => a.getScore() - b.getScore());
            const sudoku = queue.shift();

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
        const numAlt = move.values.length - 1;

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
