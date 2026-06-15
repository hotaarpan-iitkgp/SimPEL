# Current Flow Animation: Multi-Segment Wire Junction Integration
*A guide for seamless integration of the T-Junction Wire Segmentation & Flow Animation system.*

---

## 1. Executive Summary & Core Challenge

### The Problem: Single-Resistor Wire Representation
Initially, the schematic tool treated every drawn wire as a single electrical connection. In the simulator's Netlist generator (`exportDualGraphJSON`), each wire was exported as a single low-resistance ($10^{-4}\ \Omega$) resistor spanning from its absolute start to its absolute end.

When a user connected a wire's endpoint to the *middle* of another wire (forming a **T-junction**), the simulator did not know that the tapped wire should be divided into two distinct electrical paths. 
- *Result*: The node solver fails to compute proper branch currents, resulting in incorrect visual animations, bypassed components, or completely failed simulations (especially in bridge rectifiers).

---

## 2. The Architectural Solution

To resolve this without altering the core drawing mechanics, we introduced **Dynamic Spatial Segmentation and Union-Find Mapping**.

### Phase A: Tap Detection & Path Subdivision
Whenever a simulation is compiled or rendered:
1. **Find Tap Points**: The system scans all electrical wires to find where any other wire's endpoints meet them.
2. **Subdivide Paths**: The path points of each tapped wire are mathematically split at those contact (tap) coordinates.
3. **Generate Segment IDs**: A wire with $N$ taps is split into $N+1$ segments. Each segment is assigned a child ID: `${wireId}_seg${j}`.

### Phase B: Dual-Graph Union-Find & Virtual Node Creation
1. **Define Junction Keys**: For every division point on a wire, we create a virtual junction key of the structure: `W_junc_[round_x]_[round_y]`.
2. **Assign Segment Endpoints**: The start and end of each subdivided path segment are mapped to these virtual junctions or to the wire's original terminals.
3. **Disjoint Union**: The Union-Find engine unions adjacent pin terminals and segment keys to align their physical nodes.
4. **Physical Netlist Resistors**: Instead of pushing a single resistor representing the parent wire ID, the Netlist exporter pushes $N+1$ low-resistance resistors—one for each segment ID—with their respective virtual nodes.

### Phase C: Animating Sub-Segments Separately
1. **Per-Segment Offsets**: The scrolling interval loop is updated to track and accumulate micro-offsets for individual segments (`direct_wire_${segId}`) based on their simulated currents.
2. **Segment Flow Dots**: The SVG renderer maps over segments, rendering independent dot arrays that travel exclusively along their sub-paths.
3. **KCL-Aware Text & Arrow Badges**: Green arrow overlays and numerical magnitude badges are rendered individually on each segment’s geographic midpoint. Current splitting/merging is now fully visible and complies with Kirchhoff's Current Law (KCL).

---

## 3. Code Modifications Breakdown

This system requires making complementary changes in two core files: `src/schematic/actions.ts` (the exporters/backend simulation analyzer) and `src/components/SimulationPlayer.tsx` (the visualization layers).

---

### File 1: `src/schematic/actions.ts` (Graph Restructuring)

#### Step 1: Adding Path Splitting Mathematics
Inside `exportDualGraphJSON()`, directly before the primary wire loops, insert the segment-splitting utility:

