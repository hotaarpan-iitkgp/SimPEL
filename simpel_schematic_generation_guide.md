# SimPEL Schematic Layout Generation Guide

This guide describes the JSON layout schema, coordinate rules, and connectivity architecture of the SimPEL visual schematic editor. Use this document to instruct AI models or custom agents to generate valid, syntactically correct schematic files that can be imported directly into the tool.

---

## 1. Critical Rules & Anti-Patterns to Avoid (Read First!)

To prevent parser and simulation engine failures, the generating AI must strictly avoid these common mistakes:

### A. Root-level JSON Key Mistakes
* ❌ **INCORRECT:** Using `routing` for connections and `schematic_meta` for configuration.
* ✅ **CORRECT:** The three root keys of the JSON object must be exactly:
  1. `"components"`: Array of component configurations.
  2. `"wires"`: Array of wire connections (do NOT call this `routing`).
  3. `"simulationSettings"`: Solver parameters configuration.

### B. Component Coordinates Placement
* ❌ **INCORRECT:** Nesting coordinates under a sub-object like `"position": { "x": 100, "y": 200 }`.
* ✅ **CORRECT:** Declare `x` and `y` directly under the component object:
  ```json
  {
    "id": "R1",
    "type": "R",
    "x": 100,
    "y": 200,
    "rotation": 0,
    "parameters": { "value": "10" }
  }
  ```

### C. Component Type Names
* ❌ **INCORRECT:** Using generic English/SPICE names like `Source_AC`, `Switch_MOSFET`, `Resistor`, `Capacitor`, or `Inductor`.
* ✅ **CORRECT:** Use the exact visual symbols:
  * Resistor $\rightarrow$ `R`
  * Inductor $\rightarrow$ `L`
  * Capacitor $\rightarrow$ `C`
  * Diode $\rightarrow$ `D`
  * AC Voltage Source $\rightarrow$ `AC_V`
  * DC Voltage Source $\rightarrow$ `V`
  * MOSFET/Switch $\rightarrow$ `vg-FET` (Always use `vg-FET` for active switches!)
  * Ground Reference $\rightarrow$ `GND`

### D. Parameter Keys
* ❌ **INCORRECT:** Using descriptive parameter names like `"resistance": 50`, `"inductance": 0.005`, `"capacitance": 0.0022`, or `"V_peak": 311`.
* ❌ **INCORRECT:** Specifying an `"esr"` parameter for Resistors (`R`) or Capacitors (`C`).
* ✅ **CORRECT:** Use the exact parameter keys:
  * Resistor: `"value"` (must be a **string**, e.g., `"50.0"`). Resistors do NOT support an `esr` parameter.
  * Inductor: `"L"` (e.g., `"0.005"`) and `"esr"` (e.g., `"0.05"`). Only Inductors support the `esr` parameter.
  * Capacitor: `"C"` (e.g., `"0.0022"`) and `"vC0"` (e.g., `"34.0"`). Capacitors do NOT support an `esr` parameter.
  * AC Voltage Source: `"amplitude"` and `"frequency"` (e.g., `"311.12"`).

### E. Terminal Names
* ❌ **INCORRECT:** Using spatial directions like `"top"`, `"bottom"`, `"left"`, `"right"`.
* ✅ **CORRECT:** Use the exact terminal names:
  * Passives (`R`, `L`, `C`, `D`, `AC_V`, `V`): `"A"` and `"B"`
  * Switches (`vg-FET`): `"D"` (Drain) and `"S"` (Source)
  * Ground (`GND`): `"Gnd"`
  * Signal Goto/From (`GOTO_SIG`/`FROM_SIG`): `"In"` and `"Out"`

### F. Ground Node Requirement
* ❌ **INCORRECT:** Omitting a ground component.
* ✅ **CORRECT:** Every circuit MUST contain a `GND` block connected to the common negative rail to allow the MNA matrix solver to compile.

### G. Plot Configuration Trace Names
* ❌ **INCORRECT:** Referencing a Voltmeter trace by its output pin (e.g., `"VM_AC.Out"` or `"VM_AC.OutV"`).
* ❌ **INCORRECT:** Referencing a component variable directly by its raw ID (e.g., `"C1"` or `"L1"`).
* ✅ **CORRECT:** Reference trace variables inside `plotConfiguration` as follows:
  * Voltmeter measurements: Use the Voltmeter's component ID directly (e.g., `"VM_AC"` or `"VM_DC"`).
  * Component voltages: Use the `"V_compId"` prefix pattern (e.g., `"V_C1"` or `"V_R_load"`).
  * Component currents: Use the `"I_compId"` prefix pattern (e.g., `"I_L1"` or `"I_vgFET1"`).

