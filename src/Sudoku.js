// Sudoku board state with candidate tracking and constraint propagation (Optimized V2)

// A candidate value v (1-9) is mapped to bit index v-1.
// So digit 1 is bit 0 (value 1), digit 9 is bit 8 (value 256).
// The full mask for all digits 1-9 is 511 (binary 111111111).
const FULL_MASK = 511;

// Precompute lookup tables for O(1) candidate operations
const POPCOUNT = new Uint8Array(512);     // popcount (number of active candidates) for each mask
const SINGLE_VALUE = new Uint8Array(512); // the single digit (1-9) if mask has exactly 1 candidate, else 0
const VALUES = new Array(512);            // array of active candidate digits for each mask

for (let mask = 0; mask < 512; mask++) {
    const list = [];
    let count = 0;
    let singleVal = 0;
    for (let bit = 0; bit < 9; bit++) {
        if ((mask & (1 << bit)) !== 0) {
            const val = bit + 1;
            list.push(val);
            count++;
            singleVal = val;
        }
    }
    POPCOUNT[mask] = count;
    SINGLE_VALUE[mask] = (count === 1) ? singleVal : 0;
    VALUES[mask] = list;
}

// Precompute peers for each cell index 0..80 to avoid dynamic Set allocations and coordinate math
const PEERS = new Array(81);
for (let i = 0; i < 81; i++) {
    const r = Math.floor(i / 9);
    const c = i % 9;
    const bRow = Math.floor(r / 3) * 3;
    const bCol = Math.floor(c / 3) * 3;
    const peerSet = new Set();
    for (let j = 0; j < 9; j++) {
        peerSet.add(r * 9 + j);       // same row
        peerSet.add(j * 9 + c);       // same col
        peerSet.add((bRow + Math.floor(j / 3)) * 9 + (bCol + j % 3)); // same box
    }
    peerSet.delete(i);
    PEERS[i] = Uint8Array.from(peerSet); // 20 peers as a compact typed array
}

export class Sudoku {
    constructor(input) {
        this.grid = new Array(81).fill(0);         // 0 = empty
        this.candidates = new Array(81).fill(0);   // bitmask per cell (number), null if cell has a value
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
            return; // Skip _initCandidates since it's already copied
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
        this.candidates = other.candidates.slice(); // Fast copy of primitive bitmask numbers!
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
    static box(idx)      { return Math.floor(Math.floor(idx / 9) / 3) * 3 + Math.floor((idx % 9) / 3); }

    _peers(idx) {
        // Return a Set representation to match V1 public peer queries compatibility
        return new Set(PEERS[idx]);
    }

    _initCandidates() {
        // Collect used values per row, col, box using fast integers bitmasks
        const rowUsed = new Uint16Array(9);
        const colUsed = new Uint16Array(9);
        const boxUsed = new Uint16Array(9);

        for (let i = 0; i < 81; i++) {
            const v = this.grid[i];
            if (v) {
                const bit = 1 << (v - 1);
                rowUsed[Math.floor(i / 9)] |= bit;
                colUsed[i % 9] |= bit;
                boxUsed[Math.floor(Math.floor(i / 9) / 3) * 3 + Math.floor((i % 9) / 3)] |= bit;
            }
        }

        for (let i = 0; i < 81; i++) {
            if (this.grid[i]) {
                this.candidates[i] = null;
                continue;
            }
            const r = Math.floor(i / 9);
            const c = i % 9;
            const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);

            const used = rowUsed[r] | colUsed[c] | boxUsed[b];
            const mask = FULL_MASK & ~used;

            this.candidates[i] = mask;
            const count = POPCOUNT[mask];
            if (count === 0) { this.isValid = false; return; }
            if (count === 1) this.onlyMoves.push({ idx: i, value: SINGLE_VALUE[mask] });
        }
    }

    getEmptyCells() {
        const empty = [];
        for (let i = 0; i < 81; i++) if (!this.grid[i]) empty.push(i);
        return empty;
    }

    numEmpty() {
        let count = 0;
        for (let i = 0; i < 81; i++) if (!this.grid[i]) count++;
        return count;
    }

    checkSolved() {
        if (!this.isValid) return false;
        for (let i = 0; i < 81; i++) if (this.grid[i] === 0) return false;
        return true;
    }

    setValue(idx, value) {
        if (this.grid[idx]) return this.grid[idx] === value;

        this.grid[idx] = value;
        this.candidates[idx] = null;
        this.moveHistory.push({ idx, value });

        const bit = 1 << (value - 1);
        const peers = PEERS[idx];
        const len = peers.length;
        for (let i = 0; i < len; i++) {
            const peer = peers[i];
            if (this.grid[peer]) continue;
            const mask = this.candidates[peer];
            if (mask === null) continue;
            if ((mask & bit) !== 0) {
                const nextMask = mask & ~bit;
                this.candidates[peer] = nextMask;
                const count = POPCOUNT[nextMask];
                if (count === 0) { this.isValid = false; return false; }
                if (count === 1) this.onlyMoves.push({ idx: peer, value: SINGLE_VALUE[nextMask] });
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
        for (let i = 0; i < 81; i++) {
            const mask = this.candidates[i];
            if (mask !== null) numCandidates += POPCOUNT[mask];
        }
        return this.numEmpty() * 10 + numCandidates * 10 + (this.usedAlternatives || 0) * 100000 + alt * 100;
    }
}

// Expose POPCOUNT, SINGLE_VALUE, and VALUES helpers to solver
export { POPCOUNT, SINGLE_VALUE, VALUES };
