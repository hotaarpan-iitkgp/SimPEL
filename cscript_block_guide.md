# SimPEL CustomScript (cscript) Block Code Generation Guide

This guide describes the syntax, execution model, data APIs, and mathematical constraints of the CustomScript (`cscript`) block in SimPEL. Pass this document to any AI model to generate valid, syntactically correct simulation blocks from text prompts.

---

## 1. Execution Model

A `cscript` block represents a discrete-time control block that executes line-by-line on every simulation time step. 
* **Parsing:** The simulator parses the script line-by-line, discarding single-line comments (`//`) and outer braces (`{`, `}`).
* **Phases:** The script is divided into two phases by matching block headers:
  * `initialize(...)` — Run once at the start of the simulation to set up initial state values.
  * `step(...)` — Run at every time step ($t = t_n$) to read input pins, update state values, and write output pins.

---

## 2. Port and State Access APIs

The simulator automatically discovers input and output pin names by parsing the script text. The script accesses parameters, states, inputs, and outputs using dedicated map arrays.

| Array / Variable | Scope | Read / Write | Syntax Example | Description |
| :--- | :--- | :--- | :--- | :--- |
| **`inputs`** | `step(...)` | **Read-Only** | `inputs["in1"]` or `inputs.get("in1")` | Maps to incoming signal channels connected to the block's input terminals. |
| **`outputs`** | `step(...)` | **Write-Only** | `outputs["out1"] = ...` | Maps to outgoing signal channels connected to the block's output terminals. |
| **`state`** | `initialize(...)`, `step(...)` | **Read & Write** | `state["x"] = ...` or `state_x = ...` | Persistent state variables stored across simulation time steps. |
| **`params`** | `initialize(...)`, `step(...)` | **Read-Only** | `params["Kp"]` or `params.get("Kp")` | Configurable static parameters defined in the block properties panel. |
| **`time`** | `step(...)` | **Read-Only** | `time` | Current simulation time in seconds (floating-point). |

---

## 3. Syntax Rules and Limitations

1. **Line-by-Line Assignment:** Every statement must be a single assignment on one line:
   `LHS = RHS` or `LHS += RHS` or `LHS -= RHS` or `LHS *= RHS`.
2. **Variable Definitions:** Local variables can be declared with standard type prefixes like `double`, `float`, `int`, or `auto`. The solver strips these prefixes during normalizations.
3. **No Semicolons Required:** Statements do not need to end with semicolons (the parser automatically trims them if present).
4. **Mathematical Expressions:** 
   * Standard math functions can be used directly: `sin`, `cos`, `tan`, `pow`, `sqrt`, `abs`, `exp`, `log`, `atan2`, `asin`, `acos`.
   * Do **not** prefix math functions with `std::`, `Math.`, or `math.` (e.g. use `sin(x)` instead of `Math.sin(x)`).
5. **No Control Structures:** Loops (`for`, `while`) and conditional blocks (`if/else`) are **not** supported directly in expression evaluation. Instead, use ternary operators (`? :`) for conditional branch logic:
   `outputs["y"] = (inputs["u"] > 0) ? 1.0 : -1.0`

---

## 4. Reference Templates and Examples

Use the templates below to construct prompts for custom blocks.

### Template 1: Integrator with Reset and Limits
Integrates an input signal `u` with a time constant `T` (or gain `Ki`), reset signal `reset`, and saturation limits `max_limit` / `min_limit`.
```cpp
initialize() {
    state["y"] = 0.0
}
step() {
    double u = inputs["u"]
    double rst = inputs["reset"]
    double dt = params["dt"]
    double Ki = params["Ki"]
    double max_limit = params["max"]
    double min_limit = params["min"]
    
    // Integrate or reset state
    double dy = u * Ki * dt
    double next_y = (rst > 0.5) ? 0.0 : state["y"] + dy
    
    // Limit state
    state["y"] = (next_y > max_limit) ? max_limit : ((next_y < min_limit) ? min_limit : next_y)
    outputs["y"] = state["y"]
}
```

### Template 2: Schmitt Trigger (Hysteresis Band)
Implements a non-inverting Schmitt Trigger with high threshold `V_high`, low threshold `V_low`, and output states `high_val` / `low_val`.
```cpp
initialize() {
    state["out"] = 0.0
}
step() {
    double u = inputs["u"]
    double v_h = params["V_high"]
    double v_l = params["V_low"]
    double out_h = params["high_val"]
    double out_l = params["low_val"]
    
    // Determine state transition based on current output state
    double next_out = (state["out"] > 0.5) ? ((u < v_l) ? out_l : out_h) : ((u > v_h) ? out_h : out_l)
    
    state["out"] = next_out
    outputs["y"] = next_out
}
```

### Template 3: Monostable Multivibrator (One-Shot Timer)
Generates a pulse of fixed duration `pulse_duration` when triggered by a rising edge on `trigger`.
```cpp
initialize() {
    state["timer"] = 0.0
    state["prev_trig"] = 0.0
    state["active"] = 0.0
}
step() {
    double trig = inputs["trigger"]
    double duration = params["pulse_duration"]
    double dt = params["dt"]
    
    // Detect rising edge
    double rising_edge = (trig > 0.5) && (state["prev_trig"] <= 0.5) ? 1.0 : 0.0
    
    // Start timer on trigger
    double start = (rising_edge > 0.5) ? 1.0 : state["active"]
    double new_timer = (rising_edge > 0.5) ? duration : state["timer"] - dt
    
    // Check timeout
    state["active"] = (new_timer <= 0.0) ? 0.0 : start
    state["timer"] = (new_timer <= 0.0) ? 0.0 : new_timer
    state["prev_trig"] = trig
    
    outputs["pulse"] = state["active"]
}
```

### Template 4: Discrete First-Order Low-Pass Filter
Implements a simple first-order RC low-pass filter with time constant `tau`.
```cpp
initialize() {
    state["y_prev"] = 0.0
}
step() {
    double u = inputs["u"]
    double tau = params["tau"]
    double dt = params["dt"]
    
    // Filter coefficient alpha = dt / (tau + dt)
    double alpha = dt / (tau + dt)
    double y = alpha * u + (1.0 - alpha) * state["y_prev"]
    
    state["y_prev"] = y
    outputs["y"] = y
}
```