```typescript
// Helper to find all valid physical tap points on a target wire
const getTapPointsOnWire = (wireId: string, wires: any[]) => {
  const points: { x: number; y: number }[] = [];
  wires.forEach(w => {
    if (w.from && w.from.type === 'wire' && w.from.wireId === wireId) {
      points.push({ x: w.from.x, y: w.from.y });
    }
    if (w.to && w.to.type === 'wire' && w.to.wireId === wireId) {
      points.push({ x: w.to.x, y: w.to.y });
    }
  });
  return points;
};

// Helper: Takes a path and inserts contact coordinates, splitting them into discrete sub-paths
const insertTapPointsAndSplit = (path: { x: number; y: number }[], taps: { x: number; y: number }[]): { x: number; y: number }[][] => {
  let augmented = [...path];
  
  for (const tap of taps) {
    let alreadyExists = false;
    for (const p of augmented) {
      if (Math.hypot(p.x - tap.x, p.y - tap.y) < 3) {
        alreadyExists = true;
        break;
      }
    }
    if (alreadyExists) continue;
    
    for (let i = 0; i < augmented.length - 1; i++) {
      const p1 = augmented[i];
      const p2 = augmented[i + 1];
      
      const minX = Math.min(p1.x, p2.x);
      const maxX = Math.max(p1.x, p2.x);
      const minY = Math.min(p1.y, p2.y);
      const maxY = Math.max(p1.y, p2.y);
      
      const isCollinear = Math.abs((p2.y - p1.y) * (tap.x - p1.x) - (p2.x - p1.x) * (tap.y - p1.y)) < 10;
      if (isCollinear && tap.x >= minX - 2 && tap.x <= maxX + 2 && tap.y >= minY - 2 && tap.y <= maxY + 2) {
        augmented.splice(i + 1, 0, tap);
        break;
      }
    }
  }
  
  const subPaths: { x: number; y: number }[][] = [];
  let currentSubPath: { x: number; y: number }[] = [augmented[0]];
  
  for (let i = 1; i < augmented.length; i++) {
    const p = augmented[i];
    currentSubPath.push(p);
    
    const isTap = taps.some(t => Math.hypot(t.x - p.x, t.y - p.y) < 3);
    if (isTap) {
      subPaths.push(currentSubPath);
      currentSubPath = [p];
    }
  }
  if (currentSubPath.length > 1) {
    subPaths.push(currentSubPath);
  }
  
  return subPaths;
};
```

#### Step 2: Creating the `wireSegments` Map
Pre-calculate and map segment structures for all electrical wires:

```typescript
const wireSegments: Record<string, {
  segmentId: string;
  path: { x: number; y: number }[];
  fromKey: string;
  toKey: string;
}[]> = {};

electricalWires.forEach((wire: any) => {
  const origPath = getWirePath(wire);
  const taps = getTapPointsOnWire(wire.id, electricalWires);
  
  const pStartCoords = getWireEndpointCoords(wire.from);
  const pEndCoords = getWireEndpointCoords(wire.to);
  const filteredTaps = taps.filter(t => 
    Math.hypot(t.x - pStartCoords.x, t.y - pStartCoords.y) > 5 &&
    Math.hypot(t.x - pEndCoords.x, t.y - pEndCoords.y) > 5
  );

  const subPaths = insertTapPointsAndSplit(origPath, filteredTaps);
  const segs = subPaths.map((subPath, j) => {
    const segmentId = `${wire.id}_seg${j}`;
    const fromKey = (j === 0) ? `W_from_${wire.id}` : `W_junc_${Math.round(subPath[0].x)}_${Math.round(subPath[0].y)}`;
    const toKey = (j === subPaths.length - 1) ? `W_to_${wire.id}` : `W_junc_${Math.round(subPath[subPath.length - 1].x)}_${Math.round(subPath[subPath.length - 1].y)}`;
    return { segmentId, path: subPath, fromKey, toKey };
  });
  wireSegments[wire.id] = segs;
});
```

#### Step 3: Aligning Union-Find to Segment Junctions
Modify the Union-Find iteration over `electricalWires`:

```typescript
electricalWires.forEach((wire: any) => {
  const pStartKey = `W_from_${wire.id}`;
  const pEndKey = `W_to_${wire.id}`;
  
  const pStartCoords = getWireEndpointCoords(wire.from);
  const pEndCoords = getWireEndpointCoords(wire.to);
  
  endpointCoords[pStartKey] = pStartCoords;
  endpointCoords[pEndKey] = pEndCoords;
  
  uf.find(pStartKey);
  uf.find(pEndKey);

  // Register virtual nodes for each subdivided segment start/end
  const segs = wireSegments[wire.id] || [];
  segs.forEach(seg => {
    endpointCoords[seg.fromKey] = seg.path[0];
    endpointCoords[seg.toKey] = seg.path[seg.path.length - 1];
    uf.find(seg.fromKey);
    uf.find(seg.toKey);
  });
  
  // Connect original endpoints
  if (wire.from.type === 'pin') {
    const pinKey = `${wire.from.compId}.${wire.from.terminal}`;
    uf.union(pStartKey, pinKey);
  } else if (wire.from.type === 'wire') {
    const juncKey = `W_junc_${Math.round(pStartCoords.x)}_${Math.round(pStartCoords.y)}`;
    uf.union(pStartKey, juncKey);
  }

  if (wire.to && wire.to.type === 'pin') {
    const pinKey = `${wire.to.compId}.${wire.to.terminal}`;
    uf.union(pEndKey, pinKey);
  } else if (wire.to && wire.to.type === 'wire') {
    const juncKey = `W_junc_${Math.round(pEndCoords.x)}_${Math.round(pEndCoords.y)}`;
    uf.union(pEndKey, juncKey);
  }
});
```

