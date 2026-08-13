# StudentApp Integration & Architecture Guide

This document explains how the **StudentApp** (`/src/StudentApp.tsx`) integrates into the schematic editor platform alongside the creator-facing **App** (`/src/App.tsx`). It details the shared file layout, the integration mechanisms, and how to route or switch between the two environments.

---

## 1. Architectural Overview

The application is structured around a **Dual-Mode Architecture**:

*   **Creator Mode (`App.tsx`)**: The full-featured workspace where educators or content creators build circuit diagrams, configure complex properties, wire terminals together, insert custom script blocks, and configure target parameters.
*   **Student Mode (`StudentApp.tsx`)**: An interactive, read-only simulation lab. It restricts direct modifications of the circuit layout (adding/deleting components, creating or deleting wires) but exposes intuitive dynamic sliders for tuning circuit variables, visual dragging panels for plotting, and advanced simulation tracking.

```
                  +-----------------------------------+
                  |        index.html / main.tsx      |
                  +-----------------------------------+
                                    |
                  +-----------------+-----------------+
                  |                                   |
                  v                                   v
       [ Creator Workspace ]                 [ Interactive Student Lab ]
         /src/App.tsx                          /src/StudentApp.tsx
                  \                                   /
                   +----------------+----------------+
                                    |
                                    v
                  +-----------------------------------+
                  |  Shared Core Libraries & Engines  |
                  |  - /src/schematic (Renderer, State)|
                  |  - /src/solver_ts.ts (Simulator)  |
                  |  - /src/components (UI Pieces)    |
                  |  - /src/utils (MNA, Math, Solvers)|
                  +-----------------------------------+
```

---

## 2. Shared Subsystems

Both applications utilize the same high-performance core modules, keeping the core circuit-solving and rendering logic identical:

1.  **Schematic Engine (`/src/schematic/`)**:
    *   `state.ts`: Manages global coordinates, current component definitions, active selection models, and sub-schematic states.
    *   `actions.ts`: Builds netlists, parses structural groups, and processes physical nodes.
    *   `renderer.ts`: Renders the high-performance HTML5 Canvas schematic interface.
2.  **Simulation Solvers (`/src/solver_ts.ts`)**:
    *   `CircuitSimulator`: The standard numerical differential equations solver that parses the netlist and generates real-time telemetry traces.
3.  **Plotly Graph Panel (`/src/components/PlotlyChart.tsx`)**:
    *   A high-density widget supporting custom rendering styles, probe hover selectors, measurement caliper rulers, and retro oscilloscope color schemes.

---

## 3. Integration & Switching Strategies

To integrate the new `StudentApp` into the existing tool, developers can use one of three main strategies:

### Strategy A: Dynamic Route Routing (Recommended)
If your tool uses a routing framework like **React Router**, you can set up explicit paths to load the appropriate interface:

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import StudentApp from './StudentApp';

export default function Root() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Creator Portal */}
        <Route path="/creator" element={<App />} />
        
        {/* Student Interactive Lab */}
        <Route path="/student" element={<StudentApp />} />
        
        {/* Default Fallback */}
        <Route path="*" element={<StudentApp />} />
      </Routes>
    </BrowserRouter>
  );
}
```

---

### Strategy B: Query Parameter Switch (No-Router SPA)
For a lightweight Single-Page Application (SPA) without a router, determine the interface dynamically using URL search parameters (e.g., `?mode=student` or `?mode=creator`). 

Modify `/src/main.tsx` to handle the conditional mounting:

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import StudentApp from './StudentApp';
import './index.css';

const queryParams = new URLSearchParams(window.location.search);
const mode = queryParams.get('mode') || 'student'; // Default to student mode

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {mode === 'creator' ? <App /> : <StudentApp />}
  </React.StrictMode>
);
```

---

### Strategy C: State-Based Switcher (Admin Switch)
If you want to allow users to toggle back and forth during development, wrap them in a master container with a stateful toggle:

```typescript
import { useState } from 'react';
import App from './App';
import StudentApp from './StudentApp';

export default function MasterContainer() {
  const [isCreator, setIsCreator] = useState<boolean>(false);

  return (
    <div className="relative w-screen h-screen">
      {isCreator ? <App /> : <StudentApp />}
      
      {/* Absolute Admin Toggle Button */}
      <button
        onClick={() => setIsCreator(!isCreator)}
        className="absolute bottom-4 right-4 z-50 px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-900 text-white shadow-lg hover:bg-slate-800 transition-all border border-slate-700"
      >
        Switch to {isCreator ? "Student Lab" : "Creator Workspace"}
      </button>
    </div>
  );
}
```

---

## 4. Key Functional Differences & Behaviors

When transitioning or editing logic between `App.tsx` and `StudentApp.tsx`, keep the following interaction designs in mind:

| Feature / Behavior | Creator App (`App.tsx`) | Student App (`StudentApp.tsx`) |
| :--- | :--- | :--- |
| **Schematic Editing** | Full write permissions (add, route, delete, copy/paste) | Read-only. Schematic selection triggers sidebar parameter panels. |
| **Left Control Panel** | Properties editor for entering text parameters, custom C++ scripts, or equations. | Lab Control Panel containing dynamic variable range sliders and active badges. |
| **Header Configuration** | Subplot configuration tables, raw netlist diagnostics, and system parameters. | Streamlined trace header containing draggable current/voltage/signal tokens. |
| **State Synchronization** | Changes save directly to persistent models on keypress. | Slider drags apply immediately to parameters, updating backend state and emitting redraw triggers. |
| **Plot Customization** | Traditional Plotly chart views with custom legends. | Multi-mode (Probe, Box Zoom, Pan, Measure Calipers) with Retro Oscilloscope Skin toggle. |

---

## 5. Deployment Verification

After updating the routing entry points, confirm that the application builds and bundles successfully for production deployment:

```bash
# Run linter checks
npm run lint

# Compile and verify the production bundle
npm run build
```
