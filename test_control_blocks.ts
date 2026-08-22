import fs from 'fs';
import { state } from './src/schematic/state.js';
import { exportDualGraphJSON } from './src/schematic/actions.js';
import { CircuitSimulator } from './src/solver_ts.js';

const testFiles = [
    'Control_State_Machines_Test.json',
    'Control_Math_Functions_Test.json',
    'Control_Filters_Delays_Test.json',
    'Control_Transforms_Test.json',
    'Control_Logic_Test.json',
    'Math_Blocks_Test.json',
    'Modulators_Test.json',
    'Transforms_Test.json'
];

async function runTests() {
    let allPassed = true;
    for (const filename of testFiles) {
        console.log(`\n--- Testing ${filename} ---`);
        const jsonStr = fs.readFileSync(`working jsons/${filename}`, 'utf8');
        const data = JSON.parse(jsonStr);

        state.components = data.components;
        state.wires = data.wires;

        let netlist;
        try {
            netlist = exportDualGraphJSON(true);
        } catch (e: any) {
            console.error(`Failed to compile ${filename}:`, e.message);
            allPassed = false;
            continue;
        }

        const sim = new CircuitSimulator(
            netlist.physical_stage || [],
            netlist.control_loops || [],
            netlist.simulation_parameters || { stop_time: 0.05, step_size: 1e-4 }
        );

        let results;
        try {
            results = await sim.runAsync(() => false, () => false);
        } catch (e: any) {
            console.error(`Simulation crashed for ${filename}:`, e.message);
            allPassed = false;
            continue;
        }

        let filePassed = true;
        const signals = results.signals || {};
        
        if (Object.keys(signals).length === 0) {
            console.error("  [FAIL] No signals recorded!");
            filePassed = false;
            allPassed = false;
            continue;
        }

        for (const [sigName, dataArr] of Object.entries(signals)) {
            // ONLY check variables ending in .Out, .OutA, .OutB, etc. to avoid disconnected inputs
            if (!sigName.includes(".Out") && !sigName.includes(".Q") && !sigName.includes(".Alpha") && !sigName.includes(".Beta") && !sigName.includes(".d") && !sigName.includes(".q") && !sigName.includes(".A") && !sigName.includes(".B") && !sigName.includes(".C")) {
                continue;
            }
            
            // Skip derivative because derivative of a constant is 0
            if (sigName.startsWith("DERIV")) {
                continue;
            }
            
            // Check if entirely zero
            const isAllZero = (dataArr as number[]).every((v: number) => Math.abs(v) < 1e-9);
            
            if (isAllZero) {
                console.error(`  [FAIL] Output Signal ${sigName} produced ALL ZERO output.`);
                filePassed = false;
            } else {
                console.log(`  [PASS] Output Signal ${sigName} is OK.`);
            }
        }
        
        if (filePassed) {
            console.log(`  All outputs in ${filename} produced non-zero output!`);
        } else {
            allPassed = false;
        }
    }
    
    if (allPassed) {
        console.log("\nALL TESTS PASSED!");
    } else {
        console.log("\nSOME TESTS FAILED.");
    }
}

runTests();
