// Worker: solves a batch of puzzles with ONE algorithm, prints JSON result array.
// Usage: node worker_algo.mjs <algo> <file> [maxLines]
import { Sudoku } from './src/Sudoku.js';
import { SudokuSolver } from './src/SudokuSolver.js';
import { readFileSync } from 'fs';

const [, , algo, file, maxLinesStr] = process.argv;
const maxLines = maxLinesStr ? parseInt(maxLinesStr, 10) : undefined;
const SUDOKU_PHP = 'C:/Users/mrcm_/Local/proj/algorithms/sudoku-solver-php/sudokus';

const text = readFileSync(`${SUDOKU_PHP}/${file}`, 'utf8');
let lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length >= 81);
if (maxLines) lines = lines.slice(0, maxLines);

// Disable step recording for measurement
class M extends SudokuSolver { _record() {} }

const out = [];
for (const p of lines) {
  const s = new M(p);
  const t0 = performance.now();
  let r = null, err = null;
  try { r = s.solve(algo); } catch (e) { err = e.message; }
  const dt = performance.now() - t0;
  out.push({ solved: !!(r && r.checkSolved()), time: Math.round(dt), err });
}
process.stdout.write(JSON.stringify(out));
