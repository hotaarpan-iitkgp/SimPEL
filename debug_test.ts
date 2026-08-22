import fs from 'fs';
import { state } from './src/schematic/state.js';
import { exportDualGraphJSON } from './src/schematic/actions.js';
import { CircuitSimulator } from './src/solver_ts.js';

const jsonStr = fs.readFileSync('working jsons/Electrical_Passive_Sources_Test.json', 'utf8');
const data = JSON.parse(jsonStr);
state.components = data.components;
state.wires = data.wires;
const netlist = exportDualGraphJSON(true);
const sim = new CircuitSimulator(netlist.physical_stage || [], netlist.control_loops || [], { stop_time: 0.1, step_size: 1e-4 });
sim.runAsync(() => false, () => false).then(results => {
    console.log("R1 output: ", results.signals["AM_R1.Out"]);
});
