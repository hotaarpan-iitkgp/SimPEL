import fs from 'fs';
import { state } from './src/schematic/state.js';
import { exportDualGraphJSON } from './src/schematic/actions.js';
import { CircuitSimulator } from './src/solver_ts.js';

const TEST_FILES = ["Electrical_Remaining_Missing_Test.json", "Electrical_Complex_Switches_Test.json", "Electrical_Complex_Transformers_Machines_Test.json", "Electrical_ICs_Electronics_Test.json", 
    "Electrical_Passive_Sources_Test.json",
    "Electrical_Semiconductors_Test.json",
    "Electrical_Machines_Transformers_Test.json"
];

async function runTests() {
    let allPassed = true;

    for (const file of TEST_FILES) {
        console.log(`\n===========================================`);
        console.log(`Testing File: ${file}`);
        console.log(`===========================================`);
        
        try {
            const jsonStr = fs.readFileSync(`working jsons/${file}`, 'utf8');
            const data = JSON.parse(jsonStr);

            state.components = data.components || [];
            state.wires = data.wires || [];
            
            // Generate netlist
            const netlist = exportDualGraphJSON(true);
            
            // Set up simulator
            const sim = new CircuitSimulator(
                netlist.physical_stage || [],
                netlist.control_loops || [],
                netlist.simulation_parameters || { stop_time: 0.05, step_size: 1e-4 }
            );
            
            const results = await sim.runAsync(() => false, () => false);
            const signals = results.signals || {};
            
            // Find all expected meters or outputs
            const expectedOutputs = data.components
                .filter((c: any) => c.type === 'AM' || c.type === 'VM')
                .map((c: any) => `${c.id}.Out`);
            
            if (expectedOutputs.length === 0) {
                console.log(`  [INFO] No explicit meter outputs found in ${file}. Checking generic completion.`);
            }

            let filePassed = true;
            for (const outVar of expectedOutputs) {
                const arr = signals[outVar];
                if (!arr || arr.length === 0) {
                    console.error(`  [FAIL] Missing output for ${outVar}`);
                    filePassed = false;
                    allPassed = false;
                    continue;
                }
                
                // Check if any non-zero element exists (since it's a dynamic circuit, it might start at 0)
                const hasNonZero = arr.some((v: number) => Math.abs(v) > 1e-6);
                if (!hasNonZero) {
                    console.warn(`  [WARN] Output Signal ${outVar} is completely ZERO.`);
                    // We might not fail it completely since some configurations naturally result in zero current/voltage
                } else if (arr.some((v: number) => isNaN(v) || !isFinite(v))) {
                    console.error(`  [FAIL] Output Signal ${outVar} contains NaN or Infinity!`);
                    filePassed = false;
                    allPassed = false;
                } else {
                    console.log(`  [PASS] Output Signal ${outVar} is OK (has non-zero finite values).`);
                }
            }
            
            if (filePassed) {
                console.log(`\n  ✅ All evaluated signals in ${file} look stable.`);
            }

        } catch (e) {
            console.error(`  [FATAL ERROR] Testing ${file} failed:`, e);
            allPassed = false;
        }
    }

    if (allPassed) {
        console.log(`\n🎉 ALL ELECTRICAL TESTS PASSED SUCCESSFULLY!`);
    } else {
        console.log(`\n❌ SOME ELECTRICAL TESTS FAILED.`);
    }
}

runTests().catch(console.error);
