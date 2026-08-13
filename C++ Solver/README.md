# High-Performance C++ Native Circuit Solver

This tool is a standalone, high-speed C++ Modified Nodal Analysis (MNA) transient circuit solver designed to pair with your web-based TypeScript frontend (`circuitsim-pro`).

## Quick Start & Usage

### 1. Building the Executable
Open Command Prompt in `C++ Solver` and run:
```cmd
build.bat
```
*(Or use CMake directly: `mkdir build && cd build && cmake .. && cmake --build . --config Release`)*

---

### 2. How to Run the New C++ Solver App

#### Mode A: As a High-Speed Backend Server for Web Frontend
Run:
```cmd
build\circuitsim_solver.exe
```
This starts the solver listening on `http://127.0.0.1:3001/api/simulate`. 

To pair with your web frontend:
1. Terminal 1: Run `build\circuitsim_solver.exe`
2. Terminal 2: Run `npm run dev` in project root directory.
3. Open `http://localhost:3000` in browser and click **Run Simulation**.

---

#### Mode B: Self-Test Verification
Run:
```cmd
build\circuitsim_solver.exe --test
```
This runs an instant internal test simulation (RC filter) to verify matrix equations & solver output.

---

#### Mode C: Direct Netlist File Simulation (CLI)
Run:
```cmd
build\circuitsim_solver.exe --input my_netlist.json --output results.json
```
Applies the solver directly to a netlist JSON file without needing a browser.
