# Emulation of the *Drosophila Fly* Brain

Whole-brain leaky integrate-and-fire model of the adult fruit fly, built from the
[FlyWire](https://flywire.ai/) connectome (~138k neurons, ~5M synapses).
Activate and silence arbitrary neurons; observe downstream spike propagation.

Based on the paper
[*A leaky integrate-and-fire computational model based on the connectome of the
entire adult Drosophila brain reveals insights into sensorimotor processing*](https://www.biorxiv.org/content/10.1101/2023.05.02.539144v1)
(Shiu et al.).

## Usage

With this computational model, one can manipulate the neural activity of a set of _Drosophila_ neurons.
The output of the model is the spike times and rates of all affected neurons.

Two types of manipulations are currently implemented:
- *Activation*:
Neurons can be activated at a fixed frequency to model optogenetic activation.
This triggers Poisson spiking in the target neurons. 
Two sets of neurons with distinct frequencies can be defined.
- *Silencing*:
In addition to activation, a different set of neurons can be silenced to model optogenetic silencing.
This sets all synaptic connections to and from those neurons to zero.

The entrypoint is [main.py](main.py), which parses CLI arguments and calls
[code/benchmark.py](code/benchmark.py) -- the central orchestrator that dispatches
to framework-specific runners:
[run_brian2_cuda.py](code/run_brian2_cuda.py),
[run_pytorch.py](code/run_pytorch.py),
[run_nestgpu.py](code/run_nestgpu.py), and
[run_genn.py](code/run_genn.py). The optional Brian2GeNN backend lives in
[run_brian2_genn.py](code/run_brian2_genn.py) and uses a separate conda
environment because Brian2GeNN 1.7.0 pins Brian2<2.6 while Brian2CUDA uses
Brian2 2.8.0.

```bash
# Run the 5 main-environment frameworks with default durations (0.1s–1000s)
# and trials (1,4,8,16,32)
python main.py

# Specific durations and trial count
python main.py --t_run 0.1 1 10 --n_run 1

# Single framework
python main.py --nestgpu --t_run 1 --n_run 1
python main.py --genn --t_run 1 --n_run 1
python main.py --brian2genn --t_run 1 --n_run 1

# Combine frameworks
python main.py --brian2-cpu --pytorch --t_run 0.1 1 --n_run 1 4 8 16 32

# Five-round Nature-paper benchmark suite
# Uses the March grid: t_run=(0.1,1,10,100), n_run=(1,4,8,16,32), 5 core backends
python main.py --paper --run-label nature_2026_07

# Add Brian2GeNN as the 6th framework from the brain-fly-brian2genn environment
python main.py --brian2genn --paper --run-label nature_2026_07
```

Results are incrementally saved to `data/benchmark-results.csv` as each
benchmark completes, with separate columns for setup time (loading, compilation)
and simulation time (the always-on cost). For repeated paper runs, the CSV keeps
the original March rows and appends new rows keyed by `run_label` and `round`;
the corresponding spike parquet path is recorded in `spike_path`.

Spike timing exports are written to parquet outside the timed simulation section
so file I/O does not contaminate `sim_time`. GeNN additionally flushes bounded
on-device spike-recording windows during long batched runs; that transfer time
is tracked as result collection rather than simulation time. A labeled paper run
writes partitioned outputs like:

```text
data/results/nature_2026_07/
├── manifest.csv
├── checksums.sha256
├── round_01/
│   ├── brian2cpp_t1.0s_n1.parquet
│   ├── brian2cuda_t1.0s_n1.parquet
│   ├── pytorch_t1.0s_n1.parquet
│   ├── nestgpu_t1.0s_n1.parquet
│   ├── genn_t1.0s_n1.parquet
│   └── brian2genn_t1.0s_n1.parquet
└── round_02/
```

The consolidated publication bundle contains 600 spike parquet files: 20 grid
points for each of six frameworks across five rounds. The `no_io/` subfolder
contains the corresponding one-round, 120-row timing dataset collected with
spike probing and output disabled; it intentionally contains no spike parquet
files.

Each spike parquet has one row per spike. The canonical timing column for new
exports is `time_ms`, with `trial`, `neuron_index`, `flywire_id`, and `exp_name`.
The legacy `t` column is kept for existing analysis scripts.

The full `nature_2026_07` spike parquet bundle is too large for regular Git
tracking, so parquet files are intentionally gitignored. The committed metadata
files are `manifest.csv` and `checksums.sha256`; the full bundle is stored in
Google Drive:

https://drive.google.com/drive/folders/1jiSfb5lNfm9gwP0YyyRz5ATIrDpBAcjs

After downloading the Drive folder into `data/results/nature_2026_07/`, verify
the bundle with:

```bash
cd data/results/nature_2026_07
sha256sum -c checksums.sha256
```

### Ground truth comparison

Brian2 (CPU) serves as the ground truth for neural accuracy: it implements the
canonical LIF model from
[Shiu et al. (Nature 2024)](https://www.nature.com/articles/s41586-024-07763-9),
which achieved 91% prediction accuracy against experimental _Drosophila_ data.
Each backend also saves per-neuron spike trains to `data/results/`, and a
comparison script measures how closely the other backends reproduce Brian2's
output:

```bash
python code/compare_ground_truth.py                  # default: t_run=1s, n_run=1
python code/compare_ground_truth.py --t_run 10 --n_run 4   # longer / averaged
python code/compare_ground_truth.py --run-label nature_2026_07 --round 1
```

This computes active-neuron overlap (Jaccard), per-neuron firing-rate
correlation, and spike-count ratios, and writes structured results to
`data/ground-truth-comparison.json`.

For all-framework pairwise comparisons, including firing-rate parity rows and
spike-time matches within a tolerance window, use:

```bash
python code/compare_spike_outputs.py \
  --run-label nature_2026_07 \
  --round 1 \
  --output-dir data/results/nature_2026_07/comparisons
```

This writes `pairwise_summary.csv`, `pairwise_summary.json`,
`parity_rates.csv`, and `missing_inputs.json`. The pairwise summary has one row
per framework pair and `t_run`/`n_run` combination.

For paper-support parity files comparing one backend against Brian2 CPU across
all five labeled rounds, use:

```bash
python code/compare_backend_to_brian2.py \
  --run-label nature_2026_07 \
  --backend brian2genn \
  --output-dir data/results/nature_2026_07/comparisons
```

This writes `<backend>_vs_brian2_rate_summary.csv/json`,
`<backend>_vs_brian2_rate_parity.csv`, and
`<backend>_vs_brian2_missing_inputs.json`. Add `--include-timing` only for
smaller targeted checks where greedy spike-time matching is scientifically
useful and computationally reasonable.

## Drosophila Neural Ludo

The web app opens on a game: a 3D Ludo match in an open-air stadium under a
sky, with a neural core at the centre of the board. The Neural Lab described
below is one click away from its menu.

Three populations, kept visually distinct, because confusing them is the
easiest way to make a board game unreadable:

```
  coins    the playing pieces -- bevelled discs with a Drosophila emblem
  flies    the players -- one full Drosophila per seat, at the rail
  crowd    the audience -- a few thousand humans and flies in the stands
```

```
        the app
        ├── Drosophila Neural Ludo   plays immediately, loads nothing
        └── Neural Lab               the connectome instrument, ~8 MB, on demand
```

### Playing

```bash
cd web
npm install
npm run dev          # http://localhost:5173
```

Quick Play starts you against three computer flies. Roll with SPACE or by
clicking the die; coins you may legally move glow, and a ring marks where each
one would land. Keys: `SPACE` roll, `Q` neural view, `D` developer overlay,
`ESC` pause, `1`-`6` camera presets (play, top, player, core, dice, wide).

New Match sets the table: **0 to 3 opponents**, your colour, how hard the
flies play, sun or night, and the rules themselves -- pieces per player, extra
turn on a six or after a capture, captures on or off, exact roll to finish,
turn timer. Every one of those is read by the engine, not just displayed.
Nought opponents is a practice board to yourself; the match then ends when all
four of your coins are home. Only seats actually in the match get a fly, a
banner, a dice plinth and a turn -- a two-player game does not leave two empty
stations pretending to compete.

The setup and the comfort settings are remembered between visits. An
in-progress match is not: there is no serialisation contract that would make
restoring one safe, and a half-restored game is worse than no save at all.

### Who starts

Nobody is hard-coded to go first. The match opens on a roll-off: every seat
rolls once, in seat order, its own fly flying in to throw its own die, and the
highest starts. Ties reroll -- **only among the tied seats**, as many rounds as
it takes.

```
  round 1   seat 0: 5   seat 1: 6   seat 2: 2   seat 3: 6
  round 2   seat 1: 3   seat 3: 3                     tied again
  round 3   seat 1: 4   seat 3: 1                     seat 1 starts
```

Play then runs clockwise from whoever won. A solo practice board skips the
roll-off, there being nothing to decide. The whole thing lives in the reducer
with the rest of the rules, so it is reproducible from the match seed and is
covered by its own suite -- including a check that no colour is favoured over
240 matches.

### The board

A classic cross-shaped Ludo board on a 15x15 grid, sitting inside a circular
stadium. The stadium is round; the board is not, because a ring of 52 cells is
not a Ludo board and nobody can read their way home on one.

```
        0 1 2 3 4 5 6 7 8 9 . . . . .        # track      * protected
   0    · · · · · · # # # · · · · · ·        0-3 home column
   1    · d · · d · # 0 * · a · · a ·        a-d parked piece
   2    · · · · · · * 0 # · · · · · ·        C  neural core
   3    · · · · · · # 0 # · · · · · ·
   4    · d · · d · # 0 # · a · · a ·        corners, clockwise:
   5    · · · · · · # 0 # · · · · · ·          RED, YELLOW, GREEN, BLUE
   6    # * # # # # · · · # # # * # #
   7    # 3 3 3 3 3 · C · 1 1 1 1 1 #        52-cell track
   8    # # * # # # · · · # # # # * #        4 x 5-cell home columns
   9    · · · · · · # 2 # · · · · · ·        8 protected cells
  10    · c · · c · # 2 # · b · · b ·        3x3 finishing square
  11    · · · · · · # 2 # · · · · · ·
  12    · · · · · · # 2 * · · · · · ·
  13    · c · · c · * 2 # · b · · b ·
  14    · · · · · · # # # · · · · · ·
```

Each seat enters two cells clockwise of its own arm tip, travels 51 track
cells, then turns down its own coloured column to the core -- 57 steps in all.
Every cell is a raised bevelled tile, not a painted square.

The layout is generated from twelve straight runs rather than a table of 52
hand-typed pairs, and `validateBoard` proves the result at startup: a closed
loop, orthogonally adjacent except at exactly the four inside corners, every
personal index resolving to a cell, every column adjacent to its tip and one
step from the centre, and no base overlapping the track. The game refuses to
hide a bad board -- it prints the problems on screen.

### Architecture

The rules are a pure state machine with no Three.js, no React, no clock and no
`Math.random`. That is what makes them testable, replayable and -- when a
server exists -- runnable unchanged on both sides of a connection.

| Layer | Location | Depends on |
| --- | --- | --- |
| Rules | `web/src/game/{types,rules,board,engine,rng}.ts` | nothing |
| Behaviour | `web/src/game/neural/` | the rules |
| Crowd reactions | `web/src/game/crowd.ts` | the event stream |
| Move resolution | `web/src/game/resolve.ts` | the rules |
| Fly behaviour states | `web/src/game/flyState.ts` | the phase, the errand |
| Carrying a coin | `web/src/game/carry.ts` | the board, a committed move |
| Brain readout | `web/src/game/neural/state.ts` | the event stream |
| Day/night presets | `web/src/game/environment.ts` | nothing |
| Preferences | `web/src/game/persist.ts` | nothing |
| Computer players | `web/src/game/ai.ts` | the behaviour pipeline |
| Match store | `web/src/game/store.ts` | the rules, the pipeline |
| Clock and input | `web/src/game/driver.ts` | the store |
| Scene | `web/src/game/render/` | the store, Three.js |
| Interface | `web/src/game/ui/` | the store |
| Online protocol | `web/src/game/net/` | the rules |

The dice value is decided by a seeded generator inside the reducer *before*
anything is drawn; the die then animates to that face. A match is reproducible
from its seed, which the result screen prints.

Once the die has settled there is exactly one rule for what happens next,
in `resolve.ts`, and the driver, the coin highlighting and the tests all ask
it rather than keeping their own copy:

```
  no legal moves     ->  the turn advances by itself
  one legal move     ->  it plays itself, after a beat showing which coin
  several, human     ->  those coins light up and it waits for a click
  several, computer  ->  the behaviour system chooses
```

A polished Ludo game never asks you to click the only coin you may move, and
never skips a turn you could have played. Both are that function's job and
both are tested. `D` opens a developer overlay showing the live phase, the
RNG cursor, the legal move list, the errand in progress, the six brain
channels and what each fly is doing -- because "the AI thinks" is an easy
claim and a hard one to check. In a development build every transition is
also traced to the console, and a transient phase that fails to advance
within twelve seconds says so by name.

### The stadium

An open-air bowl under a gradient sky: concourse, twelve rows of raked seating
broken by four vomitories, a cantilevered roof with floodlight masts, corner
banners in the active players' colours, and a working scoreboard mounted on
the far stand.

The crowd is around 2,800 humans and 400 flies at high quality, as two
InstancedMeshes with **zero per-frame CPU cost**: the bobbing and cheering
happen in the vertex shader from a per-instance phase and one `uExcitement`
uniform. Writing three thousand matrices a frame from JavaScript is the one
thing guaranteed to sink a scene like this.

The sky is a shader dome, a sun and two belts of instanced billboard clouds --
three draw calls, no textures. The bowl is deliberately twelve rows rather
than a realistic twenty: a taller stand swallows the horizon from the gameplay
camera, and an open-air stadium showing no sky is just a room.

### Day and night

Two environments, chosen before the match or switched live from Settings. They
are the same stadium with a different preset in `environment.ts` -- one set of
numbers for sky, key light, fill, fog, floodlights and exposure. Duplicating
the scene for a night variant would double the geometry and guarantee the two
drift apart.

| | Sun | Night |
| --- | --- | --- |
| Sky | blue gradient, sun disc, clouds | deep blue gradient, moon with maria, 1,400 stars |
| Key light | 2.5, warm | 0.55, cool -- moonlight, and nowhere near enough |
| Floodlights | 40, decorative | 190, doing the work |
| Board | as lit | `boardLift` emissive push on the tiles |

The constraint both are tuned against is that **the board stays readable**.
Night is darker in the sky and the stands, not on the playing surface: the
floodlights come up to compensate, which is what a real stadium does. The
night sky is deep blue rather than black, for the same reason a night match on
television is not a black screen.

### Crowd reactions

`crowd.ts` maps game events to how loud the stands get, as a pure function:

| Event | Mood | Excitement |
| --- | --- | --- |
| Turn starts | Attentive | 0.18 |
| Dice rolled | Attentive | 0.34 |
| Coin moves | Attentive | 0.24 |
| Coin reaches the core | Excited | 0.76 |
| Capture | Excited | 0.88 |
| Player finishes | Celebrating | 1.0 |
| Match won | Celebrating | 1.0, held 12 s |

A batch takes its loudest event rather than its last, a quiet event cannot
damp a loud one that is still being held, and it settles to a floor rather
than to silence -- a stadium with a match on is never completely still.

### The flies

The players are the full procedural Drosophila from `web/src/three` --
compound eyes, segmented abdomen, six legs, swept wings -- and there are only
ever two to four of them, so the detail is affordable.

**They roll the dice.** When a turn begins the fly wakes, flies in along its
own spoke to the dice plinth, pitches forward and beats its wings hard while
the die tumbles, watches the result, then flies home. This includes your fly
on your turn: a person rolling gets the same approach, the same dip and the
same six-flourish an opponent does.

What each fly is doing is an explicit state machine in `flyState.ts`, a pure
function of the engine's phase plus two facts the renderer owns -- has it
arrived, is the die in the air:

```
  IDLE  WATCHING  APPROACHING_DICE  ROLLING  THINKING
  OBSERVING_BOARD  CELEBRATING  RETURNING
```

Each state carries its own perch, bob, wingbeat, pitch and effort, so the
animation is a consequence of the turn rather than something running beside
it -- and the die lands on the face the engine had already chosen before the
fly left its station. A six is celebrated over the plinth; winning the match
is celebrated above the board. Being pure, the whole thing is tested without
a canvas, including that every declared state is reachable and no input can
produce one that is not.

The coins are not flies. They are bevelled discs with a small Drosophila
struck into the face, which keeps the pieces reading as pieces from across
the table.

### The fly carries the coin

This is the mechanic that makes it this game rather than Ludo with a fly
drawn beside it. **A coin never travels the board by itself.** You choose it;
a fly fetches it:

```
  you pick a coin
        -> the brain registers it        attention peaks, motor prepares
        -> the fly leaves its station
        -> it lowers onto the coin and lifts it
        -> it flies the route the rules walked, cell by cell
        -> it lowers onto the destination and lets go
        -> the turn continues; the fly heads home over the top of it
```

The obvious way to build that is two animations -- a fly that flies and a
coin that slides -- and the obvious way for it to break is that they drift
apart, because they start from different clocks and ease differently. So
there are not two animations. There is one plan, built from the engine's own
committed move, and both the fly and the coin are read from it every frame:

```ts
planCarry(move, board)  ->  CarryPlan     // made once, on TOKEN_MOVED
sampleCarry(plan, now)  ->  CarrySample   // read each frame, by both
```

While the sample says `carrying`, the coin's position *is* the fly's carry
point -- slung below and behind it, where the gameplay camera can see it.
That is attachment, expressed as shared state rather than as reparenting,
which in React would mean two components fighting over one `Object3D`.

The plan is pure arithmetic over number tuples, with `now` passed in, so the
whole errand can be tested by reading it at several hundred instants and
checking the story: the stages run once each in order, the coin is picked up
before it moves and put down before the turn continues, it never jumps more
than a cell, and it passes over every square the rules walked it through
rather than teleporting from the fifteenth to the nineteenth.

The computer players use exactly the same path. The only difference between
a human turn and a fly's is who names the coin -- the fetching, the carrying
and the placing are one implementation.

Reduced motion shortens every leg and skips none of them: the coin is still
seen to be fetched, held and placed.

### The behaviour system

Every computer player runs the same pipeline, and the game shows it running:

```
  game state
      -> legal moves            from the engine; the only source
      -> sensory encoder        7 normalised channels
      -> neural processor       7 -> 4 -> 4, hand-authored weights
      -> utility weights        intent tilts them
      -> score every legal move 5 components per move
      -> lookahead              HARD only, one ply of replies
      -> pick
      -> engine validates on dispatch
```

The seven channels are threat, reward, freedom, risk, shelter, progress and
tempo. The four hidden units stand for pressure, opportunity, endgame and
development. The four outputs are intents -- attack, defend, progress,
finish -- which tilt the weights the move scorer uses.

The panel on the right of the HUD shows all of it live, and the Neural Core's
three shells are lit by the three stages, so what is on screen is what
produced the move rather than an animation running alongside one. On a human's
turn the same pipeline runs in observe-only mode, so the readout describes the
position in front of you instead of going blank.

**The live readout.** Above that panel are six channels -- vision, attention,
decision, motor, reward, threat -- which are not the decision pipeline but
the fly's moment-to-moment state, and they move for one reason only:

```
  game event  ->  NeuralEvent  ->  NeuralState  ->  the bars
```

There is no other entry point, no interval and no `Math.random`, and with
nothing happening the state decays to rest. So attention peaks exactly when a
coin is chosen, motor peaks while one is being carried, and reward peaks on a
capture or a coin reaching the core. If the bars are moving, something
happened. The easing is by elapsed time rather than per frame, so the readout
behaves the same at 30fps and 144.

**When it breaks.** The behaviour system is a readout, not a referee. If it
throws, the move falls back to the engine's own ordering, the overlay says
so, and the match carries on -- a failed visualisation must never strand a
player mid-turn.

**The invariant.** The pipeline is handed the engine's legal move list and can
only ever return something from it. There is no path by which a network output
becomes a board action without passing the rules first; `neural.test.ts`
exercises that across ~500 decisions covering every seat, every die face and
every difficulty.

**What it is not.** A small hand-authored network expressing game heuristics.
It is not fitted to neural data, it is not the Drosophila connectome, and a
real fly does not play Ludo. The weights were written by hand precisely so the
displayed activations mean something nameable rather than being a black box.
The measured connectome -- 138,639 neurons, 15,091,983 connections -- and the
spiking model this repository actually simulates are in the Neural Lab, and
both the HUD panel and the neural view say so on screen.

### Multiplayer

**Local play works now**: two to four people on one device in any mix with
computer opponents, turns passing around the table.

**Online rooms do not.** The protocol is written down in
`web/src/game/net/protocol.ts` -- room lifecycle, intents, events,
reconnection, and the list of things a server must validate -- and the client
reads `onlineStatus()` from one place and tells the player plainly that no
server is configured. There is no game server in this repository; the Python
service under `server/` runs neural simulations and knows nothing about
matches. Point `VITE_GAME_SERVER_URL` at a server speaking that protocol and
online play becomes reachable without touching the game.

### Tests

```bash
npm test
```

209 tests over twelve suites, bundled by esbuild and run by `node --test`,
with no test-framework dependency:

- **engine** -- board generation and its self-check, path mapping, legal
  moves, release, exact finish, captures, protected cells, phase transitions
  and the rejection of illegal ones, extra turns, three-sixes forfeit, winner
  ranking, complete matches for thirty seeds, and determinism.
- **setup** -- every colour against every opponent count: the right number of
  seats, the human listed first, who starts decided by rolling rather than by
  who set the match up, no duplicated colour, no coin belonging to a seat that
  is not playing, difficulty applied to every opponent, and the solo board
  neither ending on move zero nor failing to end at all.
- **firstplayer** -- the roll-off: one roll per contender, highest starts,
  ties rerolling only the tied seats, resolving for two, three and four
  players, skipped when solo, no colour favoured over 240 matches, actions
  refused at the wrong moment, and reproducible from the seed.
- **neural** -- sensory channels in range, the network's distribution summing
  to one, weights never negative, utility ranking, and the invariant: across
  every seat, die face and difficulty, the pipeline only returns a move it was
  offered and only moves its own coins.
- **store** -- whole matches driven through the store's own actions, checking
  every committed move queues exactly one animation.
- **ui** -- every screen rendered with `react-dom/server` against real game
  states, so a crash on first paint fails the build rather than the player.
- **environment** -- the day/night presets as data: a night sky that is dark
  but never black, a gradient that runs light at the horizon to dark at the
  zenith, floodlights that compensate for the missing sun, the board lift, and
  preferences that survive a corrupt entry, a sealed store and no `window` at
  all.
- **fly** -- the fly state machine over every combination of phase, turn,
  arrival, roll and errand: every declared state reachable, none invented,
  the same behaviour whether a person or a fly is rolling, a six treated as
  an event, and a coin in the air outranking whatever the phase claims.
- **carry** -- the errand read at several hundred instants: stages once each
  in order, the coin held only between the grab and the release, its position
  exactly the carry point while held, no jump larger than a cell, every
  square on the route flown over, the coin down before the turn continues,
  and a plan built for every legal move of a full four-player match.
- **resolve** -- the move-resolution rule: nothing playable advances, one
  legal move plays itself, several wait for a person or go to the behaviour
  system, a fly's coins never light up and never accept a click.
- **neuralstate** -- the readout as data: a state for every event, the same
  answer twice for the same event, decay to rest, framerate-independent
  easing, and the peaks landing on the events they claim to.
- **flow** -- whole turns through the real store: the die always reaching a
  decision point, the legal moves matching what the rules produce, a person's
  click producing an errand for that coin with the brain registering it, the
  coin genuinely in the air for as long as the turn waits, and a computer
  seat using the identical carry system.

The crowd system is covered in the setup suite: loudest-event-wins, holds not
being interrupted, settling to a floor, and staying in range under 400 mixed
events.

## Neural Lab

The scientific half of the web app, reached from the game's menu: a Drosophila
you can rotate, whose head you can see into, with the measured connectome
placed inside it and this repository's spiking model driving the activity.

### What it is

```
          stimulus  ->  server/simulation.py  ->  spikes  ->  3D activity
                        (the model from code/run_pytorch.py)
```

The fly's external anatomy is a **procedural approximation**. No mesh of any
kind ships with this repository, so the body is hand-authored geometry
proportioned from published descriptions. The connectome inside it is not: it
is all 138,639 FlyWire neurons and all 15,091,983 measured connections, and
every spike shown comes from an actual integration of the model. The interface
labels which is which throughout, and the About panel states the provenance of
each layer.

### Architecture

| Piece | Location | Role |
| --- | --- | --- |
| Simulation API | `server/` | FastAPI service; owns the full connectome, runs simulations, serves spikes as packed binary |
| Front end | `web/` | React + Three.js (react-three-fiber), TypeScript, Vite |
| Static artefacts | `web/public/data/` | Per-neuron arrays and the strongest 200k edges, built by `preprocess/` |

The whole fly lives in one coordinate frame, defined once in
`web/src/three/flyAnatomy.ts`: `+x` is the fly's right, `+y` dorsal, `+z`
anterior, and one unit is about 85 um. The camera presets, the head-capsule
transparency and the transform that places the connectome inside the head all
read their numbers from that file, which is what makes whole fly -> transparent
head -> exposed brain one continuous object rather than three scenes.

### Running it

The web app and the simulation service run separately.

```bash
# 1. build the static artefacts (once; ~85 s, needs the parquet in data/)
python preprocess/build_layout.py

# 2. the simulation service
uvicorn server.app:app --port 8000

# 3. the front end
cd web
npm install
npm run dev          # http://localhost:5173, proxies /api to :8000
```

`npm run build` produces a static bundle; `npm run typecheck` runs the compiler
alone. Point `VITE_API_TARGET` at the service if it is not on port 8000.

The explorer needs only `numpy`, `torch`, `fastapi` and `uvicorn` from the
environment above -- the GPU backends are optional and are reported as
unavailable rather than hidden if the toolchain is missing.

### Data formats

Flat little-endian binaries, memory-mapped by the browser with no parsing:

| File | Layout |
| --- | --- |
| `positions.bin` | `float32[N][3]` layout coordinates |
| `flywire_ids.bin` | `int64[N]` |
| `degrees.bin` | `uint32[N][2]` in, out |
| `weights.bin` | `float32[N][2]` in, out synapse counts |
| `polarity.bin` | `float32[N]`, -1 inhibitory .. +1 excitatory |
| `modules.bin`, `flags.bin` | `uint8[N]` |
| `edges.bin` | `uint32[E][2]` pairs, then `float32[E]` signed weights |

Spike trains come back from the API as one blob: `uint32 neuronIndex[S]`, then
`float32 timeMs[S]`, then `uint16 trial[S]`. A 1,000 ms run is roughly 16,000
spikes, which is about 160 kB packed against roughly 640 kB of equivalent
JSON.

### API

`GET /api/health`, `/api/model`, `/api/backends`, `/api/experiments`,
`/api/celltypes`, `/api/neuron/{i}`, `/api/neuron/{i}/partners`,
`/api/neuron/{i}/local`, `/api/path`, `/api/search`;
`POST /api/subnetwork`, `/api/simulation/run`, `/api/simulation/{id}/cancel`;
`GET /api/simulation/{id}`, `/api/simulation/{id}/spikes.bin`,
`/api/simulation/{id}/traces`.

Runs are jobs: `POST /api/simulation/run` returns an id immediately and the
client polls `QUEUED -> RUNNING -> COMPLETE`, or `ERROR` / `CANCELLED`. Every
response that carries data carries its provenance alongside.

### Performance

Neurons are drawn from one `InstancedMesh` and edges from one indexed
`BufferGeometry`, both fed by typed arrays built once at load; nothing in the
scene allocates per neuron per frame, and no neuron is a React component. Only
the strongest 200,000 edges are shipped to the browser -- the other ~14.9M live
server-side and are queried on demand, which is what `POST /api/subnetwork`
after a run is for.

### Scientific limitations

Read these before quoting anything the explorer shows.

- **The body is an approximation.** Hand-authored geometry, not a scan.
- **Neuron coordinates are not soma positions.** The repository ships no
  anatomical coordinates. `positions.bin` is a force-directed layout, so
  distance encodes connectivity, not micrometres. `meta.json` records the
  separation ratio (0.13: connected neurons land ~7.5x closer than random
  pairs, so the layout does carry real structure).
- **The brain compartments are illustrative.** The datasets carry no neuropil
  annotation, so the labelled regions are a procedural scaffold; no neuron is
  assigned to one and no statistic is computed over them.
- **Modules are connectivity communities, not anatomy** -- k-means on the
  layout, as `modules.json` states.
- **The only real region-style labels** are the subesophageal-zone cell types
  in `data/sez_neurons.pickle`: 106 named types covering 305 neurons, of which
  101 resolve to neurons present in this build.

### Troubleshooting

| Symptom | Cause |
| --- | --- |
| "Cannot reach the simulation service" | `uvicorn` is not running, or `VITE_API_TARGET` points elsewhere |
| "Artefacts are inconsistent with meta.json" | `preprocess/build_layout.py` needs re-running |
| Backend shows Unavailable | Expected unless that GPU toolchain is installed; the panel gives the reason |
| First server start is slow | The 100 MB parquet is parsed once, then cached as `.npy` under `.cache/connectome/` |

## Installation

### Conda environment

The `brain-fly` conda environment provides everything needed to run the
**Brian2**, **Brian2CUDA**, **PyTorch**, **NEST GPU**, and **GeNN** backends
(including CUDA-enabled PyTorch and PyGeNN):

```bash
conda env create -f environment.yml
conda activate brain-fly
```

On Ubuntu/WSL, PyGeNN's source build also needs the system `pkg-config` binary
and libffi headers:

```bash
sudo apt-get install -y pkg-config libffi-dev
```

### GeNN

The `--genn` backend uses PyGeNN 5.4.0 with the CUDA backend. It implements
Brian2-style Poisson activation into membrane voltage, delayed sparse recurrent
synapses, GeNN batching for `n_run`, and the same parquet spike schema as the
other benchmark runners.

Large batched GeNN runs cap the on-device spike recording buffer with
`GENN_RECORDING_WINDOW_MAX_SLOTS` (default: `800000`). This preserves full spike
timing exports while avoiding CUDA out-of-memory errors for large
`n_run * t_run` combinations.

If PyGeNN was not installed when the conda environment was created, install it
inside `brain-fly` with:

```bash
export CUDA_PATH=/usr/local/cuda-12.5
export CUDA_HOME=$CUDA_PATH
export PATH=$CUDA_PATH/bin:$PATH
pip install https://github.com/genn-team/genn/archive/refs/tags/5.4.0.zip
```

### Brian2GeNN

The `--brian2genn` backend uses Brian2GeNN 1.7.0 as a Brian2 standalone device
targeting GeNN/CUDA. It is intentionally isolated from the main `brain-fly`
environment because Brian2GeNN pins Brian2<2.6, which conflicts with
Brian2CUDA's Brian2 2.8.0 requirement.

Create the environment with:

```bash
conda env create -f environment-brian2genn.yml
conda activate brain-fly-brian2genn
```

Brian2GeNN 1.7.0 expects GeNN 4.x command-line scripts such as
`genn-buildmodel.sh`. If they are not already installed, place GeNN 4.9.0 at
`~/.local/src/genn-4.9.0` or set `BRIAN2GENN_GENN_PATH`/`GENN_PATH` to your
GeNN 4.x source tree:

```bash
export CUDA_PATH=/usr/local/cuda-12.5
export CUDA_HOME=$CUDA_PATH
export BRIAN2GENN_GENN_PATH=$HOME/.local/src/genn-4.9.0
export GENN_PATH=$BRIAN2GENN_GENN_PATH
export PATH=$GENN_PATH/bin:$CUDA_PATH/bin:$PATH
export LD_LIBRARY_PATH=$CUDA_PATH/lib64:$LD_LIBRARY_PATH
```

For scientific comparability, the Brian2GeNN runner exports the same per-spike
parquet schema as the other backends and uses the same upstream Poisson drive.
Brian2GeNN cannot run this model's independent trials as a true GeNN batch in
the way the direct `--genn` backend can, so `n_run>1` is implemented as
independent build/run trials with deterministic per-trial C RNG seeds. The
`sim_time` column records GeNN executable time; `build_time` records the
Brian2GeNN code generation/compilation overhead.

### NEST GPU

NEST GPU requires a separate build from source with a custom neuron model
(`user_m1`). This is only needed if you want to use the `--nestgpu` backend.

**Prerequisites:**

- **NVIDIA CUDA Toolkit** (12.x) — follow the
  [official installation guide](https://docs.nvidia.com/cuda/cuda-installation-guide-linux/).
- **CMake** — `sudo apt install cmake` (or see
  [cmake.org](https://cmake.org/download/)).

**Steps:**

1. Clone NEST GPU:

```bash
git clone https://github.com/nest/nest-gpu
```

2. Copy the custom source files into the NEST GPU tree. You must replace `/path/to/nest-gpu` with your own local path:

```bash
cp scripts/nestgpu_source_files/src/user_m1.{h,cu}    /path/to/nest-gpu/src/
cp scripts/nestgpu_source_files/pythonlib/nestgpu.py   /path/to/nest-gpu/pythonlib/
```

   The patched `nestgpu.py` fixes weight array initialization (lines 2225-2227).

3. Build and install (set `-DCMAKE_CUDA_ARCHITECTURES` to match your GPU, e.g.
   `89` for RTX 4070):

```bash
cmake -DCMAKE_CUDA_ARCHITECTURES=89 \
      -DCMAKE_INSTALL_PREFIX=$HOME/.nest-gpu-build \
      /path/to/nest-gpu
make -j$(nproc) && make install
```

For a full setup from a fresh Windows machine (WSL2 + CUDA + Miniconda), see
[scripts/setup_WSL_CUDA.sh](scripts/setup_WSL_CUDA.sh).

----

## Frameworks

| Framework | Backend | Status |
|---|---|---|
| **Brian2** | C++ standalone (multi-core CPU) | ready |
| **Brian2CUDA** | CUDA standalone (GPU) | ready |
| **PyTorch** | CUDA (GPU) | ready |
| **NEST GPU** | CUDA (GPU, custom `user_m1` neuron) | ready |
| **GeNN** | CUDA (GPU, PyGeNN 5.4.0) | ready |
| **Brian2GeNN** | Brian2GeNN 1.7.0 / GeNN CUDA | ready, separate env |

All six frameworks share the same data, model parameters, spike-output schema,
and folder structure. The five main backends run from `brain-fly` plus a
system-level NEST GPU install; Brian2GeNN runs from `brain-fly-brian2genn`
because of its Brian2 version pin.

## Quickstart

```bash
# Create the conda environment (includes CUDA-enabled PyTorch)
conda env create -f environment.yml
conda activate brain-fly

# Run a 1-second benchmark on the five main-environment backends
python main.py --t_run 1 --n_run 1 --no_log_file

# Specific backends (combinable)
python main.py --brian2-cpu                    # Brian2 CPU only
python main.py --brian2cuda-gpu               # Brian2CUDA GPU only
python main.py --pytorch                      # PyTorch only
python main.py --nestgpu                      # NEST GPU only
python main.py --genn                         # GeNN only
python main.py --brian2genn                   # Brian2GeNN only, from brain-fly-brian2genn
python main.py --pytorch --genn               # PyTorch + GeNN

# Full benchmark suite (all durations, n_run=1,4,8,16,32, five main backends)
python main.py

# Nature-paper suite: five main backends, March parameter grid, 5 rounds
python main.py --paper --run-label nature_2026_07

# Brian2GeNN Nature-paper add-on from the separate brain-fly-brian2genn env
python main.py --brian2genn --paper --run-label nature_2026_07
```

### `main.py` options

| Flag | Description |
|---|---|
| *(default)* | Run all: Brian2 (CPU) → Brian2CUDA (GPU) → PyTorch → NEST GPU → GeNN |
| `--brian2-cpu` | Brian2 C++ standalone (CPU) only |
| `--brian2cuda-gpu` | Brian2CUDA (GPU) only |
| `--pytorch` | PyTorch (GPU/CPU) only |
| `--nestgpu` | NEST GPU only |
| `--genn` | GeNN CUDA backend only |
| `--brian2genn` | Brian2GeNN backend only; use the `brain-fly-brian2genn` environment |
| `--t_run` | Simulation duration(s) in seconds, e.g. `--t_run 0.1 1 10` |
| `--n_run` | Number of independent trials, e.g. `--n_run 1 4 8 16 32` |
| `--paper` | Run the paper suite: `t_run=[0.1,1,10,100]`, `n_run=[1,4,8,16,32]`, 5 rounds |
| `--rounds` | Repeat the full selected backend/parameter suite N times |
| `--round-start` | First round number to write, useful for resuming a labeled run |
| `--run-label` | Group repeated spike outputs under `data/results/<label>/` and append labeled CSV rows |
| `--log_file FILE` | Write log to file (default: `data/results/benchmarks.log`) |
| `--no_log_file` | Console output only |

Backend flags are combinable: `--brian2-cpu --pytorch` runs Brian2 CPU then PyTorch.

## Project structure

```
fly-brain/
├── main.py                     # Entrypoint (benchmark runner CLI)
├── environment.yml             # Conda env definition (brain-fly)
├── environment-brian2genn.yml  # Separate Brian2GeNN env definition
├── code/
│   ├── benchmark.py            # Orchestrator: config, logging, dispatcher
│   ├── run_brian2_cuda.py      # Brian2 / Brian2CUDA benchmark runner
│   ├── run_pytorch.py          # PyTorch benchmark runner (model + utils)
│   ├── run_nestgpu.py          # NEST GPU benchmark runner (subprocess per trial)
│   ├── run_genn.py             # GeNN/PyGeNN benchmark runner
│   ├── compare_ground_truth.py # Compare backends against Brian2 (CPU) ground truth
│   └── paper-brian2/           # Original paper code (not used by benchmarks)
│       ├── model.py            # Core LIF network model (Brian2)
│       ├── utils.py            # Analysis helpers (load_exps, get_rate)
│       ├── example.ipynb       # Tutorial: activation, silencing, rate analysis
│       └── figures.ipynb       # Reproduce paper figures (uses archive 630 data)
├── data/
│   ├── 2025_Completeness_783.csv       # Neuron list (FlyWire v783)
│   ├── 2025_Connectivity_783.parquet   # Synapse connectivity (FlyWire v783)
│   ├── benchmark-results.csv           # Accumulated benchmark timings
│   ├── ground-truth-comparison.json   # Backend accuracy vs Brian2 (CPU)
│   ├── sez_neurons.pickle              # SEZ neuron subset (for figures)
│   ├── weight_coo.pkl                  # Cached sparse weights COO (gitignored)
│   ├── weight_csr.pkl                  # Cached sparse weights CSR (gitignored)
│   ├── archive/
│   │   ├── 2023_Completeness_630.csv   # Legacy v630 data
│   │   └── 2023_Connectivity_630.parquet
├── scripts/
│   └── setup_WSL_CUDA.sh       # WSL2 + CUDA + Miniconda setup
├── preprocess/                 # Builds the browser's static connectome artefacts
│   ├── build_layout.py         # Force-directed layout, binaries, metadata
│   ├── layout_sgd.py           # The layout solver itself
│   └── anatomy.py              # Procedural neuropil scaffold (illustrative)
├── server/                     # FastAPI simulation service (no game state)
│   ├── app.py                  # Endpoints: connectome queries + simulation jobs
│   ├── connectome.py           # The measured graph, in memory
│   ├── simulation.py           # LIF integration, mirroring run_pytorch.py
│   ├── brian2_runner.py        # Optional Brian2 reference backend
│   └── jobs.py                 # Background run manager
└── web/                        # The browser app: the game and the lab
    ├── public/data/            # Static connectome binaries (built by preprocess/)
    └── src/
        ├── App.tsx             # Routes between the game and the lab
        ├── game/               # Drosophila Neural Ludo
        │   ├── types.ts        # Game state, tokens, events, actions
        │   ├── rules.ts        # GameRules, seating, safe cells, presets
        │   ├── board.ts        # Cross board: logical path -> cell -> 3D
        │   ├── engine.ts       # Pure reducer; the only authority on legality
        │   ├── rng.ts          # Seeded dice, so matches replay
        │   ├── crowd.ts        # Event -> crowd mood, as a pure function
        │   ├── neural/         # Sensory -> network -> utility -> decision
        │   ├── ai.ts           # Adapter over the pipeline, three strengths
        │   ├── store.ts        # Match state + event-to-animation mapping
        │   ├── driver.ts       # The clock: phase timers, AI turns, keyboard
        │   ├── render/         # Sky, stadium, crowd, board, coins, flies, dice
        │   ├── ui/             # Menus, HUD, brain panel, result, settings
        │   ├── net/            # Online protocol (specified; no server)
        │   └── __tests__/      # 103 tests, run by `npm test`
        ├── three/              # The procedural Drosophila and brain layers
        ├── components/         # Neural Lab panels
        ├── data/               # Connectome loader and spike indexing
        └── api/                # Typed client for the simulation service
```

## Data

The model uses FlyWire connectome data version **783** (public release).
Legacy version 630 data is kept in `data/archive/` for paper figure reproduction.

| File | Description | Size |
|---|---|---|
| `2025_Completeness_783.csv` | Neuron IDs and metadata | 3.2 MB |
| `2025_Connectivity_783.parquet` | Pre/post-synaptic indices + weights | 97 MB |
| `weight_coo.pkl` | Sparse weight matrix (COO), auto-generated by PyTorch | ~288 MB |
| `weight_csr.pkl` | Sparse weight matrix (CSR), auto-generated by PyTorch | ~289 MB |

## Architecture per framework

| | Brian2 / Brian2CUDA | PyTorch | NEST GPU |
|---|---|---|---|
| Build step | C++ / CUDA codegen + compile | None (eager mode) | None |
| Trial parallelism | Sequential (`device.run`) | Batched (`batch_size=n_run`) | Subprocess per trial (cannot reset in-process) |
| Weight format | Brian2 `Synapses` object | Sparse CSR tensor | Array-based `Connect` |
| Neuron model | Brian2 equations | Custom `nn.Module` classes | Custom CUDA kernel (`user_m1`) |
| Timestep | 0.1 ms | 0.1 ms | 0.1 ms |

## System requirements

- Linux (tested on Ubuntu 22.04 under WSL2 on Windows 11)
- NVIDIA GPU with CUDA 12.x (tested on RTX 4070)
- Miniconda / Anaconda
- NEST GPU compiled from source (for `--nestgpu` backend)
- `scripts/setup_WSL_CUDA.sh` documents the full setup from a fresh Windows machine

## License

Except where otherwise noted, this project is licensed under the GNU General
Public License version 2 or any later version
(`GPL-2.0-or-later`). See [LICENSE](LICENSE).

Third-party components retain their original notices. In particular, the
Shiu et al. Brian2 materials in `code/paper-phil-drosophila/` remain available
under their upstream [MIT License](code/paper-phil-drosophila/LICENSE), and the
adapted NEST GPU model files retain their GPL-2.0-or-later notices.
