# Comprehensive Architecture & Technical Specification: C++ Native Circuit Solver

## Executive Summary

The **High-Performance C++ Native Circuit Solver** is a high-speed, multi-threaded transient circuit simulation engine written in C++17. Designed to seamlessly integrate with the `circuitsim-pro` TypeScript/Vite web application, this native solver performs **Modified Nodal Analysis (MNA)** and co-simulates complex power electronics, feedback control loops, piecewise linear (PWL) switching devices, and custom user-defined C-scripts.

---

## 1. System Architecture & Components Overview

```
                        +---------------------------------------+
                        |  TypeScript / Web App Front-End       |
                        |  (http://localhost:3000)              |
                        +-------------------+-------------------+
                                            |
                                 HTTP POST /api/simulate
                                 (JSON Netlist Payload)
                                            |
                                            v
+-----------------------------------------------------------------------------------+
| C++ Native Circuit Solver (circuitsim_solver.exe)                                |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | SolverServer (Port 3001)                                                   |  |
|  |  - WinSock2 / POSIX TCP Socket Listener                                     |  |
|  |  - Multi-Threaded HTTP Worker Pool                                         |  |
|  |  - CORS Header Management (POST, GET, OPTIONS)                            |  |
|  +-------------------------------------+---------------------------------------+  |
|                                        |                                          |
|                                        v                                          |
|  +-----------------------------------------------------------------------------+  |
|  | NetlistParser                                                               |  |
|  |  - Uses nlohmann::json to parse netlist JSON payloads                      |  |
|  |  - Handles metric prefixes (k, M, G, m, u, n, p, f)                          |  |
|  |  - Separates physical stage components, control loops, & simulation parameters |  |
|  +-------------------------------------+---------------------------------------+  |
|                                        |                                          |
|                                        v                                          |
|  +-----------------------------------------------------------------------------+  |
|  | CircuitSimulator (Engine Centerpiece)                                       |  |
|  |  - Pre-compiles structures into FastCompiledComponent vectors                |  |
|  |  - Modified Nodal Analysis (MNA) Matrix Assembler (K * X = B)                |  |
|  |  - Dense LU Factorization Solver with Partial Pivoting                         |  |
|  |  - Companion Models for Capacitors (Euler/Trap) & Inductors                  |  |
|  |  - Iterative PWL Convergence Loop (Diodes, Switches, MOSFETs)                |  |
|  +-----+-----------------------------------------------------------------+-----+  |
|        |                                                                 |        |
|        v                                                                 v        |
|  +----------------------------------+          +----------------------------------+
|  | ExpressionEvaluator              |          | CScriptEngine                    |
|  |  - Scientific notation parser    |          |  - C-Syntax Lexer & Parser       |
|  |  - Shunting-Yard infix to RPN    |          |  - RPN Opcode Bytecode Compiler   |
|  |  - Math & Logical operators      |          |  - Virtual Stack Machine Executor|
|  +----------------------------------+          +----------------------------------+
+-----------------------------------------------------------------------------------+
```

---

## 2. Component Details & Directory Structure

