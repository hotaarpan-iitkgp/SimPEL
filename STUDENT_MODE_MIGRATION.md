# Student Mode (Interactive Lab) - Architectural Blueprint & Algorithms

This blueprint documents the high-level features, algorithms, and key code patterns implemented to transition the schematic editor into an interactive Student Mode (Interactive Lab). It is optimized to guide developers or AI coding agents in recreating these modifications in any parallel environment.

---

## 1. Key Features Implemented

1. **Dual Mode Architecture (`student` vs. `creator`)**:
   - **Creator Mode**: Full-featured schematic environment (add, wire, copy/paste, configure components).
   - **Student Mode**: Read-only schematic workspace. Prevents component modification, deletion, or wire routing. Emphasizes visual monitoring and parameter tuning.
2. **Dynamic Parametric Controls (Zero-Config Lab)**:
   - Eliminates the manual process of binding custom sliders. Selecting any schematic component instantly reveals high-fidelity sliders in the left **Lab Control Panel** for all tunable attributes.
3. **Automatic Panel Focus & Expansion**:
   - Selecting a component containing tunable parameters automatically expands/slides open the Left Control Panel (`showControlPanel = true`) to focus student attention.
4. **Stable Dynamic Range Cache**:
   - Solves slider-range resetting/jitter during active manipulation. Standard slider calculations base `min`/`max` dynamically on the current value. As a user drags the slider, recalculating limits dynamically would cause the slider boundaries to shift dynamically, making control impossible. A caching layer freezes the range boundaries during the selection lifecycle.
5. **Direct Configuration Mapping**:
   - Changing dynamic sliders maps directly to component parameters, immediately updating the backend netlist and synchronizing with the Pure-JS schematic model.
6. **Plot Directives Exclusion**:
   - Excludes virtual parameters such as `plotI`, `plotV`, and other plot flags from both properties panels and control sliders, avoiding duplicate inputs (since they already have dedicated plot checkboxes on component terminals/pins).

---

## 2. Core Algorithmic Workflows

### Algorithm A: Dynamic Range Determination & Caching
To map metric-suffixed engineering numbers (e.g., `"10u"`, `"50k"`, `"2"`) into safe sliding boundaries without dynamic feedback loops.

#### Flowchart / Logic:
1. Parse engineering metric strings (separate magnitude coefficient from prefix, e.g. `u`, `m`, `k`).
2. Compute boundaries relative to the initial value:
   - If positive: $\text{min} = 0.1 \times \text{val}$, $\text{max} = 10 \times \text{val}$, $\text{step} = 0.1 \times \text{val}$.
   - If negative: $\text{min} = 10 \times \text{val}$, $\text{max} = 0.1 \times \text{val}$, $\text{step} = 0.1 \times |\text{val}|$.
   - If zero: Static default boundaries (e.g., $[-10, 10]$).
3. **Caching Phase**: On selecting a component, check if a cached boundary exists for `ComponentID.ParameterName` in a React `useRef`. If missing, compute and cache it. Do **not** re-compute or alter bounds as the user slides the control.
4. **Eviction Phase**: When the component selection changes or is cleared, prune the cache, retaining entries only for the active selection.

---

### Algorithm B: Auto-Focus Control Panel Trigger
1. Intercept `appletStateChanged` custom events emitted by schematic click/selection handlers.
2. Inspect `state.selectedComponentIds`.
3. Filter selected components to check if they contain any parameters not present in the blacklist (`code`, `terminals`, etc.) or matches `/plot/i`.
4. If a component possesses at least one tunable parameter, set `showControlPanel = true`.

---

### Algorithm C: Parameter Sync & Event Propagation
1. Slider interaction receives a raw float coordinate.
2. Formulate the value as `String(floatValue) + currentPrefix`.
3. Write directly into the targeted `state.components[index].parameters[key]`.
4. Run `saveState()` and emit custom event `appletStateChanged` so that both the schematic canvas and React components redraw concurrently.

---

## 3. High-Level Code Snippets