#### Step 4: Pushing Subdivided Resistors to Netlist
On segment output inside physical stage compilation:

```typescript
// Push segment elements as separate electrical pathways
electricalWires.forEach((wire: any) => {
  const segs = wireSegments[wire.id] || [];
  if (segs.length === 0) {
    const fromNode = pinToNodeMap[`W_from_${wire.id}`] || "node_0";
    const toNode = pinToNodeMap[`W_to_${wire.id}`] || "node_0";
    physical_stage.resistors.push({
      id: wire.id,
      nodes: [fromNode, toNode],
      value: 1e-4 // low resistance
    });
  } else {
    segs.forEach(seg => {
      const fromNode = pinToNodeMap[seg.fromKey] || "node_0";
      const toNode = pinToNodeMap[seg.toKey] || "node_0";
      physical_stage.resistors.push({
        id: seg.segmentId,
        nodes: [fromNode, toNode],
        value: 1e-4 // low resistance
      });
    });
  }
});
```

---

### File 2: `src/components/SimulationPlayer.tsx` (Visualization Canvas)

Replicate the spatial path-splitting utilities locally at the top level of `SimulationPlayer.tsx` (`getTapPointsOnWire`, `insertTapPointsAndSplit`, `getSegmentsForWire`).

#### Step 1: Upgrading Scrolling Offsets
To animate flow indicators along distinct segments, revise the offset calculations in the requestAnimationFrame/timer loop:

```typescript
// 1. Update direct wire segment scrolling offsets
state.wires.forEach((wire: any) => {
  const segs = getSegmentsForWire(wire, state.wires);
  if (segs.length === 0) {
    const wireVal = getComponentCurrentAtIndex(wire.id, stepIdx);
    if (Math.abs(wireVal) > 1e-3) {
      const velocity = 65.0 * Math.sign(wireVal) * Math.min(2.5, Math.pow(Math.abs(wireVal) * 10, 0.4));
      const oldOffset = wireOffsetsRef.current[`direct_wire_${wire.id}`] || 0.0;
      wireOffsetsRef.current[`direct_wire_${wire.id}`] = oldOffset + velocity * dtReal;
    }
  } else {
    segs.forEach(seg => {
      const wireVal = getComponentCurrentAtIndex(seg.segmentId, stepIdx) || getComponentCurrentAtIndex(wire.id, stepIdx);
      if (Math.abs(wireVal) > 1e-3) {
        const velocity = 65.0 * Math.sign(wireVal) * Math.min(2.5, Math.pow(Math.abs(wireVal) * 10, 0.4));
        const oldOffset = wireOffsetsRef.current[`direct_wire_${seg.segmentId}`] || 0.0;
        wireOffsetsRef.current[`direct_wire_${seg.segmentId}`] = oldOffset + velocity * dtReal;
      }
    });
  }
});
```

#### Step 2: Overlaying Subdivision-Aware Dot Layers
Rewrite the SVG `circle` generator loop inside the JSX markup to dynamically render distinct arrays of moving dots along separate segments:

