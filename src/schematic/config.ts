import { getDetailedComponentPins, DETAILED_COMPONENTS } from './detailedLibrary';

// Configuration and parameters definition for schematic components
export const COMPONENT_PINS: Record<string, any> = {
  R:   { A: {x: 0, y: -40, dx: 0, dy: -1}, B: {x: 0, y: 40, dx: 0, dy: 1} },
  L:   { A: {x: 0, y: -40, dx: 0, dy: -1}, B: {x: 0, y: 40, dx: 0, dy: 1} },
  C:   { A: {x: 0, y: -40, dx: 0, dy: -1}, B: {x: 0, y: 40, dx: 0, dy: 1} },
  S:   { A: {x: 0, y: -40, dx: 0, dy: -1}, B: {x: 0, y: 40, dx: 0, dy: 1} },
  D:   { A: {x: 0, y: -40, dx: 0, dy: -1}, B: {x: 0, y: 40, dx: 0, dy: 1} },
  V:   { A: {x: 0, y: -40, dx: 0, dy: -1}, B: {x: 0, y: 40, dx: 0, dy: 1} },
  I:   { A: {x: 0, y: -40, dx: 0, dy: -1}, B: {x: 0, y: 40, dx: 0, dy: 1} },
  VM:  { A: {x: 0, y: -40, dx: 0, dy: -1}, B: {x: 0, y: 40, dx: 0, dy: 1}, Out: {x: 20, y: 0, dx: 1, dy: 0} },
  AM:  { A: {x: 0, y: -40, dx: 0, dy: -1}, B: {x: 0, y: 40, dx: 0, dy: 1}, Out: {x: 20, y: 0, dx: 1, dy: 0} },
  
  MOSFET: { D: {x: 0, y: -40, dx: 0, dy: -1}, S: {x: 0, y: 40, dx: 0, dy: 1}, G: {x: -20, y: 0, dx: -1, dy: 0} },
  AC_V:   { A: {x: 0, y: -40, dx: 0, dy: -1}, B: {x: 0, y: 40, dx: 0, dy: 1} },
  GND:    { Gnd: {x: 0, y: -20, dx: 0, dy: -1} },
  XFMR:   {}, // Pins dynamically computed in getComponentPins
  GEN_EBLOCK: {}, // Pins dynamically computed in getComponentPins

  CONST:  { Out: {x: 20, y: 0, dx: 1, dy: 0} },
  GAIN:   { In: {x: -20, y: 0, dx: -1, dy: 0}, Out: {x: 20, y: 0, dx: 1, dy: 0} },
  PID:    { In: {x: -20, y: 0, dx: -1, dy: 0}, Out: {x: 20, y: 0, dx: 1, dy: 0} },
  SUM:    { A: {x: -20, y: -20, dx: -1, dy: 0}, B: {x: -20, y: 20, dx: -1, dy: 0}, Out: {x: 20, y: 0, dx: 1, dy: 0} },
  PWM:    { In: {x: -20, y: 0, dx: -1, dy: 0}, Out: {x: 20, y: 0, dx: 1, dy: 0} },
  TRI:    { Out: {x: 20, y: 0, dx: 1, dy: 0} },
  COMP:   { Plus: {x: -20, y: -20, dx: -1, dy: 0}, Minus: {x: -20, y: 20, dx: -1, dy: 0}, Out: {x: 20, y: 0, dx: 1, dy: 0} },
  AND:    { A: {x: -20, y: -20, dx: -1, dy: 0}, B: {x: -20, y: 20, dx: -1, dy: 0}, Out: {x: 20, y: 0, dx: 1, dy: 0} },
  OR:     { A: {x: -20, y: -20, dx: -1, dy: 0}, B: {x: -20, y: 20, dx: -1, dy: 0}, Out: {x: 20, y: 0, dx: 1, dy: 0} },
  NOT:    { In: {x: -20, y: 0, dx: -1, dy: 0}, Out: {x: 20, y: 0, dx: 1, dy: 0} },
  FCN:    { In: {x: -20, y: 0, dx: -1, dy: 0}, Out: {x: 20, y: 0, dx: 1, dy: 0} },
  PROD:   { In1: {x: -20, y: -20, dx: -1, dy: 0}, In2: {x: -20, y: 20, dx: -1, dy: 0}, Out: {x: 20, y: 0, dx: 1, dy: 0} },

  PROBE:  { OutV: {x: 20, y: -15, dx: 1, dy: 0}, OutI: {x: 20, y: 15, dx: 1, dy: 0} },
  SCOPE:  { In1: {x: -20, y: -20, dx: -1, dy: 0}, In2: {x: -20, y: 20, dx: -1, dy: 0} }
};

