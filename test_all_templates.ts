// Mock minimal DOM for Node.js environment
(global as any).window = global;
(global as any).document = {
  createElement: () => ({
    getContext: () => ({}),
    style: {}
  }),
  getElementById: () => null,
  body: { appendChild: () => {}, removeChild: () => {} }
};

import { CIRCUITS_TEMPLATES } from "./src/templates";
import { triggerImport, exportDualGraphJSON } from "./src/schematic/actions";
import { CircuitSimulator } from "./src/solver_ts";

console.log("=== Testing ALL Circuit Templates ===");

const keys = Object.keys(CIRCUITS_TEMPLATES).filter(k => k !== "empty");
console.log(`Found ${keys.length} templates to test.\n`);

let passedCount = 0;
let failedCount = 0;
const errors: { key: string; name: string; error: string }[] = [];

for (const key of keys) {
  const template = CIRCUITS_TEMPLATES[key];
  console.log(`[TESTING] Template: "${template.name}" (key: ${key})`);
  
  try {
    const layoutObj = {
      components: template.components || [],
      wires: template.wires || [],
      plotConfiguration: template.plotConfiguration || { plots: [] },
      simulationSettings: template.simulationSettings || {
        stopTime: "0.01",
        stepSize: "10u",
        solver: "euler",
        stepType: "fixed"
      }
    };

    triggerImport(JSON.stringify(layoutObj));
    const netlist = exportDualGraphJSON(true);

    if (!netlist || (!netlist.physical_stage && !netlist.control_loops)) {
      throw new Error("Netlist generation produced empty physical_stage and control_loops");
    }

    const simParams = netlist.simulation_parameters || {
      t_end: 0.005,
      h: 1e-5,
      solver: "euler",
      step_type: "fixed"
    };
    // Run for a reasonable duration
    simParams.t_end = 0.001;
    simParams.h = Math.min(simParams.h || 1e-5, 1e-5);

    const sim = new CircuitSimulator(
      netlist.physical_stage || [],
      netlist.control_loops || [],
      simParams
    );

    const solution = sim.run();

    if (!solution || !solution.time || solution.time.length === 0) {
      throw new Error("Simulation returned empty solution or 0 time steps.");
    }

    // Check for NaN or Infinities in time and voltage logs
    let hasNaN = false;
    let nanReason = "";
    for (let i = 0; i < solution.time.length; i++) {
      if (isNaN(solution.time[i])) {
        hasNaN = true;
        nanReason = "NaN in time array";
        break;
      }
    }
    if (!hasNaN) {
      for (const [node, vArr] of Object.entries(solution.voltages)) {
        for (const v of vArr as number[]) {
          if (isNaN(v) || !isFinite(v)) {
            hasNaN = true;
            nanReason = `NaN or Infinite voltage on node ${node}`;
            break;
          }
        }
        if (hasNaN) break;
      }
    }

    if (hasNaN) {
      throw new Error(`Simulation failed numerical stability: ${nanReason}`);
    }

    console.log(`  └─ ✅ PASSED: ${solution.time.length} steps simulated cleanly.`);
    passedCount++;
  } catch (err: any) {
    console.error(`  └─ ❌ FAILED: ${err.message}`);
    failedCount++;
    errors.push({ key, name: template.name, error: err.message });
  }
}

console.log("\n==========================================");
console.log(`SUMMARY: Passed: ${passedCount} / ${keys.length}, Failed: ${failedCount} / ${keys.length}`);

if (failedCount > 0) {
  console.log("\nFailed Templates Details:");
  errors.forEach(e => console.log(` - [${e.key}] "${e.name}": ${e.error}`));
  process.exit(1);
} else {
  console.log("\n🎉 ALL TEMPLATES PASSED PERFECTLY!");
  process.exit(0);
}
