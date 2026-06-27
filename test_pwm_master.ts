import { CircuitSimulator } from "./src/solver_ts";

console.log("=== PWM MASTER Validation Test Bench ===");

const config5 = [
  { id: 1, phase_source: "internal", phase: 0, level_shift: true, level_offset: 0.0 },
  { id: 2, phase_source: "internal", phase: 0, level_shift: true, level_offset: 1.0 },
  { id: 3, phase_source: "internal", phase: 0, level_shift: true, level_offset: 2.0 },
  { id: 4, phase_source: "internal", phase: 0, level_shift: true, level_offset: 3.0 },
  { id: 5, phase_source: "internal", phase: 0, level_shift: true, level_offset: 4.0 }
];

const config3 = [
  { id: 1, phase_source: "internal", phase: 0, level_shift: false, level_offset: 0.0 },
  { id: 2, phase_source: "internal", phase: 120, level_shift: false, level_offset: 0.0 },
  { id: 3, phase_source: "internal", phase: 240, level_shift: false, level_offset: 0.0 }
];

const control_loops = {
  constants: [
    {
      id: "REF",
      type: "Constant",
      original_type: "SINE_WAVE",
      amplitude: "2.5",
      frequency: "50",
      phase: "0",
      output: "REF.Out"
    }
  ],
  pwm_masters: [
    {
      id: "PWM5",
      type: "PWM_MASTER",
      input: "REF.Out",
      ext_phases: [undefined, undefined, undefined, undefined, undefined],
      outputs_direct: ["PWM5.OutDirect1", "PWM5.OutDirect2", "PWM5.OutDirect3", "PWM5.OutDirect4", "PWM5.OutDirect5"],
      outputs_compl: ["PWM5.OutCompl1", "PWM5.OutCompl2", "PWM5.OutCompl3", "PWM5.OutCompl4", "PWM5.OutCompl5"],
      num_carriers: 5,
      fc: "10k",
      dead_time: "1u",
      config: JSON.stringify(config5)
    },
    {
      id: "PWM3",
      type: "PWM_MASTER",
      input: "REF.Out",
      ext_phases: [undefined, undefined, undefined],
      outputs_direct: ["PWM3.OutDirect1", "PWM3.OutDirect2", "PWM3.OutDirect3"],
      outputs_compl: ["PWM3.OutCompl1", "PWM3.OutCompl2", "PWM3.OutCompl3"],
      num_carriers: 3,
      fc: "10k",
      dead_time: "2u",
      config: JSON.stringify(config3)
    }
  ]
};

const sim_params = {
  t_end: 0.001,
  h: 1e-6,
  solver: "euler",
  step_type: "fixed"
};

try {
  const sim = new CircuitSimulator([], control_loops as any, sim_params);
  const result = sim.run();
  
  console.log("Simulation complete! Time steps count:", result.time.length);
  
  let deadTimeViolations = 0;
  
  const refSigs = result.signals["REF.Out"] || [];
  const p3d1 = result.signals["PWM3.OutDirect1"] || [];
  const p3c1 = result.signals["PWM3.OutCompl1"] || [];
  const p3d2 = result.signals["PWM3.OutDirect2"] || [];
  const p3d3 = result.signals["PWM3.OutDirect3"] || [];
  
  const p5d1 = result.signals["PWM5.OutDirect1"] || [];
  const p5d3 = result.signals["PWM5.OutDirect3"] || [];
  const p5d5 = result.signals["PWM5.OutDirect5"] || [];

  for (let stepIdx = 0; stepIdx < result.time.length; stepIdx++) {
    const d1 = p3d1[stepIdx] ?? 0;
    const c1 = p3c1[stepIdx] ?? 0;
    
    if (d1 === 1 && c1 === 1) {
      deadTimeViolations++;
    }
  }
  
  console.log("Verification results:");
  console.log("- Dead time overlapping violations (PWM3.OutDirect1 & OutCompl1):", deadTimeViolations);
  
  if (deadTimeViolations === 0) {
    console.log("SUCCESS: Dead time validator passed perfectly (no overlapping active pulses)!");
  } else {
    console.log("FAIL: Dead time overlap detected!");
  }
  
  console.log("\nSample timeline signals (PWM3 - 3-Carrier Phase-Shifted):");
  for (let stepIdx = 100; stepIdx < 120; stepIdx++) {
    const t = result.time[stepIdx];
    console.log(`t = ${t.toFixed(6)} s | Mod = ${(refSigs[stepIdx] ?? 0).toFixed(4)} | Cr1_Direct = ${p3d1[stepIdx]} | Cr1_Compl = ${p3c1[stepIdx]} | Cr2_Direct = ${p3d2[stepIdx]} | Cr3_Direct = ${p3d3[stepIdx]}`);
  }

  console.log("\nSample timeline signals (PWM5 - 5-Carrier Level-Shifted):");
  for (let stepIdx = 200; stepIdx < 210; stepIdx++) {
    const t = result.time[stepIdx];
    console.log(`t = ${t.toFixed(6)} s | Mod = ${(refSigs[stepIdx] ?? 0).toFixed(4)} | Cr1_Direct = ${p5d1[stepIdx]} | Cr3_Direct = ${p5d3[stepIdx]} | Cr5_Direct = ${p5d5[stepIdx]}`);
  }
  
} catch (e) {
  console.error("Test bench error:", e);
  process.exit(1);
}
