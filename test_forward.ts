import { CircuitSimulator } from './src/solver_ts.js';

const netlist = {
  // ... (keep the same structure)

  physical_stage: {
    voltage_sources: [
      { id: "V_in", nodes: ["node_1", "node_0"], value: 24, src_type: "dc" }
    ],
    resistors: [
      { id: "R_load", nodes: ["node_4", "node_0"], value: 4 }
    ],
    inductors: [
      { id: "L_filter", nodes: ["node_3", "node_4"], L: 10e-6, esr: 2e-3 }
    ],
    capacitors: [
      { id: "C1", nodes: ["node_4", "node_0"], C: 1000e-6, esr: 0, vC0: 0 }
    ],
    switches: [
      { id: "vgFET1", type: "vg-FET", nodes: ["node_2", "node_0"], Ron: 0.01, Roff: 1e6, channels: { Ctrl: "S1" } }
    ],
    diodes: [
      { id: "D1", nodes: ["node_5", "node_3"], Vd: 0.7, Ron: 0.005, Roff: 1e6 },
      { id: "D2", nodes: ["node_0", "node_3"], Vd: 0.7, Ron: 0.001, Roff: 1e6 }
    ],
    transformers: [
      {
        id: "XFMR1",
        primary_windings: [ { nodes: ["node_1", "node_2"], turns: 100 } ],
        secondary_windings: [ { nodes: ["node_5", "node_0"], turns: 125 } ]
      }
    ]
  },
  control_loops: [
    {
      id: "CSCRIPT1",
      code: `
        double v_target = 12.0;
        double v_actual = inputs[0];
        double error = v_target - v_actual;
        double P = 0.25 * error;
        double next_integrator = integrator + 120.0 * error * 1e-6;
        double duty = P + next_integrator;
        if (duty > 0.5) { duty = 0.5; if (error < 0) integrator = next_integrator; }
        else if (duty < 0.01) { duty = 0.01; if (error > 0) integrator = next_integrator; }
        else { integrator = next_integrator; }
        double next_ramp = ramp + 10000.0 * 1e-6;
        ramp = (next_ramp >= 1.0) ? next_ramp - 1.0 : next_ramp;
        outputs[0] = (ramp < duty) ? 1.0 : 0.0;
      `,
      input_pins: ["node_4"], // measure V_out
      output_pins: ["S1"], // drive S1
      parameters: { integrator: 0, ramp: 0 }
    }
  ],
  simulation_parameters: {
    stopTime: 0.05,
    stepSize: 1e-6,
    solver: "euler",
    solverMethod: "ideal-pwl"
  }
};

const sim = new CircuitSimulator(
  netlist.physical_stage,
  netlist.control_loops,
  netlist.simulation_parameters
);

sim.runAsync(() => false, () => false).then(res => {
  console.log("Result keys:", Object.keys(res));
  if (res.signals) {
    console.log("Signals:", Object.keys(res.signals));
    if (res.signals["V_C1"]) {
      console.log("V_out (V_C1):", res.signals["V_C1"][res.signals["V_C1"].length - 1]);
    }
    if (res.custom_plots) {
      console.log("Custom plots:", Object.keys(res.custom_plots));
      console.log("Gate signal:", res.custom_plots["Ctrl_vgFET1"]?.slice(0, 10));
    }
  }
});
