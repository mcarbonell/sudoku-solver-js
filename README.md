# Sudoku Solver JS

Interactive Sudoku solver in vanilla JavaScript with step-by-step animation.

**[Live demo](https://mcarbonell.github.io/sudoku-solver-js)**

## Features

- 3 algorithms: Tryouts, Queue, Backtracking
- Step-by-step animation with speed control
- 5 built-in puzzles (Easy → Extreme)
- Paste any 81-digit puzzle
- No dependencies — plain HTML/CSS/JS

## Algorithms

### Tryouts (default)
Stochastic restart with history heuristic. Tracks which `(cell, value)` pairs led
to failures and avoids them on the next attempt. Solves most puzzles in 1–2 nodes.

### Queue
Best-first search over board states scored by a heuristic. Explores the most
promising states first without restarting.

### Backtracking
Iterative deepening with pruning by number of used alternatives. Increases the
allowed branching limit on each iteration until a solution is found.

## Usage

No build step needed. Open `index.html` with any local server:

```bash
npx serve .
# or
python -m http.server 8080
```

Then open `http://localhost:8080`.

> ES modules require a server — opening `index.html` directly via `file://` won't work.

## Project structure

```
sudoku-solver-js/
├── src/
│   ├── Sudoku.js        # Board state, candidates, constraint propagation
│   └── SudokuSolver.js  # Three algorithms with step recording
├── css/
│   └── style.css
├── app.js               # UI, animation, presets
└── index.html
```

## Related

- [sudoku-solver-php](https://github.com/mcarbonell/sudoku-solver-php) — original PHP implementation

## License

MIT — see [LICENSE](LICENSE)
