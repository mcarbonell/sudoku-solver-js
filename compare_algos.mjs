// Parent: runs each (algo, file) batch in a child process with a hard OS-level
// timeout, so a runaway synchronous solve cannot hang the measurement.
import { spawn } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

const ALGOS = ['backtrackingfm', 'queue', 'backtracking'];
const TASKS = [
  { file: 'top20.txt', label: 'Top 20', max: null, budgetMs: 150000 },
  { file: 'top100.txt', label: 'Top 100 (sample 20)', max: 20, budgetMs: 150000 },
  { file: 'sudoku17.txt', label: '17-clue (sample 20)', max: 20, budgetMs: 150000 },
  { file: 'opensudoku.very_hard.txt', label: 'OpenSudoku VH (sample 20)', max: 20, budgetMs: 60000 },
  { file: 'subig20.txt', label: 'Subig 20 (sample 20)', max: 20, budgetMs: 60000 },
];

function runWorker(algo, file, max) {
  return new Promise((resolve) => {
    const args = max == null ? [algo, file] : [algo, file, String(max)];
    const child = spawn('node', ['worker_algo.mjs', ...args], { cwd: process.cwd() });
    let data = '', finished = false;
    child.stdout.on('data', d => data += d);
    child.stderr.on('data', d => process.stderr.write(d));
    const timer = setTimeout(() => {
      if (!finished) { try { child.kill('SIGKILL'); } catch {} resolve({ timedOut: true, raw: data }); }
    }, TASKS.find(t => t.file === file).budgetMs);
    child.on('close', () => {
      finished = true; clearTimeout(timer);
      try { resolve({ results: JSON.parse(data) }); }
      catch { resolve({ timedOut: data.length === 0, raw: data }); }
    });
  });
}

(async () => {
  const report = {};
  for (const task of TASKS) {
    const perAlgo = {};
    for (const a of ALGOS) {
      const res = await runWorker(a, task.file, task.max);
      perAlgo[a] = res;
    }
    report[task.label] = perAlgo;

    console.log(`\n=== ${task.label} (${task.file}) ===`);
    // Build per-puzzle matrix across algos (only where all returned)
    const n = Math.max(
      ...ALGOS.map(a => perAlgo[a].results ? perAlgo[a].results.length : 0)
    );
    const counts = {};
    for (const a of ALGOS) {
      const r = perAlgo[a];
      if (r.timedOut) { console.log(`  ${a.padEnd(12)} TIMED OUT / no data`); counts[a] = null; continue; }
      const solved = r.results.filter(x => x.solved).length;
      const avg = solved ? (r.results.filter(x=>x.solved).reduce((s,x)=>s+x.time,0)/solved).toFixed(1) : '-';
      console.log(`  ${a.padEnd(12)} solved: ${solved}/${r.results.length}  avgTime(solved): ${avg}ms`);
      counts[a] = solved;
    }
    // cross-check
    let all=0, none=0, tryOnly=0, othersNotTry=0;
    for (let i=0;i<n;i++){
      const t = perAlgo.backtrackingfm.results?.[i]?.solved;
      const q = perAlgo.queue.results?.[i]?.solved;
      const b = perAlgo.backtracking.results?.[i]?.solved;
      if (t==null||q==null||b==null) continue;
      const sum = (t?1:0)+(q?1:0)+(b?1:0);
      if (sum===3) all++; else if (sum===0) none++;
      else { if (t && !(q&&b)) tryOnly++; if (!t && (q||b)) othersNotTry++; }
    }
    console.log(`  [cross] all3: ${all} | none: ${none} | backtrackingfm-only: ${tryOnly} | others-not-backtrackingfm: ${othersNotTry}`);
  }
  writeFileSync('compare_results.json', JSON.stringify(report, null, 2));
  console.log('\nSaved compare_results.json');
})();
