# SimPEL Schematic Layout Generation Guide

This guide describes the JSON layout schema, coordinate rules, and connectivity architecture of the SimPEL visual schematic editor. Use this document to instruct AI models or custom agents to generate valid, syntactically correct schematic files that can be imported directly into the tool.

---

## 1. File Structure Overview

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

## 2. Recommended Component Library

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

## 3. Placement, Rotations, and Grid Rules

To ensure generated schematics look neat and wires connect correctly without visual overlaps:
1. **Grid Alignment:** Use a **20-pixel grid**. All component `x` and `y` coordinates should be multiples of 20 (e.g., `x: 100`, `y: 320`).
2. **Rotations:** Component `rotation` is specified in degrees. Supported values are:
   * `0`: Vertical orientation (standard vertical resistor, source positive terminal on top).
   * `90`: Horizontal orientation (standard horizontal resistor, input left, output right).
   * `180`: Rotated 180 degrees (often used to flip diode directions downwards).
   * `270`: Rotated 270 degrees.
3. **Reference Ground Node:** Every electrical circuit MUST contain a `GND` block (Type: `GND`, Terminals: `Gnd`) connected to the reference node (typically the negative DC rail). Without a ground reference, the simulation matrix cannot be solved.

---

## 4. Connectivity and Wire Schema

Wires connect terminals (pins) between components. Wires are routed automatically by the editor and do not require specifying path coordinates.

### Wire Object JSON
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
    "compId": "R1",
    "terminal": "A"
  },
  "manualPath": null
}
```

---