The source files for the C++ Solver are located under [`C++ Solver/src`](file:///d:/01-Soft%20Dev%20Projects/circuitsim-pro/C++%20Solver/src):

### 2.1 [`src/main.cpp`](file:///d:/01-Soft%20Dev%20Projects/circuitsim-pro/C++%20Solver/src/main.cpp) — Application Entry Point
Supports 3 operational modes:
1. **HTTP Server Mode (Default)**: Launches [`SolverServer`](file:///d:/01-Soft%20Dev%20Projects/circuitsim-pro/C++%20Solver/src/server/SolverServer.hpp#L8-L19) on port 3001 listening for web client simulation requests.
2. **CLI File Mode (`--input <file.json> [--output <res.json>]`)**: Reads a netlist JSON file from disk, runs the transient simulation, and writes JSON results to disk or `stdout`.
3. **Self-Test Mode (`--test`)**: Runs a self-contained simulation test on a sample 12V RC filter circuit ($100\,\Omega$, $1\,\mu\text{F}$) to instantly verify matrix equations and solver numerical accuracy.

### 2.2 [`src/server/SolverServer.hpp`](file:///d:/01-Soft%20Dev%20Projects/circuitsim-pro/C++%20Solver/src/server/SolverServer.hpp) & [`SolverServer.cpp`](file:///d:/01-Soft%20Dev%20Projects/circuitsim-pro/C++%20Solver/src/server/SolverServer.cpp) — Microservice Server
- **Socket Networking**: Implements low-latency cross-platform TCP sockets (`WinSock2` on Windows, standard POSIX sockets on Linux/macOS).
- **Concurrency**: Spawns detached OS threads for each incoming HTTP connection to allow concurrent request processing.
- **REST Protocol**:
  - `POST /api/simulate`: Accepts JSON netlists in request body, parses `Content-Length`, runs simulation, and responds with full JSON time-series voltage, current, probe, and control signal arrays.
  - `OPTIONS`: Handles CORS preflight headers allowing requests from web clients hosted on different ports (e.g. Vite on port 3000).

### 2.3 [`src/engine/NetlistParser.hpp`](file:///d:/01-Soft%20Dev%20Projects/circuitsim-pro/C++%20Solver/src/engine/NetlistParser.hpp) & [`NetlistParser.cpp`](file:///d:/01-Soft%20Dev%20Projects/circuitsim-pro/C++%20Solver/src/engine/NetlistParser.cpp) — Netlist Processor
- Converts JSON netlist structures into typed [`ComponentModel`](file:///d:/01-Soft%20Dev%20Projects/circuitsim-pro/C++%20Solver/src/engine/CircuitSimulator.hpp#L40-L46) objects.
- Categorizes components into **Physical Stage** (Resistors, Capacitors, Inductors, Voltage/Current Sources, Diodes, Switches) and **Control Loops** (Gain, PI Controller, Comparator, Triangle Carrier, CustomScript, Probes).
- Extracts simulation settings (`stop_time`, `step_size`, `solver_method`, `step_type`).

### 2.4 [`src/engine/CircuitSimulator.hpp`](file:///d:/01-Soft%20Dev%20Projects/circuitsim-pro/C++%20Solver/src/engine/CircuitSimulator.hpp) & [`CircuitSimulator.cpp`](file:///d:/01-Soft%20Dev%20Projects/circuitsim-pro/C++%20Solver/src/engine/CircuitSimulator.cpp) — Simulation Core
- **Fast-Compiled Primitives**: Pre-indexes node strings to zero-based matrix indices ($0, 1, \dots, N-1$) and compiles raw string parameters into fast C++ struct representations ([`FastCompiledComponent`](file:///d:/01-Soft%20Dev%20Projects/circuitsim-pro/C++%20Solver/src/engine/CircuitSimulator.hpp#L48-L80)) to avoid hash map lookups inside inner transient loops.
- **MNA System Formulation**: Dynamically constructs system matrices $K$ (dimension $D \times D$, where $D = N_{\text{nodes}} + N_{\text{vsource}} + N_{\text{inductor}}$) and excitation vector $B$.
- **Fast Gaussian/LU Solver**: Implements [`solveLUFast()`](file:///d:/01-Soft%20Dev%20Projects/circuitsim-pro/C++%20Solver/src/engine/CircuitSimulator.cpp#L164-L223) with partial pivoting (row swapping) for high precision and stability without relying on external heavy matrix libraries.
- **Iterative Switching Loop**: Evaluates non-linear states (Diodes & Switches) up to state convergence per time step.

#### 2.4.1 Deep-Dive: `CircuitSimulator` Class Architecture & Memory Layout
The [`CircuitSimulator`](file:///d:/01-Soft%20Dev%20Projects/circuitsim-pro/C++%20Solver/src/engine/CircuitSimulator.hpp#L100-L156) class manages all persistent numerical state, memory buffers, and internal execution stages:

1. **System Dimension & Node Mapping**:
   - `nodeToIdx`: Map linking unique schematic node strings to 1-based integer node IDs. Ground nodes are mapped to index `0`.
   - `vSourceToIdx`: Map assigning unique row/column indices for voltage sources and ammeters.
   - `inductorToIdx`: Map assigning unique row/column indices for explicit inductor branch currents.
   - `numNodes`: Number of non-ground electrical nodes.
   - `totalDim`: Total matrix system dimension $D = N_{\text{nodes}} + N_{\text{vsource}} + N_{\text{inductor}}$.

2. **Numerical Matrices & Linear Algebra Buffers**:
   - `K`: Dynamic array storing the $D \times D$ MNA Conductance / Constraint Matrix in flattened row-major ordering.
   - `B`: Dynamic array storing the $D \times 1$ Right-Hand Side (RHS) excitation vector.
   - `X`: Dynamic array storing the $D \times 1$ solution vector.
   - `LU_buf`: Dense workspace buffer ($D \times D$) reserved for direct LU decomposition.
   - `x_buf`: Intermediate solution vector ($D \times 1$).
   - `p_buf`: Permutation array ($D \times 1$) storing row pivot swaps.

3. **Dynamic State History & Pointer Buffers**:
   - `flatCapVoltages`: Contiguous `std::vector<double>` array tracking capacitor voltages $V_{C,\text{prev}}$.
   - `flatIndCurrents`: Contiguous `std::vector<double>` array tracking inductor currents $I_{L,\text{prev}}$.
   - `flatDiodeStates`: Contiguous `std::vector<double>` array tracking binary diode state ($0.0 = \text{OFF}$, $1.0 = \text{ON}$).
   - `flatSwitchStates`: Contiguous `std::vector<double>` array tracking binary switch state ($0.0 = \text{OFF}$, $1.0 = \text{ON}$).
   - `flatPiIntegratorState`: Contiguous `std::vector<double>` array storing PI controller discrete error accumulators ($\int e(t) dt$).
   - `flatControlSignals`: Contiguous `std::vector<double>` array mapping control block signal buses.
   - `nodeOutputBindings`: Pre-bound vector target pointers (`std::vector<double>* vecPtr`) for logging nodal voltages without string map lookups.

#### 2.4.2 Pre-Bound Direct Vector Pointer Optimization Architecture
To achieve maximum transient loop throughput, the engine pre-binds raw memory pointers before entering `runTransient()`:
- **Output Logging Pointers**: `vPlotVecPtr`, `iPlotVecPtr`, `vmVecPtr`, `sigVecPtr`, `sigOutVecPtr` directly point to target output buffers in `SimulationOutput`. This completely eliminates string hash lookups (`out.voltages[pair.first]`) and string heap allocations (`fc.id + ".Out"`) inside the transient loop.
- **Signal Bus Pointers**: `in0Ptr`, `in1Ptr`, `outPtr`, `ctrlSigPtr`, `targetPtr` point directly to double addresses inside `flatControlSignals`, enabling single-cycle raw pointer dereferencing (`val = *in0Ptr`).

---

## 3. Mathematical & Algorithmic Formulation

### 3.1 Modified Nodal Analysis (MNA)
The circuit is modeled by the linear matrix system:

$$K \cdot X = B$$

### 3.2 Discrete Companion Models for Reactive Components
Uses the Backward Euler (Implicit) method for numerical integration:

$$i_C(t_{n+1}) = \frac{C}{\Delta t} \left( V(t_{n+1}) - V(t_n) \right)$$

$$v_L(t_{n+1}) = \frac{L}{\Delta t} \left( I_L(t_{n+1}) - I_L(t_n) \right)$$

### 3.3 Piecewise Linear (PWL) Non-Linear Devices
Modeled via PWL state iterations until device convergence per step.

### 3.4 Deep-Dive: Linear Matrix Solver (`solveLUFast`) Algorithm
Uses Doolittle LU Factorization with row max partial pivoting and LU caching ($O(N^2)$ substitution when $K$ is unchanged).

---

## 4. How to Build & Run

```cmd
build.bat
build\circuitsim_solver.exe --test
```
