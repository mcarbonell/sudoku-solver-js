// Sudoku board state with candidate tracking and constraint propagation

export class Sudoku {
    constructor(input) {
        this.grid = new Array(81).fill(0);         // 0 = empty
        this.candidates = new Array(81).fill(null); // Set per cell
        this.isValid = true;
        this.moveHistory = [];
        this.onlyMoves = [];
        this.onlyMovesDone = 0;

        if (typeof input === 'string') {
            this._loadString(input);
        } else if (Array.isArray(input)) {
            this._loadArray(input);
        } else if (input instanceof Sudoku) {
            this._copyFrom(input);
        }

        this._initCandidates();
    }

    clone() {
        return new Sudoku(this);
    }

    _loadString(str) {
        for (let i = 0; i < 81; i++) {
            const c = str[i];
            this.grid[i] = (c && c !== '0' && c !== '.') ? parseInt(c) : 0;
        }
    }

    _loadArray(rows) {
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const ch = rows[r][c];
                this.grid[r * 9 + c] = (ch && ch !== ' ' && ch !== '0') ? parseInt(ch) : 0;
            }
        }
    }

    _copyFrom(other) {
        this.grid = other.grid.slice();
        this.candidates = other.candidates.map(s => s ? new Set(s) : null);
        this.isValid = other.isValid;
        this.moveHistory = other.moveHistory.slice();
        this.onlyMoves = other.onlyMoves.map(m => ({ ...m }));
        this.onlyMovesDone = other.onlyMovesDone;
        this.alternatives = other.alternatives;
        this.usedAlternatives = other.usedAlternatives;
    }

    static idx(row, col) { return row * 9 + col; }
    static row(idx)      { return Math.floor(idx / 9); }
    static col(idx)      { return idx % 9; }
    static box(idx)      { return Math.floor(Sudoku.row(idx) / 3) * 3 + Math.floor(Sudoku.col(idx) / 3); }

    _peers(idx) {
        const r = Sudoku.row(idx), c = Sudoku.col(idx);
        const bRow = Math.floor(r / 3) * 3, bCol = Math.floor(c / 3) * 3;
        const peers = new Set();
        for (let i = 0; i < 9; i++) {
            peers.add(r * 9 + i);       // same row
            peers.add(i * 9 + c);       // same col
            peers.add((bRow + Math.floor(i / 3)) * 9 + (bCol + i % 3)); // same box
        }
        peers.delete(idx);
        return peers;
    }

    _initCandidates() {
        // Collect used values per row, col, box
        const rowUsed = Array.from({length: 9}, () => new Set());
        const colUsed = Array.from({length: 9}, () => new Set());
        const boxUsed = Array.from({length: 9}, () => new Set());

        for (let i = 0; i < 81; i++) {
            const v = this.grid[i];
            if (v) {
                rowUsed[Sudoku.row(i)].add(v);
                colUsed[Sudoku.col(i)].add(v);
                boxUsed[Sudoku.box(i)].add(v);
            }
        }

        for (let i = 0; i < 81; i++) {
            if (this.grid[i]) {
                this.candidates[i] = null;
                continue;
            }
            const cands = new Set();
            for (let v = 1; v <= 9; v++) {
                if (!rowUsed[Sudoku.row(i)].has(v) &&
                    !colUsed[Sudoku.col(i)].has(v) &&
                    !boxUsed[Sudoku.box(i)].has(v)) {
                    cands.add(v);
                }
            }
            this.candidates[i] = cands;
            if (cands.size === 0) { this.isValid = false; return; }
            if (cands.size === 1) this.onlyMoves.push({ idx: i, value: [...cands][0] });
        }
    }

    getEmptyCells() {
        const empty = [];
        for (let i = 0; i < 81; i++) if (!this.grid[i]) empty.push(i);
        return empty;
    }

    numEmpty() { return this.getEmptyCells().length; }

    checkSolved() {
        return this.isValid && this.grid.every(v => v !== 0);
    }

    setValue(idx, value) {
        if (this.grid[idx]) return this.grid[idx] === value;

        this.grid[idx] = value;
        this.candidates[idx] = null;
        this.moveHistory.push({ idx, value });

        for (const peer of this._peers(idx)) {
            if (this.grid[peer]) continue;
            const cands = this.candidates[peer];
            if (!cands) continue;
            if (cands.has(value)) {
                cands.delete(value);
                if (cands.size === 0) { this.isValid = false; return false; }
                if (cands.size === 1) this.onlyMoves.push({ idx: peer, value: [...cands][0] });
            }
        }
        return true;
    }

    applyOnlyMoves() {
        while (this.onlyMoves.length) {
            const { idx, value } = this.onlyMoves.shift();
            if (this.grid[idx]) continue;
            if (!this.setValue(idx, value)) return false;
            this.onlyMovesDone++;
        }
        return this.isValid;
    }

    getScore() {
        const alt = (this.alternatives || 0) + 1;
        let numCandidates = 0;
        for (let i = 0; i < 81; i++) if (this.candidates[i]) numCandidates += this.candidates[i].size;
        return this.numEmpty() * 10 + numCandidates * 10 + (this.usedAlternatives || 0) * 100000 + alt * 100;
    }
}
