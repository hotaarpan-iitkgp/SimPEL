import fs from 'fs';
import { state } from './src/schematic/state.js';
import { exportDualGraphJSON } from './src/schematic/actions.js';
import { CircuitSimulator } from './src/solver_ts.js';

const testFiles = [
    'Control_State_Machines_Test.json',
    'Control_Math_Functions_Test.json',
    'Control_Filters_Delays_Test.json',
    'Control_Transforms_Test.json',
    'Control_Logic_Test.json'
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
            netlist.simulation_parameters || { stop_time: 0.1, step_size: 1e-4 }
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
        
        let checkedCount = 0;
        
        for (const [sigName, dataArr] of Object.entries(signals)) {
            // ONLY check block outputs (ignore inputs like .In, .A, .B, .D, .Clk)
            if (sigName.startsWith("SRC_")) continue; // ignore sources
            if (sigName.startsWith("SCOPE_")) continue;
            
            // Typical output pin suffixes
            if (!sigName.includes(".Out") && 
                !sigName.includes(".Q") && 
                !sigName.includes(".Q_bar") &&
                !sigName.includes(".Alpha") &&
                !sigName.includes(".Beta") &&
                !sigName.includes(".d") &&
                !sigName.includes(".q") &&
                !sigName.includes(".Theta") &&
                !sigName.includes(".Freq") &&
                !sigName.includes(".Cos") &&
                !sigName.includes(".Sin") &&
                !sigName.includes(".Mag") &&
                !sigName.includes(".Phase")) {
                continue;
            }
            
            // Ignore duplicated outputs mapped from original pins by old logic
            if (sigName.includes("OutAlpha") || sigName.includes("OutBeta") || sigName.includes("OutD") || sigName.includes("OutQ") || sigName.includes("OutA") || sigName.includes("OutB") || sigName.includes("OutC")) {
                continue;
            }
            if (sigName.includes("OutQ")) continue;
            
            checkedCount++;
            
            const isAllZero = (dataArr as number[]).every((v: number) => Math.abs(v) < 1e-9);
            const isAllNaN = (dataArr as number[]).some((v: number) => isNaN(v));
            
            if (isAllNaN) {
                console.error(`  [FAIL] Signal ${sigName} produced NaN output.`);
                filePassed = false;
            } else if (isAllZero) {
                console.error(`  [FAIL] Signal ${sigName} produced ALL ZERO output.`);
                filePassed = false;
            } else {
                console.log(`  [PASS] Signal ${sigName} is OK.`);
            }
        }
        
        if (checkedCount === 0) {
            console.error(`  [FAIL] No valid output signals found in ${filename}.`);
            filePassed = false;
        }
        
        if (!filePassed) {
            allPassed = false;
        } else {
            console.log(`  All outputs in ${filename} were valid!`);
        }
    }
    
    if (allPassed) {
        console.log("\nALL TESTS PASSED!");
    } else {
        console.log("\nSOME TESTS FAILED.");
    }
}

runTests();
