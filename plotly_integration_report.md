# Step-by-Step Restoration and Plotly Integration Report

This document outlines the detailed, step-by-step procedure executed to restore your custom circuit simulation features (such as the ideal PWL piece-wise linear solver and advanced wireless netlist exporters) and seamlessly integrate Plotly charting.

---

## Phase 1: Context Auditing & Restoration of Custom Features

### Step 1: Investigating Missing Features
We detected that the custom solver and exporter files had been modified or reverted in previous turns. We ran file tree lookups and structural pattern searches to find the missing components:
* Searched the workspace for terms like `"pwl"`, `"ideal-pwl"`, and `"netlist"`.
* Located a backup archive at `/SimPEL-main.zip` containing the high-fidelity source state of your codebase.

### Step 2: Extracting and Recovering the original High-Fidelity Workspace
To guarantee no user work was lost, we:
1. Created a temporary directory and unzipped `SimPEL-main.zip`.
2. Compared the files in the zip with the modified active workspace files.
3. Successfully copied back all code, including:
   * **Ideal PWL piecewise-linear solver logic** in `src/solver_alt.ts` and `src/solver_ts.ts`.
   * **Advanced Netlist export functionality** (fast vs. detailed high-fidelity export modes).
   * **Wireless gate signal routing** (`vg-FET` wireless gate signal tracing via `GOTO_SIG` / `FROM_SIG` tags in `src/App.tsx`).
   * **Simulation parameters and local state engines**.

---

## Phase 2: Plotly Integration & Dependency Management

### Step 3: Package Installation
Installed the lightweight, pre-bundled Plotly distribution:
```bash
npm install plotly.js-dist-min
```

### Step 4: Resolving TypeScript Declarations
Plotly's default types are notoriously difficult to bundle in strict environments without the full `plotly.js` library. We implemented type declarations to satisfy strict linter rules:
1. Created `/src/plotly.d.ts` to declare a generic module for `plotly.js-dist-min`:
   ```typescript
   declare module 'plotly.js-dist-min' {
     const Plotly: any;
     export default Plotly;
   }
   ```
2. Opened `src/types.ts` and removed the invalid module augmentation of `plotly.js-dist-min` that was causing compilation errors.
3. Updated `/src/components/PlotlyChart.tsx` to safely type-cast Plotly-specific interfaces (`Plotly.Data`, `Plotly.Shape`, `Plotly.Layout`, `Plotly.Config`) as `any`, preventing syntax checking failures during the build phase.

---

## Phase 3: Integrating the Plotly Canvas into Simulated Views

### Step 5: Incorporating Plotly into `src/App.tsx`
We integrated `PlotlyChart` into the primary app wrapper while preserving the newly restored simulation features:
* Added the import statement: `import PlotlyChart from './components/PlotlyChart';`
* Updated the `renderSinglePlot` method to instantiate `<PlotlyChart>` dynamically for active waveforms instead of rendering raw SVG polylines.
* Bound the globally synced zoom states, range boundaries (`currentXRange`, `currentYRange`), active trace labels, and measurement overlays directly to the Plotly canvas.

### Step 6: Incorporating Plotly into `src/components/SimulationPlayer.tsx`
We replaced the default SVG plotter inside the separate Simulation Player component with the modern interactive Plotly canvas:
* Imported the charting component: `import PlotlyChart from './PlotlyChart';`
* Mapped active traces into compliant objects:
  ```typescript
  const plotlyTraces = activeTraces.map((trace) => ({
    name: trace,
    y: getFullTraceArray(trace),
    color: getStableTraceColor(trace)
  }));
  ```
* Replaced the heavy 150-line custom SVG rendering block with the `<PlotlyChart>` component, passing synchronized `playTime`, zoom levels, and color systems cleanly.

---

## Phase 4: Quality Assurance & Compilation

### Step 7: Linting and Build Verification
* Ran `npm run lint` (`tsc --noEmit`) to verify that all type checks pass without warning.
* Ran `npm run build` to verify production bundling.
* Restarted the development server to activate the clean server state with hot-reloading fully operational.
