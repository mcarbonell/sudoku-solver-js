// Measure Tryouts restarts across sudoku test sets using the FIXED source method.
import { Sudoku } from './src/Sudoku.js';
import { SudokuSolver } from './src/SudokuSolver.js';
import { readFileSync } from 'fs';

const SUDOKU_PHP = 'C:/Users/mrcm_/Local/proj/algorithms/sudoku-solver-php/sudokus';

// Disable step recording for measurement speed. Inherits the fixed _solveBacktrackingfm.
class MeasureSolver extends SudokuSolver {
  _record() {}
}

function loadPuzzles(filename, maxLines) {
  const text = readFileSync(`${SUDOKU_PHP}/${filename}`, 'utf8');
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length >= 81);
  return maxLines ? lines.slice(0, maxLines) : lines;
}

function countClues(p) {
  let c = 0;
  for (const ch of p) if (ch !== '.' && ch !== '0' && ch !== ' ') c++;
  return c;
}

function runOnFile(filename, label, maxLines) {
  const puzzles = loadPuzzles(filename, maxLines);
  const results = [];
  let totalTime = 0, solved = 0;
  const restartHist = {};

  for (const p of puzzles) {
    const solver = new MeasureSolver(p);
    const t0 = performance.now();
    solver.solve('backtrackingfm');
    const dt = performance.now() - t0;
    totalTime += dt;
    const s = solver.stats || { restarts: -1, failedAttempts: -1, solved: false };
    if (s.solved) solved++;
    const restarts = s.restarts;
    restartHist[restarts] = (restartHist[restarts] || 0) + 1;
    results.push({ clues: countClues(p), restarts, failed: s.failedAttempts, time: dt, solved: s.solved });
  }

  const rs = results.map(r => r.restarts).sort((a, b) => a - b);
  const pct = q => rs.length ? rs[Math.min(rs.length - 1, Math.floor(q * rs.length))] : 0;
  const avg = rs.reduce((a, b) => a + b, 0) / (rs.length || 1);

  console.log(`\n=== ${label} (${filename}) ===`);
  console.log(`Puzzles: ${puzzles.length} | Solved: ${solved}/${puzzles.length} | Total: ${totalTime.toFixed(1)}ms | Avg/puzzle: ${(totalTime / (puzzles.length || 1)).toFixed(3)}ms`);
  console.log(`Restarts  -> avg: ${avg.toFixed(2)} | min: ${rs[0]} | p50: ${pct(0.5)} | p90: ${pct(0.9)} | p99: ${pct(0.99)} | max: ${rs[rs.length - 1]}`);
  const keys = Object.keys(restartHist).map(Number).sort((a, b) => a - b);
  console.log(`Restart histogram: ` + keys.map(k => `${k}:${restartHist[k]}`).join('  '));
}

console.log('=== Tryouts after FIX (penalize only branch-point guesses) ===');
runOnFile('top20.txt', 'Top 20', null);
runOnFile('top100.txt', 'Top 100 (sample 50)', 50);
runOnFile('top1465.txt', 'Top 1465 (sample 50)', 50);
runOnFile('sudoku17.txt', '17-clue (sample 50)', 50);
runOnFile('opensudoku.very_hard.txt', 'OpenSudoku Very Hard', null);
runOnFile('subig20.txt', 'Subig 20 (sample 50)', 50);