// Helper to parse turns lists (e.g. "[100 100]" or "100 50" or "[100]")
export function parseTurnsList(str: string): number[] {
  if (!str) return [100];
  let clean = str.replace(/[\[\]]/g, '');
  let parts = clean.split(/[\s,;]+/).filter(x => x.trim() !== '');
  let turns = parts.map(x => parseInt(x) || 100);
  if (turns.length === 0) return [100];
  return turns;
}

// Return pins map dynamically based on component type and customized parameter options
export function getComponentPins(comp: any): Record<string, any> {
  if (!comp) return {};
  if (comp.type === 'SUBSYSTEM') {
    const pins: Record<string, any> = {};
    const subschematic = comp.sub_schematic || { components: [] };
    const inports = (subschematic.components || [])
      .filter((c: any) => c.type === 'INPORT')
      .sort((a: any, b: any) => (a.y ?? 0) - (b.y ?? 0));
    const outports = (subschematic.components || [])
      .filter((c: any) => c.type === 'OUTPORT')
      .sort((a: any, b: any) => (a.y ?? 0) - (b.y ?? 0));
    const eports = (subschematic.components || [])
      .filter((c: any) => c.type === 'E_PORT')
      .sort((a: any, b: any) => (a.x ?? 0) - (b.x ?? 0));

    const numLeft = inports.length;
    const numRight = outports.length;
    const numBottom = eports.length;

    const width = Math.max(60, numBottom * 20 + 20);
    const height = Math.max(50, Math.max(numLeft, numRight) * 20 + 20);

    const halfW = width / 2;
    const halfH = height / 2;

    // Arrange inports on the left edge (-halfW, yOffset)
    inports.forEach((ip: any, idx: number) => {
      const yOffset = - (numLeft - 1) * 10 + idx * 20;
      pins[ip.id] = { x: -halfW, y: Math.round(yOffset), dx: -1, dy: 0 };
    });

    // Arrange outports on the right edge (halfW, yOffset)
    outports.forEach((op: any, idx: number) => {
      const yOffset = - (numRight - 1) * 10 + idx * 20;
      pins[op.id] = { x: halfW, y: Math.round(yOffset), dx: 1, dy: 0 };
    });

    // Arrange eports on the bottom edge (xOffset, halfH)
    eports.forEach((ep: any, idx: number) => {
      const xOffset = - (numBottom - 1) * 10 + idx * 20;
      pins[ep.id] = { x: Math.round(xOffset), y: halfH, dx: 0, dy: 1 };
    });

    return pins;
  }
  if (comp.type === 'SUM_ROUND') {
    const numInputs = parseInt(comp.parameters && comp.parameters.inputs) || 2;
    const pins: Record<string, any> = {};
    const radius = Math.max(16, (numInputs - 1) * 10 + 5);
    for (let i = 1; i <= numInputs; i++) {
      const y = - (numInputs - 1) * 10 + (i - 1) * 20;
      const x = - Math.sqrt(Math.max(0, radius * radius - y * y));
      pins[`In${i}`] = { x: Math.round(x), y: Math.round(y), dx: -1, dy: 0 };
    }
    pins['Out'] = { x: radius, y: 0, dx: 1, dy: 0 };
    return pins;
  }
  if (comp.type === 'SUM_RECT' || comp.type === 'PRODUCT_RECT') {
    const numInputs = parseInt(comp.parameters && comp.parameters.inputs) || 2;
    const pins: Record<string, any> = {};
    const width = 50;
    const height = Math.max(40, numInputs * 20);
    const halfW = width / 2;
    for (let i = 1; i <= numInputs; i++) {
      const y = - (numInputs - 1) * 10 + (i - 1) * 20;
      pins[`In${i}`] = { x: -halfW, y: Math.round(y), dx: -1, dy: 0 };
    }
    pins['Out'] = { x: halfW, y: 0, dx: 1, dy: 0 };
    pins['Ctrl'] = { x: -halfW, y: -height / 2, dx: -1, dy: 0 };
    return pins;
  }
  if (comp.type === 'MULTIPORT_SWITCH') {
    const numInputs = parseInt(comp.parameters && comp.parameters.inputs) || 3;
    const pins: Record<string, any> = {};
    const width = 50;
    const height = Math.max(40, numInputs * 20);
    const halfW = width / 2;
    for (let i = 1; i <= numInputs; i++) {
      const y = - (numInputs - 1) * 10 + (i - 1) * 20;
      pins[`In${i}`] = { x: -halfW, y: Math.round(y), dx: -1, dy: 0 };
    }
    pins['Out'] = { x: halfW, y: 0, dx: 1, dy: 0 };
    pins['Ctrl'] = { x: -halfW, y: -height / 2, dx: -1, dy: 0 };
    return pins;
  }
  const detailedPins = getDetailedComponentPins(comp.type);
  if (detailedPins) return detailedPins;
  if (comp.type === 'XFMR') {
    const pTurns = parseTurnsList(comp.parameters && comp.parameters.primary_turns);
    const sTurns = parseTurnsList(comp.parameters && comp.parameters.secondary_turns);
    const Np = pTurns.length;
    const Ns = sTurns.length;
    const pins: Record<string, any> = {};
    const spacing = 60;
    
    // Primary windings (left)
    for (let i = 0; i < Np; i++) {
      const yCenter = Math.round((i - (Np - 1) / 2) * spacing);
      pins[`P${i+1}A`] = { x: -20, y: yCenter - 20, dx: -1, dy: 0 };
      pins[`P${i+1}B`] = { x: -20, y: yCenter + 20, dx: -1, dy: 0 };
    }
    
    // Secondary windings (right)
    for (let j = 0; j < Ns; j++) {
      const yCenter = Math.round((j - (Ns - 1) / 2) * spacing);
      pins[`S${j+1}A`] = { x: 20, y: yCenter - 20, dx: 1, dy: 0 };
      pins[`S${j+1}B`] = { x: 20, y: yCenter + 20, dx: 1, dy: 0 };
    }
    return pins;
  }
  if (comp.type === 'SCOPE') {
    const numChannels = parseInt(comp.parameters && comp.parameters.channels) || 2;
    const pins: Record<string, any> = {};
    for (let i = 1; i <= numChannels; i++) {
      let yOffset = 0;
      if (numChannels > 1) {
        yOffset = -20 + (40 * (i - 1)) / (numChannels - 1);
      }
      pins[`In${i}`] = { x: -20, y: Math.round(yOffset), dx: -1, dy: 0 };
    }
    return pins;
  }
  if (comp.type === 'MUX') {
    const numInputs = parseInt(comp.parameters && comp.parameters.inputs) || 2;
    const pins: Record<string, any> = {};
    for (let i = 1; i <= numInputs; i++) {
      let yOffset = 0;
      if (numInputs > 1) {
        yOffset = -20 + (40 * (i - 1)) / (numInputs - 1);
      }
      pins[`In${i}`] = { x: -20, y: Math.round(yOffset), dx: -1, dy: 0 };
    }
    pins['Out'] = { x: 20, y: 0, dx: 1, dy: 0 };
    return pins;
  }
  if (comp.type === 'DEMUX') {
    const numOutputs = parseInt(comp.parameters && comp.parameters.outputs) || 2;
    const pins: Record<string, any> = {};
    pins['In'] = { x: -20, y: 0, dx: -1, dy: 0 };
    for (let i = 1; i <= numOutputs; i++) {
      let yOffset = 0;
      if (numOutputs > 1) {
        yOffset = -20 + (40 * (i - 1)) / (numOutputs - 1);
      }
      pins[`Out${i}`] = { x: 20, y: Math.round(yOffset), dx: 1, dy: 0 };
    }
    return pins;
  }
  if (comp.type === 'GEN_EBLOCK') {
    let n = parseInt(comp.parameters && comp.parameters.terminals);
    if (isNaN(n) || n <= 0) {
      n = senseTerminalsFromCode(comp.parameters && comp.parameters.code || "");
    }
    const pins: Record<string, any> = {};
    const spacing = 20;
    const halfWidth = 50;
    for (let i = 1; i <= n; i++) {
      const y = n > 1 ? Math.round((i - 1 - (n - 1) / 2) * spacing) : 0;
      pins[`T${i}`] = { x: -halfWidth, y: y, dx: -1, dy: 0 };
    }
    return pins;
  }
  if (comp.type === 'CSCRIPT') {
    const ports = discoverPortsJS(comp.parameters && comp.parameters.code);
    const inList = ports.inputs;
    const outList = ports.outputs;
    const pins: Record<string, any> = {};
    const spacing = 40;
    const Ni = inList.length;
    const No = outList.length;
    
    let maxInLen = 0;
    for (const p of inList) {
      if (p.length > maxInLen) maxInLen = p.length;
    }
    let maxOutLen = 0;
    for (const p of outList) {
      if (p.length > maxOutLen) maxOutLen = p.length;
    }
    const halfWidth = Math.max(50, Math.round((100 + maxInLen * 6 + maxOutLen * 6) / 2));
    
    for (let i = 0; i < Ni; i++) {
      const y = Ni > 1 ? Math.round((i - (Ni - 1) / 2) * spacing) : 0;
      pins[inList[i]] = { x: -halfWidth, y: y, dx: -1, dy: 0 };
    }
    for (let j = 0; j < No; j++) {
      const y = No > 1 ? Math.round((j - (No - 1) / 2) * spacing) : 0;
      pins[outList[j]] = { x: halfWidth, y: y, dx: 1, dy: 0 };
    }
    return pins;
  }
  return COMPONENT_PINS[comp.type] || {};
}