---

## 2. File Structure Overview

A SimPEL schematic file is a single JSON object containing three main sections:
1. `components`: An array of devices with positions, rotations, and parameters.
2. `wires`: An array representing point-to-point connections between component terminals.
3. `simulationSettings`: Configuration for the numerical solver.

### Root JSON Schema
```json
{
  "components": [],
  "wires": [],
  "simulationSettings": {
    "stopTime": "0.01",
    "stepSize": "1e-5",
    "solver": "radau",
    "stepType": "variable"
  }
}
```

---

## 3. Recommended Component Library

SimPEL supports both power-stage (electrical) and signal-stage (control) blocks. To create clean, professional schematics with minimal clutter, **prioritize using the following 10 blocks**:

### 1. Resistor (`R`)
* **Type Name:** `R`
* **Default Label:** `Resistor`
* **Terminals:** `A` (top/inlet), `B` (bottom/outlet)
* **Parameters:**
  * `value`: Resistance in ohms (e.g., `"10.0"`, `"5"`, `"1.2k"`).
  * `plotV`: `"1"` (optional, logs voltage across resistor).
  * `plotI`: `"1"` (optional, logs current through resistor).

### 2. Inductor (`L`)
* **Type Name:** `L`
* **Default Label:** `Inductor`
* **Terminals:** `A` (top/inlet), `B` (bottom/outlet)
* **Parameters:**
  * `L`: Inductance in henries (e.g., `"330u"`, `"10m"`).
  * `esr`: Equivalent series resistance in ohms (e.g., `"0.02"`, `"0"`).
  * `plotI`: `"1"` (optional, logs inductor current).

### 3. Capacitor (`C`)
* **Type Name:** `C`
* **Default Label:** `Capacitor`
* **Terminals:** `A` (top/inlet), `B` (bottom/outlet)
* **Parameters:**
  * `C`: Capacitance in farads (e.g., `"100u"`, `"22u"`).
  * `vC0`: Initial voltage in volts (e.g., `"0.0"`).
  * `plotV`: `"1"` (optional, logs capacitor voltage).

### 4. Diode (`D`)
* **Type Name:** `D`
* **Default Label:** `Diode`
* **Terminals:** `A` (anode), `B` (cathode)
* **Parameters:**
  * `Ron`: Forward conduction resistance (e.g., `"1e-3"`).
  * `Roff`: Reverse leakage resistance (e.g., `"1e5"`).
  * `Vd`: Forward threshold voltage drop (e.g., `"0.7"`).

### 5. Variable-Gate MOSFET (`vg-FET`)
* **Type Name:** `vg-FET`
* **Default Label:** `vg-FET Switch`
* **Terminals:** `D` (drain), `S` (source)
* **MANDATORY USE RULE:** The `vg-FET` **must always** be used for all controlled switching applications (including standard MOSFETs, IGBTs, BJTs, etc.). Do not use standard 3-terminal `MOSFET` blocks.
* **CRITICAL NOTE:** Unlike a standard MOSFET, the `vg-FET` **does not have a physical gate terminal (`G`) on the schematic**. Instead, it is controlled wirelessly.
* **Parameters:**
  * `Ron`: Conduction resistance (e.g., `"1e-3"`).
  * `Roff`: Off-state resistance (e.g., `"1e5"`).
  * `Gate_Signal_Label`: String name matching the `tag` of a `GOTO_SIG` block (e.g., `"pwm_gate"`). The solver automatically routes the control signal.

### 6. C-Script (`CSCRIPT`)
* **Type Name:** `CSCRIPT`
* **Default Label:** `Controller Script`
* **Terminals:** Dynamically discovered based on the code.
* **Parameters:**
  * `code`: C++-like block code containing `initialize()` and `step()` routines. Refer to `cscript_block_guide.md` for syntax rules.
  * `timestep`: Continuous (`"0"`) or discrete sampling step (e.g., `"1e-5"`).

