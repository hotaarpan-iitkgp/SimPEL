import { CircuitSimulator } from "./src/solver_ts";

console.log("=== Diode Spikes Validation Test Bench ===");

const physical_stage = [
  {
    id: "R_load",
    type: "Resistor",
    nodes: ["node_3", "node_0"],
    parameters: { value: "5", esr: "0" }
  },
  {
    id: "L1",
    type: "Inductor",
    nodes: ["node_2", "node_3"],
    parameters: { L: "0.00033", esr: "0.02", iL0: "0" }
  },
  {
    id: "C1",
    type: "Capacitor",
    nodes: ["node_3", "node_0"],
    parameters: { C: "0.0001", esr: "0", vC0: "0" }
  },
  {
    id: "V_in",
    type: "VoltageSource",
    nodes: ["node_1", "node_0"],
    parameters: { value: "24", src_type: "dc" }
  },
  {
    id: "D1",
    type: "Diode",
    nodes: ["node_0", "node_2"],
    parameters: { Vd: "0.7", Ron: "0.001", Roff: "100000" }
  },
  {
    id: "Q1",
    type: "Switch",
    nodes: ["node_1", "node_2"],
    channels: { Ctrl: "PWM_Comp.Out" },
    parameters: { Ron: "0.001", Roff: "100000" }
  }
];

const control_loops = [
  {
    id: "V_ref",
    type: "Constant",
    parameters: { value: "12", original_type: "CONST" },
    channels: { Out: "V_ref.Out" }
  },
  {
    id: "V_out_meter",
    type: "Voltmeter",
    nodes: ["node_3", "node_0"],
    channels: { Out: "V_out_meter.Out" }
  },
  {
    id: "SUM_RECT1",
    type: "SummingJunction",
    parameters: { signs: "+-" },
    channels: { In1: "V_ref.Out", In2: "V_out_meter.Out", Out: "SUM_RECT1.Out" }
  },
  {
    id: "PI_Reg",
    type: "PI_Controller",
    parameters: { Kp: "0.01", Ki: "5", Kd: "0" },
    channels: { In: "SUM_RECT1.Out", Out: "PI_Reg.Out" }
  },
  {
    id: "PWM_Modulator",
    type: "Triangle_Carrier",
    parameters: { frequency: "10000", min: "0", max: "1" },
    channels: { Out: "PWM_Modulator.Out" }
  },
  {
    id: "PWM_Comp",
    type: "Comparator",
    parameters: { hysteresis: "0" },
    channels: { Plus: "PI_Reg.Out", Minus: "PWM_Modulator.Out", Out: "PWM_Comp.Out" }
  },
  {
    id: "PROBE1",
    type: "PROBE",
    parameters: { target: "D1", selected_signals: "Conducting_D1,V_D1" }
  }
];

const sim_params = {
  t_end: 0.05,
  h: 1e-6,
  solver: "euler",
  step_type: "fixed"
};

try {
  console.log("Initializing CircuitSimulator with Buck converter netlist...");
  const sim = new CircuitSimulator(physical_stage, control_loops, sim_params);
  const result = sim.run();

  console.log(`Simulation complete! Calculated ${result.time.length} steps.`);

  // Check voltage of node_2 (cathode) and node_0 (anode = 0V)
  // Diode voltage is v_anode - v_cathode = 0 - v_node_2 = -v_node_2
  const node2_voltages = result.voltages["node_2"] || [];
  
  let max_vd = -Infinity;
  let min_vd = Infinity;
  let spike_count = 0;

  // Let's sample the switch states
  console.log("Control signals and probe values in first 20 steps:");
  for (let i = 0; i < Math.min(20, result.time.length); i++) {
    console.log(`t = ${result.time[i].toFixed(6)} s, v2 = ${result.voltages["node_2"][i].toFixed(4)} V, PI_Reg: ${result.signals["PI_Reg.Out"]?.[i]?.toFixed(4)}, Carrier: ${result.signals["PWM_Modulator.Out"]?.[i]?.toFixed(4)}, Comp Out: ${result.signals["PWM_Comp.Out"]?.[i]}, D1 Cond: ${result.signals["PROBE1.Conducting_D1"]?.[i]}, D1 V: ${result.signals["PROBE1.V_D1"]?.[i]?.toFixed(4)} V, D1 I: ${result.custom_plots["I_D1"]?.[i]?.toFixed(4)} A`);
  }

  let max_id = -Infinity;
  let min_id = Infinity;
  let current_spike_count = 0;

  for (let i = 0; i < node2_voltages.length; i++) {
    const vd = -node2_voltages[i];
    if (vd > max_vd) max_vd = vd;
    if (vd < min_vd) min_vd = vd;
    
    // Check if there are any non-physical voltage spikes (e.g. outside range [-30V, 5V])
    if (vd > 5.0 || vd < -35.0) {
      spike_count++;
    }

    const id = result.custom_plots["I_D1"]?.[i] ?? 0.0;
    if (id > max_id) max_id = id;
    if (id < min_id) min_id = id;

    // Check if there are any non-physical current spikes (e.g. greater than 20A, Buck inductor current starts at 0A and maxes out at ~3A in this configuration)
    if (id > 20.0 || id < -5.0) {
      current_spike_count++;
    }
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`Diode Voltage range: [${min_vd.toFixed(4)} V, ${max_vd.toFixed(4)} V]`);
  console.log(`Diode Current range: [${min_id.toFixed(4)} A, ${max_id.toFixed(4)} A]`);
  console.log(`Number of out-of-bounds voltage spikes: ${spike_count}`);
  console.log(`Number of out-of-bounds current spikes: ${current_spike_count}`);

  if (spike_count === 0 && current_spike_count === 0 && max_vd > 0.0 && max_vd < 1.5 && min_vd > -26.0) {
    console.log("\n✅ SUCCESS: Diode voltage and current are stable, physically accurate, and completely free of numerical spikes!");
    process.exit(0);
  } else {
    console.error(`\n❌ FAILURE: Diode simulation is unstable or incorrect. Out of bounds counts - V: ${spike_count}, I: ${current_spike_count}`);
    process.exit(1);
  }
} catch (err: any) {
  console.error("\n❌ ERROR: Simulation failed to run:", err);
  process.exit(1);
}