// Helper to discover input and output ports in Javascript code for the schematic editor
export function discoverPortsJS(code: string): { inputs: string[]; outputs: string[] } {
  if (!code) return { inputs: [], outputs: [] };
  const inputs = new Set<string>();
  const outputs = new Set<string>();
  
  const inputRegex = /inputs\s*\[\s*(['"`])(.*?)\1\s*\]|inputs\.get\s*\(\s*(['"`])(.*?)\3\s*(?:,[^)]*)?\)/g;
  const outputRegex = /outputs\s*\[\s*(['"`])(.*?)\1\s*\]|outputs\.(?:get|set)\s*\(\s*(['"`])(.*?)\3\s*(?:,[^)]*)?\)/g;
  
  let match;
  inputRegex.lastIndex = 0;
  outputRegex.lastIndex = 0;
  
  while ((match = inputRegex.exec(code)) !== null) {
    const port = match[2] || match[4];
    if (port) inputs.add(port);
  }
  while ((match = outputRegex.exec(code)) !== null) {
    const port = match[2] || match[4];
    if (port) outputs.add(port);
  }
  
  return {
    inputs: Array.from(inputs).sort(),
    outputs: Array.from(outputs).sort()
  };
}

export function senseTerminalsFromCode(code: string): number {
  if (!code) return 3;
  const ports = discoverPortsJS(code);
  let maxTerm = 0;
  for (const p of [...ports.inputs, ...ports.outputs]) {
    const match = p.match(/^[vi](\d+)$/);
    if (match) {
      const val = parseInt(match[1]);
      if (val > maxTerm) maxTerm = val;
    }
  }
  return maxTerm > 0 ? maxTerm : 3;
}

export function getTerminalNameFromCode(code: string, index: number): string {
  if (!code) return `T${index}`;
  const ports = discoverPortsJS(code);
  const input = ports.inputs[index - 1];
  if (input) {
    const match = input.match(/^[vV]_?([a-zA-Z0-9_]+)$/);
    if (match) return match[1];
    return input;
  }
  return `T${index}`;
}

// Default engineering parameters for each component
export const DEFAULT_PARAMETERS: Record<string, any> = {
  R:      { value: "10", esr: "0" },
  L:      { L: "10m", esr: "50m", iL0: "0" },
  C:      { C: "100u", esr: "10m", vC0: "0" },
  S:      { Ron: "1m", Roff: "1M" },
  D:      { Vd: "0.7", Ron: "1m", Roff: "1M" },
  MOSFET: { Ron: "10m", Roff: "1M" },
  V:      { value: "24" },
  I:      { value: "1" },
  AC_V:   { amplitude: "12", frequency: "50" },
  XFMR:   { primary_turns: "[100]", secondary_turns: "[100]" },
  CONST:  { value: "1.0" },
  GAIN:   { K: "2.5" },
  PID:    { Kp: "2.5", Ki: "50.0", Kd: "0" },
  PWM:    { frequency: "10k", min: "0", max: "1" },
  TRI:    { frequency: "10k", min: "0", max: "1" },
  COMP:   { hysteresis: "0" },
  FCN:    { expr: "u[0] * 2" },
  PROD:   {},
  SUM:    {},
  VM:     {},
  AM:     {},
  GND:    {},
  PROBE:  { target: "" },
  SCOPE:  { channels: "2" },
  MUX:    { inputs: "2" },
  DEMUX:  { outputs: "2" },
  CSCRIPT: {
    timestep: "0",
    plot_inputs: "true",
    plot_outputs: "true",
    plot_custom_vars: "",
    code: `void initialize() {
    state["integral"] = 0.0;
    state["last_time"] = 0.0;
}

void step() {
    // Inputs: inputs["ref"], inputs["meas"]
    // Outputs: outputs["gate1"], outputs["gate2"], outputs["gate3"], outputs["gate4"]
    double dt = time - state["last_time"];
    state["last_time"] = time;
    
    double kp = params.get("kp", 2.5);
    double ki = params.get("ki", 50.0);
    
    double error = inputs.get("ref", 0.0) - inputs.get("meas", 0.0);
    state["integral"] += error * dt;
    
    double duty = kp * error + ki * state["integral"];
    duty = max(0.0, min(1.0, duty));
    
    // Carrier
    double freq = params.get("fc", 10e3);
    double period = 1.0 / freq;
    double carrier = (time % period) / period;
    
    double pulse = duty > carrier ? 1.0 : 0.0;
    outputs["gate1"] = pulse;
    outputs["gate2"] = 1.0 - pulse;
    outputs["gate3"] = pulse;
    outputs["gate4"] = 1.0 - pulse;
}`
  },
  GEN_EBLOCK: {
    terminals: "3",
    timestep: "0",
    plot_inputs: "true",
    plot_outputs: "true",
    plot_custom_vars: "",
    code: `void initialize() {
    state["integral"] = 0.0;
    state["last_time"] = 0.0;
}

void step() {
    // Inputs: terminal voltages v1, v2, v3 (relative to ground node_0)
    // Outputs: terminal currents i1, i2, i3 (injected into nodes)
    double v1 = inputs.get("v1", 0.0);
    double v2 = inputs.get("v2", 0.0);
    double v3 = inputs.get("v3", 0.0);

    // Simple resistive load model injecting currents
    // i = -v / R, to act as a load of 10 Ohms
    outputs.set("i1", -v1 / 10.0);
    outputs.set("i2", -v2 / 10.0);
    outputs.set("i3", -v3 / 10.0);
}`
  }
};

// Full standard type names for export
export const EXPORT_TYPE_NAMES: Record<string, string> = {
  R:      "Resistor",
  L:      "Inductor",
  C:      "Capacitor",
  S:      "Switch",
  D:      "Diode",
  MOSFET: "MOSFET",
  V:      "VoltageSource",
  I:      "CurrentSource",
  AC_V:   "ACVoltageSource",
  XFMR:   "Transformer",
  CONST:  "Constant",
  GAIN:   "Gain",
  PID:    "PI_Controller",
  SUM:    "SummingJunction",
  PWM:    "PWM_Generator",
  TRI:    "Triangle_Carrier",
  COMP:   "Comparator",
  AND:    "AND_Gate",
  OR:     "OR_Gate",
  NOT:    "NOT_Gate",
  FCN:    "CustomFunction",
  PROD:   "Product",
  VM:     "Voltmeter",
  AM:     "Ammeter",
  PROBE:  "UnifiedProbe",
  SCOPE:  "Oscilloscope",
  MUX:    "Mux",
  DEMUX:  "Demux",
  CSCRIPT: "CustomScript",
  GEN_EBLOCK: "GeneralizedElectricalBlock"
};

// Dynamically populate detailed library default parameters and export names
DETAILED_COMPONENTS.forEach(c => {
  if (c.defaultParameters && !DEFAULT_PARAMETERS[c.type]) {
    DEFAULT_PARAMETERS[c.type] = c.defaultParameters;
  } else if (!DEFAULT_PARAMETERS[c.type]) {
    DEFAULT_PARAMETERS[c.type] = {};
  }
  if (!EXPORT_TYPE_NAMES[c.type]) {
    EXPORT_TYPE_NAMES[c.type] = c.label.replace(/\s+/g, '_');
  }
});

export function discoverParamsFromCode(code: string): { name: string; value: string }[] {
  if (!code) return [];
  const params: { name: string; value: string }[] = [];
  const seen = new Set<string>();
  const regex = /^[ \t]*([a-zA-Z_][a-zA-Z0-9_]*)[ \t]*=[ \t]*([+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?))[ \t]*;/gm;
  
  let match;
  regex.lastIndex = 0;
  while ((match = regex.exec(code)) !== null) {
    const name = match[1];
    const value = match[2];
    if (name && !seen.has(name)) {
      seen.add(name);
      params.push({ name, value });
    }
  }
  return params;
}

export function updateParamInCode(code: string, name: string, value: string): string {
  if (!code) return code;
  const escapedName = name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`^([ \\t]*${escapedName}[ \\t]*=[ \\t]*)[+-]?(?:(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?)([ \\t]*;)`, 'gm');
  return code.replace(regex, `$1${value}$2`);
}