```tsx
{/* Dynamic Direct-Wire Flow Dots overlay */}
{state.wires.map((wire: any, wIndex: number) => {
  const isControl = (wire.from && wire.from.type === 'pin' && state.components.find((c: any) => c.id === wire.from.compId)?.type === 'CONST') || 
                    (wire.to && wire.to.type === 'pin' && state.components.find((c: any) => c.id === wire.to.compId)?.type === 'CONST');
  if (isControl) return null;

  const segs = getSegmentsForWire(wire, state.wires);

  const segmentDots = segs.map((seg, sIdx) => {
    const wireVal = getComponentCurrentAtIndex(seg.segmentId, currentStepIndex) || getComponentCurrentAtIndex(wire.id, currentStepIndex);
    if (Math.abs(wireVal) < 1e-3) return null;

    const pathPoints = seg.path;
    if (!pathPoints || pathPoints.length === 0) return null;

    let totalLength = 0;
    for (let i = 0; i < pathPoints.length - 1; i++) {
      const p1 = pathPoints[i];
      const p2 = pathPoints[i + 1];
      totalLength += Math.hypot(p2.x - p1.x, p2.y - p1.y);
    }

    if (totalLength <= 0) return null;

    const spacing = 32;
    const numDots = Math.max(1, Math.floor(totalLength / spacing));
    const currentOffset = wireOffsetsRef.current[`direct_wire_${seg.segmentId}`] || wireOffsetsRef.current[`direct_wire_${wire.id}`] || 0.0;
    const dotColor = getStableTraceColor(`I_${wire.id}`);

    const wireDots = [];
    for (let dIdx = 0; dIdx < numDots; dIdx++) {
      let d = (dIdx * spacing + currentOffset) % totalLength;
      if (d < 0) d += totalLength;

      const pt = getPointAtLengthWithOffset(pathPoints, d, 0);
      if (pt) {
        wireDots.push(
          <circle
            key={`direct-dot-${seg.segmentId}-${wIndex}-${sIdx}-${dIdx}`}
            cx={pt.x}
            cy={pt.y}
            r="4.2"
            fill={dotColor}
            className="pointer-events-none"
            style={{
              filter: "url(#neon-glow)",
              opacity: 0.95
            }}
          />
        );
      }
    }

    return <g key={`dots-direct-wire-seg-${seg.segmentId}`}>{wireDots}</g>;
  });

  return <g key={`dots-direct-wire-${wire.id}`}>{segmentDots}</g>;
})}
```

#### Step 3: Multi-Segment Badges & Overlays
Generate coordinate-aware green arrow pointers and magnitude labels for each segment:

```tsx
{/* Direct-Wire Current Direction and Magnitude Overlay */}
{showWireOverlays && state.wires.map((wire: any, wIdx: number) => {
  const isControl = (wire.from && wire.from.type === 'pin' && state.components.find((c: any) => c.id === wire.from.compId)?.type === 'CONST') || 
                    (wire.to && wire.to.type === 'pin' && state.components.find((c: any) => c.id === wire.to.compId)?.type === 'CONST');
  if (isControl) return null;

  const segs = getSegmentsForWire(wire, state.wires);

  const segmentOverlays = segs.map((seg, sIdx) => {
    const wireVal = getComponentCurrentAtIndex(seg.segmentId, currentStepIndex) || getComponentCurrentAtIndex(wire.id, currentStepIndex);
    if (Math.abs(wireVal) < 1e-6) return null; // threshold 1uA

    const pathPoints = seg.path;
    if (!pathPoints || pathPoints.length === 0) return null;

    const mid = getWirePathMidpoint(pathPoints);
    const displayVal = Math.abs(wireVal);
    let formatted = "";
    if (displayVal >= 1.0) {
      formatted = `${displayVal.toFixed(2)} A`;
    } else if (displayVal >= 1e-3) {
      formatted = `${(displayVal * 1000).toFixed(1)} mA`;
    } else {
      formatted = `${(displayVal * 1e6).toFixed(0)} µA`;
    }

    let textAngle = (mid.angle * 180) / Math.PI;
    if (textAngle > 90 || textAngle < -90) {
      textAngle += 180;
    }

    const labelOffset = -12;
    const labelX = mid.x + labelOffset * Math.sin(mid.angle);
    const labelY = mid.y - labelOffset * Math.cos(mid.angle);

    const arrowAngle = (mid.angle * 180) / Math.PI + (wireVal >= 0 ? 0 : 180);

    return (
      <g key={`wire-overlay-seg-${seg.segmentId}-${wIdx}`} className="pointer-events-none select-none">
        <g transform={`translate(${mid.x}, ${mid.y}) rotate(${arrowAngle})`}>
          <polygon 
            points="-5,-4 3,0 -5,4" 
            fill="#10b981" 
            stroke="#050711"
            strokeWidth="0.8"
            style={{ filter: "drop-shadow(0px 0px 3px rgba(16,185,129,0.5))" }}
          />
        </g>

        <g transform={`translate(${labelX}, ${labelY}) rotate(${textAngle})`}>
          <rect
            x="-28"
            y="-7"
            width="56"
            height="14"
            rx="3"
            fill="#090d1f"
            stroke="#1e293b"
            strokeWidth="1"
            opacity="0.9"
          />
          <text
            x="0"
            y="2.5"
            fill="#f8fafc"
            fontSize="7.5"
            fontFamily="sans-serif"
            fontWeight="600"
            textAnchor="middle"
          >
            {formatted}
          </text>
        </g>
      </g>
    );
  });

  return <g key={`overlays-direct-wire-${wire.id}`}>{segmentOverlays}</g>;
})}
```

---

