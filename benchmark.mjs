// Benchmark the 3 algorithms: solved%, time, nodes, and memory (max live states + clones allocated).
import { Sudoku } from './src/Sudoku.js';
import { SudokuSolver } from './src/SudokuSolver.js';
import { readFileSync } from 'fs';

const SUDOKU_PHP = 'C:/Users/mrcm_/Local/proj/algorithms/sudoku-solver-php/sudokus';

class MeasureSolver extends SudokuSolver { _record() {} }

function loadPuzzles(filename, maxLines) {
  const text = readFileSync(`${SUDOKU_PHP}/${filename}`, 'utf8');
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length >= 81);
  return maxLines ? lines.slice(0, maxLines) : lines;
}

// Per-algorithm metrics extraction
function metrics(algo, s) {
  const st = s.stats || {};
  if (algo === 'queue') {
    return { nodes: st.nodes || 0, maxStates: st.maxQueue || 0, clones: st.clones || 0 };
  }
  if (algo === 'backtrackingfm') {
    return { nodes: st.restarts || 0, maxStates: st.maxDepth || 0, clones: st.restarts || 0 };
  }
  // backtracking
  return { nodes: st.nodes || 0, maxStates: st.maxDepth || 0, clones: st.nodes || 0 };
}

const ALGOS = ['backtrackingfm', 'queue', 'backtracking'];

function pct(arr, q) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(q * a.length))];
}
function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

const TASKS = [
  { file: 'top20.txt', label: 'Top 20 (hardest)', max: null },
  { file: 'top100.txt', label: 'Top 100', max: 50 },
  { file: 'sudoku17.txt', label: '17-clue', max: 50 },
  { file: 'subig20.txt', label: 'Subig 20', max: 50 },
  { file: 'opensudoku.very_hard.txt', label: 'OpenSudoku VH', max: 100 },
];

const globalAgg = {};
for (const a of ALGOS) globalAgg[a] = { nodes: [], maxStates: [], clones: [], times: [], solved: 0, total: 0 };

for (const task of TASKS) {
  const puzzles = loadPuzzles(task.file, task.max);
  console.log(`\n=== ${task.label} — ${puzzles.length} puzzles ===`);
  console.log(`${'algo'.padEnd(12)} ${'solv'.padEnd(6)} ${'avgMs'.padEnd(8)} ${'avgN'.padEnd(8)} ${'p90N'.padEnd(8)} ${'maxN'.padEnd(8)} ${'avgStates'.padEnd(10)} ${'avgClones'.padEnd(10)}`);
  for (const algo of ALGOS) {
    let solved = 0, totalMs = 0;
    const nodesArr = [], statesArr = [], clonesArr = [], timesArr = [];
    for (const p of puzzles) {
      const solver = new MeasureSolver(p);
      const t0 = performance.now();
      solver.solve(algo);
      const dt = performance.now() - t0;
      const m = metrics(algo, solver);
      const ok = solver.stats && solver.stats.solved;
      if (ok) { solved++; totalMs += dt; timesArr.push(dt); nodesArr.push(m.nodes); statesArr.push(m.maxStates); clonesArr.push(m.clones); }
      globalAgg[algo].nodes.push(m.nodes);
      globalAgg[algo].maxStates.push(m.maxStates);
      globalAgg[algo].clones.push(m.clones);
      globalAgg[algo].times.push(dt);
      globalAgg[algo].total++;
      if (ok) globalAgg[algo].solved++;
    }
    const avgMs = solved ? (totalMs / solved) : 0;
    console.log(
      `${algo.padEnd(12)} ${`${solved}/${puzzles.length}`.padEnd(6)} ${avgMs.toFixed(3).padEnd(8)} ` +
      `${avg(nodesArr).toFixed(1).padEnd(8)} ${pct(nodesArr, 0.9).toFixed(0).padEnd(8)} ${Math.max(0,...nodesArr).toString().padEnd(8)} ` +
      `${avg(statesArr).toFixed(1).padEnd(10)} ${avg(clonesArr).toFixed(1).padEnd(10)}`
    );
  }
}

console.log(`\n=== GLOBAL (all puzzles combined) ===`);
console.log(`${'algo'.padEnd(12)} ${'solv%'.padEnd(7)} ${'avgN'.padEnd(8)} ${'p90N'.padEnd(8)} ${'maxN'.padEnd(9)} ${'avgStates'.padEnd(10)} ${'avgClones'.padEnd(10)}`);
for (const algo of ALGOS) {
  const g = globalAgg[algo];
  const solvPct = (100 * g.solved / g.total).toFixed(1);
  console.log(
    `${algo.padEnd(12)} ${solvPct.padEnd(7)} ${avg(g.nodes).toFixed(1).padEnd(8)} ` +
    `${pct(g.nodes, 0.9).toFixed(0).padEnd(8)} ${Math.max(...g.nodes).toString().padEnd(9)} ` +
    `${avg(g.maxStates).toFixed(1).padEnd(10)} ${avg(g.clones).toFixed(1).padEnd(10)}`
  );
}
console.log('\nMetrics:');
console.log('  nodes     = decision/branch attempts explored (search effort)');
console.log('  maxStates = peak concurrent board states held in memory (backtrackingfm/backtracking = recursion depth, queue = queue length)');
console.log('  clones    = total board clones allocated (allocation pressure)');
