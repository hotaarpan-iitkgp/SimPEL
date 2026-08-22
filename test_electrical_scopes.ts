import fs from 'fs';
import { state } from './src/schematic/state.js';
import { exportDualGraphJSON } from './src/schematic/actions.js';
import { CircuitSimulator } from './src/solver_ts.js';

const testFiles = [
    'Electrical_Passive_Sources_Test.json',
    'Electrical_Meters_Test.json',
    'Electrical_Power_Semiconductors_Test.json',
    'Electrical_Transformers_Test.json',
    'Electrical_Electronics_Test.json',
    'Electrical_Integrated_Circuits_Test.json',
    'Electrical_Custom_Machines_Test.json',
    'Electrical_Machines_Test.json'
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
            console.error(`Failed to compile ${filename}:`, e.stack);
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
            // We want to check native current signals (e.g. I_R1 or R1.I or Out signals for ICs)
            // But skip SRC_ and GND_ which are our test harnesses
            if (sigName.includes("SRC_") || sigName.includes("GND_") || sigName.includes("LOAD_") || sigName.includes("AM_")) {
                continue;
            }
            
            // Only check current (.I or I_) or specific outputs (.V, .Out)
            if (sigName.endsWith(".I") || sigName.endsWith(".V") || sigName.endsWith(".Out") || sigName.endsWith("_sig")) {
                checkedCount++;
                
                const isAllZero = (dataArr as number[]).every((v: number) => Math.abs(v) < 1e-12);
                const isAllNaN = (dataArr as number[]).some((v: number) => isNaN(v));
                
                if (isAllNaN) {
                    console.error(`  [FAIL] Signal ${sigName} produced NaN output.`);
                    filePassed = false;
                } else if (isAllZero) {
                    console.error(`  [FAIL] Signal ${sigName} produced ALL ZERO output. Block might be an open circuit or broken.`);
                    filePassed = false;
                } else {
                    console.log(`  [PASS] Signal ${sigName} is OK.`);
                }
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
