# SimPEL Schematic Wire Drawing & Routing Engine Documentation

This document describes the architectural design, algorithmic mechanisms, and rendering workflows of the schematic wire drawing and routing engine in SimPEL (Simulation Power Electronics Lab).

---

## 1. Core Data Representation

A wire connection in the schematic is represented as a structured JS object in the global editor state (`state.wires`):

```typescript
interface Wire {
  id: string;                      // Unique identifier starting with 'W' (e.g., 'W1')
  from: Endpoint;                  // Starting connection endpoint
  to: Endpoint;                    // Terminating connection endpoint
  manualPath: Point[] | null;      // Optional user-placed corner points override
}

type Endpoint = 
  | { type: 'pin'; compId: string; terminal: string } // Connected directly to a component pin
  | { type: 'wire'; wireId: string }                  // Tap connection to another wire (T-junction)
```

---

## 2. Wire Drawing Interactions & Connection Flow

The interactive drawing sequence is managed inside [interaction.ts](file:///d:/01-Soft%20Dev%20Projects/circuitsim-pro/src/schematic/interaction.ts):

### 1. Pointer Down (Initiation)
- Clicking on a component pin terminal calls `svg.setPointerCapture` and initializes `state.activeWire` with:
  ```typescript
  state.activeWire = { from: { type: 'pin', compId, terminal }, target: mousePos };
  ```

### 2. Snap Resolution & Dragging
- As the user drags, the mouse coordinates are processed by `resolveRoutingSnap(mousePos)`. 
- **Snapping Criteria**:
  1. **Pins**: Snaps to any nearby component pin if within a 12px radius.
  2. **Grid**: If no pin is near, snaps to the nearest $20\text{px} \times 20\text{px}$ grid coordinate.
  3. **T-Junctions**: Snaps to existing wire segments if the cursor is near them, enabling wire-to-wire tap-off connections.

### 3. Placing Intermediate Corner Points (Manual Corners)
- Clicking on empty canvas space while drawing appends the grid-aligned mouse coordinate to `activeWire.intermediatePoints` (or `manualPath`).
- This divides the wire routing into fixed segments, allowing users to override the auto-router and custom-route wires around dense layouts.

### 4. finalization (Completion)
- Clicking on a valid snap target (pin or wire segment) calls `completeWire(target)` in [actions.ts](file:///d:/01-Soft%20Dev%20Projects/circuitsim-pro/src/schematic/actions.ts):
  - **Self-Loop Check**: Prevents connecting a pin back to itself.
  - **Domain Verification**: Enforces that only compatible domains connect (e.g., cannot connect control pins to electrical power stage lines).
  - **Single outport Constraint**: For control signal networks, it traverses the connection tree to ensure a network is driven by exactly *one* signal source output. Connecting two outputs together throws a validation error toast.
  - **Control Normalization**: Traces control nets to orient control signal paths correctly.

---

## 3. Dual-Domain Isolation Mechanism

SimPEL splits signals into two strict domains:
- **Electrical (`'electrical'`)**: Power Stage components (Resistors, MOSFETs, Diodes, Transformers) operating under Kirchhoff's Laws and solved via Modified Nodal Analysis (MNA).
- **Control (`'control'`)**: Digital/Analog block signals (PWM generators, comparators, multipliers, key triggers) carrying mathematical scalars.

### Domain Resolution Functions in [routing.ts](file:///d:/01-Soft%20Dev%20Projects/circuitsim-pro/src/schematic/routing.ts)

- `getPinDomain(compType, terminalName)`: Maps a component pin to its domain.
  - Basic control components (`CONST`, `GAIN`, `PWM`, `KEY_TRIGGER`, etc.) return `'control'`.
  - Specific pins on electrical components (e.g., Gate `G` on `MOSFET`, `Ctrl` on `S`, `Out` on `VM`) return `'control'`.
  - Power terminals (e.g., `A`/`B` on `R`, `D`/`S` on `MOSFET`) return `'electrical'`.
- `getEndpointDomain(endpoint)`:
  - Resolves domain by checking the pin's type directly if it's a component pin endpoint, or tracing the parent wire domain if it is a T-junction endpoint.

This isolation prevents user-drawing errors such as shorting a 5V PWM logic gate output directly into a 400V power converter bus.

---

## 4. Path Finding & Orthogonal Auto-Routing

All routing calculations occur dynamically inside [routing.ts](file:///d:/01-Soft%20Dev%20Projects/circuitsim-pro/src/schematic/routing.ts). Wires must be routed **orthogonally** (using only horizontal and vertical segments).

### A* Component-Avoidance Auto-Router
The main router uses a grid-based A* Search Algorithm `findAStarPath` to route wires around components:

1. **Grid Grid-Spacing**: Operates on a $20\text{px}$ grid to match standard grid alignment.
2. **Search Box Margin**: Restricts pathfinding iterations inside a bounding box around the source and target points padded by a 240px margin.
3. **Obstacle Detection**:
   - `getComponentBounds(comp)` calculates a bounding box around each component.
   - Any grid coordinate overlapping a component bounds (with a 2px safety margin) is flagged as blocked (`isBlocked()`).
4. **Bend Penalty**: 
   - A turn penalty cost of `150` is added whenever the path direction changes (`curr.dx !== d.x || curr.dy !== d.y`).
   - This ensures the A* algorithm favors clean straight lines and avoids unnecessary zig-zags.

### Fallback Simple Orthogonal Router
If A* pathfinding fails (e.g., space is too tight, or target is inside a component), the router falls back to `getOrthogonalPath`:
- Computes simple Z-shape or L-shape paths using source and target positions, inserting grid detours if the target direction requires looping backwards.

### Path Simplification
After routing, `simplifyPath(pts)` collapses collinear segments:
- Iterates through path points and discards middle points if three consecutive coordinates form a straight horizontal or vertical line (meaning `p1.x === p2.x === p3.x` or `p1.y === p2.y === p3.y`).

---

## 5. Control Signal Path Normalization

Because control signals are directional (flowing from output to input), wire segment arrows must always point in the direction of signal propagation. 

If a user draws a wire backwards (from an input pin to an output pin), [actions.ts](file:///d:/01-Soft%20Dev%20Projects/circuitsim-pro/src/schematic/actions.ts) runs `normalizeControlWires()`:

1. **Find Sources**: Locates all control output sources in the schematic (e.g., `PWM1.Out`, `KEY_TRIGGER1.Out`).
2. **Signal Propagation BFS/DFS Tree**:
   - Starts at each source output pin and queues connected wires.
   - Traverses the entire connected wire tree.
3. **Re-Orientation**:
   - If a traversed wire segment has its `.from` set to the input end and `.to` set to the output/source end, it swaps them:
     ```typescript
     const temp = wire.from;
     wire.from = wire.to;
     wire.to = temp;
     ```
   - If the wire has a `manualPath`, it reverses the coordinates array so corners remain aligned.
   - This guarantees that control signal arrows visually match the actual simulation dependency flow.

---

## 6. Real-time Current Flow Animation overlay

Once simulated, wires animate with current flow dots (driven in real-time or playback):

- **Velocity Calculation**: Speed and scrolling directions match the physical current:
  $$\text{velocity} = 65.0 \times \text{sign}(I) \times \min\left(2.5, (|I| \times 10)^{0.4}\right)$$
- **Dots Density**: Spacing is set to 32px. The animation coordinates scroll dynamically using:
  $$d = (\text{index} \times \text{spacing} + \text{offset}) \bmod \text{totalLength}$$
- **Internal Component Paths**: Physical components (Resistors, Inductors, Capacitors, MOSFETs, Diodes, Voltage Sources) render internal pulsing dots along their main terminal-to-terminal path resolved by `getComponentInternalPath(comp)`.

---

### Location of this file:
`d:\01-Soft Dev Projects\circuitsim-pro\schematic_routing_guide.md`