### 7. Signal From (`FROM_SIG`)
* **Type Name:** `FROM_SIG`
* **Default Label:** `Signal From`
* **Terminals:** `Out` (right-side output terminal)
* **Parameters:**
  * `tag`: Channel tag matching a `GOTO_SIG` block (e.g., `"v_feedback"`). Wireless signal receiver.

### 8. Signal Goto (`GOTO_SIG`)
* **Type Name:** `GOTO_SIG`
* **Default Label:** `Signal Goto`
* **Terminals:** `In` (left-side input terminal)
* **Parameters:**
  * `tag`: Channel tag matching `FROM_SIG` or `vg-FET`'s `Gate_Signal_Label` (e.g., `"pwm_gate"`). Wireless signal transmitter.

### 9. Probe (`PROBE`)
* **Type Name:** `PROBE`
* **Default Label:** `Internal Probe`
* **Terminals:** Dynamically generated output terminals named after the probed signals.
* **Parameters:**
  * `target`: ID of the physical component to probe (e.g., `"D1"`).
  * `selected_signals`: Comma-separated list of signals (e.g., `"Conducting_D1,V_D1"`). Exposes output pins for each signal on the right side of the block.

### 10. Pulse Generator (`PULSE_GEN`)
* **Type Name:** `PULSE_GEN`
* **Default Label:** `Pulse Generator`
* **Terminals:** `Out` (right-side output terminal)
* **Parameters:**
  * `amplitude`: Amplitude of the pulse (e.g., `"1.0"`).
  * `period`: Periodic interval in seconds (e.g., `"50u"` for 20 kHz).
  * `width`: Pulse width duty cycle fraction (e.g., `"0.5"` for 50%).
  * `delay`: Phase delay in seconds (e.g., `"0.0"`).

---

## 4. Placement, Rotations, and Grid Rules

To ensure generated schematics look neat and wires connect correctly without visual overlaps:
1. **Grid Alignment:** Use a **20-pixel grid**. All component `x` and `y` coordinates should be multiples of 20 (e.g., `x: 100`, `y: 320`).
2. **Rotations:** Component `rotation` is specified in degrees. Supported values are:
   * `0`: Vertical orientation (standard vertical resistor, source positive terminal on top).
   * `90`: Horizontal orientation (standard horizontal resistor, input left, output right).
   * `180`: Rotated 180 degrees (often used to flip diode directions downwards).
   * `270`: Rotated 270 degrees.
3. **Reference Ground Node:** Every electrical circuit MUST contain a `GND` block (Type: `GND`, Terminals: `Gnd`) connected to the reference node (typically the negative DC rail). Without a ground reference, the simulation matrix cannot be solved.

---

## 5. Connectivity and Wire Schema

Wires connect terminals (pins) between components or hook onto existing wires to form junctions (branches). Wires are routed automatically by the editor and do not require specifying path coordinates.

There are three connection topologies:

### A. Pin-to-Pin Connection (Series Connection)
Connects a physical pin of one component directly to a physical pin of another. Both `from` and `to` are of `"type": "pin"`.
```json
{
  "id": "W1",
  "from": {
    "type": "pin",
    "compId": "V_in",
    "terminal": "A"
  },
  "to": {
    "type": "pin",
    "compId": "Q1",
    "terminal": "D"
  },
  "manualPath": null
}
```

### B. Pin-to-Wire Connection (Branch / T-Junction)
Connects a component's pin to an existing wire to create a parallel tap or branch. One side has `"type": "wire"` and specifies `"wireId"`.
```json
{
  "id": "W2",
  "from": {
    "type": "wire",
    "wireId": "W1"
  },
  "to": {
    "type": "pin",
    "compId": "D1",
    "terminal": "B"
  },
  "manualPath": null
}
```

### C. Wire-to-Wire Connection (Multi-segment Junction)
Taps an existing wire segment onto another wire segment. Both sides have `"type": "wire"`.
```json
{
  "id": "W3",
  "from": {
    "type": "wire",
    "wireId": "W1"
  },
  "to": {
    "type": "wire",
    "wireId": "W2"
  },
  "manualPath": null
}
```

---

## 6. Reference to Example Database

For a comprehensive collection of working schematics and template JSONs (including Buck converters, H-Bridge inverters, 3-Phase VSIs, Dual Active Bridge converters, and more), refer to the companion database file [example_database.md](file:///d:/01-Soft%20Dev%20Projects/circuitsim-pro/example_database.md).