### Snippet 1: Dynamic Range Calculation & Stable Cache (`App.tsx`)
```typescript
// Ref to lock dynamic slider boundaries during selection lifecycle
const dynamicRangesRef = useRef<Record<string, { min: number; max: number; step: number }>>({});

// Compute stable min, max, and step boundaries relative to initial value
const calculateStableRange = (val: number) => {
  const absVal = Math.abs(val);
  if (absVal === 0) return { min: -10, max: 10, step: 0.1 };
  
  if (val > 0) {
    return {
      min: Number((val * 0.1).toFixed(4)),
      max: Number((val * 10).toFixed(4)),
      step: Number((val * 0.1).toFixed(4)) || 0.1
    };
  } else {
    return {
      min: Number((val * 10).toFixed(4)),
      max: Number((val * 0.1).toFixed(4)),
      step: Number((absVal * 0.1).toFixed(4)) || 0.1
    };
  }
};
```

---

### Snippet 2: Selection Listener & Auto-Focus Trigger (`App.tsx`)
```typescript
useEffect(() => {
  const handler = () => {
    setAppletUpdateCount(prev => prev + 1);
    const selectedIds = state.selectedComponentIds || [];
    
    // Prune stale cache values not in active selection
    const newRanges: Record<string, { min: number; max: number; step: number }> = {};
    selectedIds.forEach((compId) => {
      Object.keys(dynamicRangesRef.current).forEach(key => {
        if (key.startsWith(`${compId}.`)) {
          newRanges[key] = dynamicRangesRef.current[key];
        }
      });
    });
    dynamicRangesRef.current = newRanges;

    // Detect if selection contains eligible parameters to slide open Left Panel
    if (selectedIds.length > 0) {
      const selectedComps = state.components.filter(c => selectedIds.includes(c.id));
      const hasTunableParams = selectedComps.some(c => {
        if (c.type === 'SUBSYSTEM' && c.mask?.parameters?.length > 0) return true;
        if (c.parameters) {
          const eligibleKeys = Object.keys(c.parameters).filter(k => {
            if (['code', 'terminals', 'signs', 'input_mappings', 'selected_signals'].includes(k)) return false;
            if (/plot/i.test(k)) return false; // Filter plot directives
            return true;
          });
          if (c.type === 'CSCRIPT') return false;
          return eligibleKeys.length > 0;
        }
        return false;
      });
      
      if (hasTunableParams) {
        setShowControlPanel(true);
      }
    }
  };
  
  window.addEventListener('appletStateChanged', handler);
  return () => window.removeEventListener('appletStateChanged', handler);
}, []);
```

---

### Snippet 3: Direct Parameter Update Handler (`App.tsx`)
```typescript
const handleDirectParamChange = (compId: string, paramName: string, newValue: number, prefix: string) => {
  const comp = state.components.find(c => c.id === compId);
  if (comp) {
    if (!comp.parameters) comp.parameters = {};
    comp.parameters[paramName] = String(newValue) + prefix;
    saveState();
    window.dispatchEvent(new CustomEvent('appletStateChanged'));
  }
};
```

---

### Snippet 4: Parameter Exclusion Filters (`properties.ts` & `App.tsx`)
Ensure `/plot/i.test(key)` filters out virtual parameters from showing up in both properties lists and dynamic sliders:

```typescript
// Properties logic exclusion example
Object.keys(comp.parameters).forEach(key => {
  if (key === 'code') return;
  if (comp.type === 'CSCRIPT') return;
  if (/plot/i.test(key)) return; // Exclude plot parameters from general editor view
  
  // Create row elements ...
});
```

---

## 4. Layout Architecture Changes

```
OLD LAYOUT (STUDENT MODE HEADER):
+-------------------------------------------------------------+
| [T1: Signals to Plot (📊)]  |  [T2: Tunable Parameters (🎛️)] |
+-------------------------------------------------------------+

NEW LAYOUT (STUDENT MODE HEADER):
+-------------------------------------------------------------+
|                 [T1: Signals to Plot (📊)]                  | -> Spans full width, cleaner header.
+-------------------------------------------------------------+
```

- **Signals Header Tile**: Retains only the `Signals to Plot` dragging module. Re-styled to fit full-width.
- **Tunable Parameters Header Tile**: Deleted completely. Parameters are exclusively managed via the left-aligned Lab Control Panel sidebar. This optimizes vertical real estate and avoids duplicate control layouts.
- **Active Badges**: Dynamic parameters are highlighted in the Left Control Panel with an `"ACTIVE"` badge to differentiate them from configured permanent sliders.
