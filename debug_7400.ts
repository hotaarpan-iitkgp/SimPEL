import fs from 'fs';
import { state } from './src/schematic/state.js';
import { exportDualGraphJSON } from './src/schematic/actions.js';
import { CircuitSimulator } from './src/solver_ts.js';

const jsonStr = fs.readFileSync('working jsons/Electrical_Integrated_Circuits_Test.json', 'utf8');
const data = JSON.parse(jsonStr);
state.components = data.components;
state.wires = data.wires;
const netlist = exportDualGraphJSON(true);
const sim = new CircuitSimulator(netlist.physical_stage || [], netlist.control_loops || [], { stop_time: 0.1, step_size: 1e-4 });
sim.runAsync(() => false, () => false).then(results => {
    console.log("VCC:", results.signals["IC_74001_VCC_sens.Out"]?.slice(0, 5));
    console.log("in1A:", results.signals["IC_74001_in1A.Out"]?.slice(0, 5));
    console.log("in1B:", results.signals["IC_74001_in1B.Out"]?.slice(0, 5));
    console.log("gate1:", results.signals["IC_74001_gate1.Out"]?.slice(0, 5));
    console.log("gain1:", results.signals["IC_74001_gain1.Out"]?.slice(0, 5));
    console.log("dig_in1A:", results.signals["IC_74001_dig_in1A.Out"]?.slice(0, 5));
    console.log("dig_in1B:", results.signals["IC_74001_dig_in1B.Out"]?.slice(0, 5));
});