## 4. Strategies for Cost-Efficient AI Feeding (Antigravity Integration)

To feed this feature to your local AI coding agent (Antigravity) without overflowing token budgets or causing rewrite cycles:

### Method 1: The `.md` Companion File + Segmented Files (Highly Recommended)
Copy this generated markdown file (`current_flow_animation.md`) along with the *two* full-length modified files from the output explorer:
1. `/src/schematic/actions.ts`
2. `/src/components/SimulationPlayer.tsx`

Feed them directly to Antigravity with the prompt:
> *"I have attached a specifications document `current_flow_animation.md` detailing the precise multi-segment wire animation system, along with the correct source files `/src/schematic/actions.ts` and `/src/components/SimulationPlayer.tsx`. Please replace my local files with these or integrate the segmented flow updates as described in the companion document."*

### Method 2: System Instructions Injection (`AGENTS.md`)
If your local setup is built with Antigravity:
1. Paste a summary of this architecture in your project's `/AGENTS.md` or `/GEMINI.md` file.
2. The agent automatically reads the file on startup. This enforces architectural memory without the need to repeat instructions in chat logs.

### Method 3: Git Patch Pipeline
If you have git initialized, generate a unified patch format:
```bash
git diff origin/main > wire_flow_animation.patch
```
Provide the `.patch` file to the agent. This contains line-by-line insertions and deletions, making it the most compact possible textual format to convey code changes safely.

---

## 5. Dual-Fidelity Simulation Optimization (Fast vs. Detailed/Animation Modes)

### The Scaling Challenge & Optimization
Considering every segment of every wire as a separate circuit element adds auxiliary nodes to the simulator's Modified Nodal Analysis (MNA) matrix $G$. Since equation-solving scales non-linearly with matrix dimension, full-mesh subdivisions can drag down computational performance and memory allocations during rapid-fire plot tuning.

### The Solution: On-Demand Interactive Compilation
We introduced a **Dual-Fidelity selector button group** in `SimulationPlayer.tsx` to eliminate latency completely:
1. **Fast Mode** (plots only, no subdivided flows) runs instantly by grouping schematic junctions to nearest endpoints using `exportDualGraphJSON(true)`. 
2. **Detailed Mode** (high-fidelity animated current flowing paths) splits junctions with `exportDualGraphJSON(false)`.

These are mapped to physical selector buttons inside the Interactive Circuit Flow Sandbox info dashboard so you can switch between modes at will.

### Auto-Upgrade React Segmented Selector (`SimulationPlayer.tsx`)
```tsx
const isFidelitySimActive = useMemo(() => {
  if (!simResults) return false;
  
  const electricalWires = state.wires.filter(w => getWireDomain(w) === 'electrical');
  let hasSegments = false;
  
  for (const wire of electricalWires) {
    const segs = getSegmentsForWire(wire, state.wires);
    if (segs.length > 0) {
      hasSegments = true;
      const firstSegId = segs[0].segmentId;
      if (simResults.custom_plots?.[`I_${firstSegId}`] || simResults.signals?.[`I_${firstSegId}`]) {
        return true;
      }
    }
  }
  return !hasSegments; // No T-junctions means fast simulation is already high-fidelity
}, [simResults]);
```

### The Selector Button Group Markup:
```tsx
<div className="flex items-center bg-slate-900/60 p-0.5 rounded-lg border border-slate-800/80 gap-1">
  <button
    onClick={triggerRun}
    className={`px-2 py-0.5 rounded text-[9.5px] font-bold font-sans transition-all cursor-pointer flex items-center gap-1 ${
      !isFidelitySimActive 
        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm' 
        : 'text-slate-400 hover:text-white hover:bg-slate-800/40 border border-transparent'
    }`}
    title="Run fast unsegmented simulation (plots and waveform calculation only)"
  >
    {!isFidelitySimActive && <span className="h-1 w-1 rounded-full bg-amber-400" />}
    Fast (Plots)
  </button>
  <button
    onClick={runFidelitySim}
    className={`px-2 py-0.5 rounded text-[9.5px] font-bold font-sans transition-all cursor-pointer flex items-center gap-1 ${
      isFidelitySimActive 
        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' 
        : 'text-slate-400 hover:text-white hover:bg-slate-800/40 border border-transparent'
    }`}
    title="Run high-fidelity math splitting for real-time current flow animations"
  >
    {isFidelitySimActive && <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />}
    Detailed (Flows)
  </button>
</div>
```
