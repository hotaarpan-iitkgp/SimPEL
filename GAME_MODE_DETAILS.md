# Game Mode Details, Architecture & Technical Integration Guide

Welcome to the **Interactive Game Mode** documentation for **SimPEL** (Simulation Power Electronics Lab). Game Mode transforms real-time numerical power electronics simulation into an interactive, gamified control challenge. Users actively regulate converter waveforms, tune controller loops, and trigger active semiconductor switches in real time to match target reference waveforms within tight tolerance envelopes.

---

## 1. Overview & Core Mechanics

### 🎯 Objective & Game Loop
In Game Mode, the player's goal is to achieve and maintain a continuous **10.00-second simulation streak** during which the output signal (e.g., $V_{\text{out\_meter}}$, $I_{\text{L\_meter}}$) remains strictly inside a specified **Tolerance Envelope ($\varepsilon$)** centered around a target reference signal ($y_{\text{ref}}$).

```
   +--------------------------------------------------------------------------+
   |                        REAL-TIME SIMULATION LOOP                         |
   |                                                                          |
   |   +--------------------+     +-------------------+     +-------------+   |
   |   | Numerical Solver   | --> | Sensor Output     | --> | Comparator  |   |
   |   | (Modified Nodal)   |     | (y_meas)          |     | vs. y_ref   |   |
   |   +--------------------+     +-------------------+     +-------------+   |
   |            ^                                                      |      |
   |            |                                                      v      |
   |   +--------------------+                         +-------------------+   |
   |   | Manual / Hotkey    |                         |  Inside Envelope  |   |
   |   | Gate Triggers      |                         |  |y - y_ref| <= ε |   |
   |   +--------------------+                         +-------------------+   |
   |                                                            /       \     |
   |                                                      YES  /         \ NO |
   |                                                          v           v   |
   |                                                    Streak += dt   Streak=0
   +--------------------------------------------------------------------------+
```

### 📊 Performance Indicators
* **Match Accuracy (%)**: Rolling ratio of time steps inside the tolerance envelope versus total simulation steps.
* **Current Streak ($\text{sec}$)**: Continuous simulation time ($t_{\text{sim}}$) the sensor signal has successfully tracked the reference target within bounds.
* **Max Streak ($\text{sec}$)**: Highest streak achieved during the session. Reaching 10.00 seconds unlocks victory!
* **Switch Toggles**: Counter tracking manual keystrokes or badge triggers executed on active switches (e.g., MOSFETs, IGBTs).
* **Switching Frequency ($\text{Hz}$)**: Real-time calculated switching frequency based on toggle count over active simulation time.

---

## 2. Architecture & Code Structure

The Game Mode application is structured across modular layers separating UI rendering, routing, schematic management, and solver execution:

```
src/
├── main.tsx                      # Top-level application mode router (#/creator, #/student, #/game)
├── App.tsx                       # Full Schematic Creator Workbench
├── StudentApp.tsx                # Simplified Student Interactive Workspace
├── components/
│   ├── GamePlayer.tsx            # Self-contained Game Mode component & challenge environment
│   └── SimulationPlayer.tsx      # Standard simulation workbench component
├── solver_ts/
│   ├── index.ts                  # High-level CircuitSimulator facade
│   ├── MNA.ts                    # Modified Nodal Analysis matrix engine
│   └── components/               # Switch, R, L, C, Diode, OpAmp models
├── schematic/
│   ├── state.ts                  # Dual-graph schematic state engine
│   ├── components.ts             # SVG component body generators (getComponentSVG)
│   ├── routing.ts                # Wire pathing, tapping, and node mapping
│   └── actions.ts                # Schematic export/import & serialization
└── templates/
    └── index.ts                  # Power converter challenge schematic templates
```

---

## 3. Main App Integration

### 🔀 1. Top-Level URL & Hash Routing (`src/main.tsx`)
The application uses hash-based and query-parameter routing in `main.tsx` to mount the Game Mode component seamlessly without full-page reloads:

```tsx
// src/main.tsx
import GamePlayer from './components/GamePlayer.tsx';

function MainRouter() {
  const [currentMode, setCurrentMode] = useState<'creator' | 'student' | 'game'>(() => {
    if (window.location.hash === '#/student' || window.location.search.includes('mode=student')) {
      return 'student';
    }
    if (window.location.hash === '#/game' || window.location.search.includes('mode=game')) {
      return 'game';
    }
    return 'creator';
  });

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#/student') {
        setCurrentMode('student');
      } else if (window.location.hash === '#/game') {
        setCurrentMode('game');
      } else {
        setCurrentMode('creator');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (currentMode === 'student') return <StudentApp />;
  if (currentMode === 'game') return <GamePlayer onBack={() => { window.location.hash = '#/creator'; }} />;
  return <App />;
}
```

### 🎮 2. Navigation Triggers in Creator & Student Apps
Users can transition into Game Mode at any point from header buttons or toolbar controls in `App.tsx` and `StudentApp.tsx`:

```tsx
// Excerpt from App.tsx / StudentApp.tsx navigation header
<button
  id="switch_to_game_mode"
  onClick={() => {
    window.location.hash = '#/game';
  }}
  className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-lg font-medium text-xs shadow-md hover:brightness-110 transition-all"
>
  <Gamepad2 className="w-4 h-4" />
  <span>Game Challenge Mode</span>
</button>
```

---

## 4. Key Implementation Excerpts & Inner Mechanics

### ⚡ 1. Circuit Simulator Initialization (`GamePlayer.tsx`)
When a template is selected, `GamePlayer` exports the schematic state into JSON format and initializes the WebAssembly/TypeScript MNA numerical solver engine:

```tsx
// src/components/GamePlayer.tsx
import { CircuitSimulator } from '../solver_ts';
import { exportDualGraphJSON } from '../schematic/actions';

const loadChallengeTemplate = (templateId: string) => {
  const template = CIRCUITS_TEMPLATES.find(t => t.id === templateId);
  if (!template) return;

  // Import schematic JSON into dual-graph state
  triggerImport(template.data);
  
  // Export schematic graph into solver JSON definition
  const circuitJson = exportDualGraphJSON();
  
  // Instantiate MNA numerical simulator
  const sim = new CircuitSimulator(circuitJson);
  sim.initialize();
  simulatorRef.current = sim;
};
```

### 🔍 2. Component Selection & Direct Oscilloscope Signal Binding
Clicking on any component in the live schematic triggers component selection and loads its associated voltage and current signals onto the oscilloscope:

```tsx
// src/components/GamePlayer.tsx
<g
  key={comp.id}
  transform={`translate(${comp.x}, ${comp.y}) rotate(${comp.rotation || 0})`}
  style={{ cursor: 'pointer' }}
  onMouseDown={(e) => e.stopPropagation()}
  onClick={(e) => {
    e.stopPropagation();
    setSelectedCompId(comp.id);
    
    // Auto-detect voltage/current signals for selected component
    const compSigs = getComponentSignals(comp);
    if (compSigs.length > 0) {
      setSelectedSensor(compSigs[0].id);
    }
  }}
>
  {/* Transparent 72x72px hitbox for easy touch/mouse targeting */}
  <rect
    x={-36}
    y={-36}
    width={72}
    height={72}
    fill="rgba(0,0,0,0.001)"
    className="cursor-pointer"
  />
  
  {/* Render schematic component vector body */}
  <g dangerouslySetInnerHTML={{ __html: getComponentSVG(comp) }} />
</g>
```

### 📈 3. Real-Time Waveform Tracking & Streak Logic
During each simulation timestep, measured signals are compared against the active reference signal ($y_{\text{ref}}$) to evaluate the tolerance band:

```tsx
// Real-time tracking evaluation inside step loop
const dt = simDilationStep;
const yMeas = signals[selectedSensor] ?? 0;
const yTarget = calculateYRef(tSim, refType, refFreq, refAmp, refOffset);
const error = Math.abs(yMeas - yTarget);

const insideEnvelope = error <= tolerance;

if (insideEnvelope) {
  currentStreakRef.current += dt;
  if (currentStreakRef.current > maxStreakRef.current) {
    maxStreakRef.current = currentStreakRef.current;
  }
} else {
  currentStreakRef.current = 0; // Reset streak on tolerance breach
}

// Victory check
if (currentStreakRef.current >= 10.0) {
  setIsWon(true);
  setIsRunning(false);
}
```

---

## 5. UI Layout & Responsive Workbench Design

`GamePlayer` features a flexible layout designed for high resolution and constrained screen sizes alike:

* **Dual Main Columns**:
  1. **Column 1 (Left)**: Real-time Scrolling Oscilloscope (HTML5 Canvas element with dynamic height scaling up to 660px based on subplot count).
  2. **Column 2 (Middle)**: Live Circuits Triggers Interface containing the interactive schematic viewport, zoom controls, and active bound controller keys.
* **Responsive Control Toolbar**:
  * Flex wrap with min-width constraints on headers to prevent text wrapping on squeezed displays.
  * Adaptive zoom toolbar hiding verbose preset buttons on narrow viewports while preserving essential zoom buttons.
* **Sidebar (Right)**: Challenge configuration, reference wave generator controls, dilation timing adjustments, and tolerance envelope sliders.

---

## 6. Predefined Challenge Templates & Reference Targets

| Template Name | Circuit Type | Key Challenge Target |
| :--- | :--- | :--- |
| **Closed-Loop Buck DC-DC Converter** | Buck Step-Down Converter | Regulate $V_{\text{out}}$ to $5.0\text{V}$ under dynamic load steps |
| **Boost DC-DC Converter** | Boost Step-Up Converter | Maintain steady step-up output voltage while limiting inductor ripple |
| **Buck-Boost Converter** | Inverting DC-DC | Control output magnitude and handle inverted voltage dynamics |
| **Half-Bridge Inverter** | AC Inverter | Synthesize sinusoidal AC output ($50\text{Hz}$) using manual/PWM switches |
| **Custom Template** | User-defined schematic | Full flexibility to transform any user circuit into a custom game challenge |

---

## 7. Summary & Best Practices

1. **Keep Engine Independent**: The numerical solver runs independently from React re-renders using `requestAnimationFrame` loops and mutable ref buffers (`simulatorRef`, `pointsBufferRef`).
2. **Prevent Stale Event propagation**: Use `e.stopPropagation()` and `onMouseDown={(e) => e.stopPropagation()}` on interactive schematic badges to avoid unwanted viewport panning during component selection.
3. **High Hitbox Coverage**: Ensure components feature expanded invisible hitboxes (`rect` with `fill="rgba(0,0,0,0.001)"`) for effortless mouse and touch interaction on complex schematics.
