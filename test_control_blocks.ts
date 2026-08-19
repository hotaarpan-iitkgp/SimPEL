import { CircuitSimulator } from './src/solver_ts.ts';

console.log('[TESTING] Verifying Control blocks in CircuitSimulator outputs...');

function dumpOutputs(sim: any) {
    if (!sim.control_outputs) {
        console.log('sim.control_outputs is undefined');
        return;
    }
    for (const key of Object.keys(sim.control_outputs)) {
        console.log(`  ${key}: ${sim.control_outputs[key]}`);
    }
}

// Test Integrator and Derivative
try {
    const components = [
        { id: 'CONST1', type: 'Constant', parameters: { value: '2.0' } },
        { id: 'INT1', type: 'INTEGRATOR', parameters: { initial_state: '0.0', upper_limit: '10.0', lower_limit: '-10.0' } },
        { id: 'DERIV1', type: 'DERIVATIVE', parameters: {} }
    ];
    const wires = [
        { id: 'w1', from: { compId: 'CONST1', terminal: 'Out' }, to: { compId: 'INT1', terminal: 'In' } },
        { id: 'w2', from: { compId: 'INT1', terminal: 'Out' }, to: { compId: 'DERIV1', terminal: 'In' } }
    ];
    const sim = new CircuitSimulator([], { components, wires }, { t_stop: 0.001, dt: 1e-5 });
    sim.run();
    console.log('--- INTEGRATOR & DERIVATIVE outputs:');
    dumpOutputs(sim);
} catch (e) {
    console.error('✗ INTEGRATOR & DERIVATIVE test failed:', e);
}

// Test Transfer Function and State Space
try {
    const components = [
        { id: 'STEP1', type: 'Constant', parameters: { value: '1.0' } },
        { id: 'TF1', type: 'TRANSFER_FCN', parameters: { numerator: '[1]', denominator: '[1, 1]' } },
        { id: 'SS1', type: 'STATE_SPACE', parameters: { A: '[[-1, 0]; [0, -2]]', B: '[[1]; [1]]', C: '[[1, 1]]', D: '[[0]]', x0: '[0, 0]' } }
    ];
    const wires = [
        { id: 'w1', from: { compId: 'STEP1', terminal: 'Out' }, to: { compId: 'TF1', terminal: 'In' } },
        { id: 'w2', from: { compId: 'STEP1', terminal: 'Out' }, to: { compId: 'SS1', terminal: 'In' } }
    ];
    const sim = new CircuitSimulator([], { components, wires }, { t_stop: 0.001, dt: 1e-5 });
    sim.run();
    console.log('--- TRANSFER_FCN & STATE_SPACE outputs:');
    dumpOutputs(sim);
} catch (e) {
    console.error('✗ TRANSFER_FCN & STATE_SPACE test failed:', e);
}

// Test PID and CONT_PID
try {
    const components = [
        { id: 'CONST1', type: 'Constant', parameters: { value: '1.0' } },
        { id: 'PID1', type: 'PID', parameters: { Kp: '1', Ki: '0.1', Kd: '0', limit_output: 'false' } },
        { id: 'CONT_PID1', type: 'CONT_PID', parameters: { Kp: '1', Ki: '0.1', Kd: '0.01', limit_output: 'false' } }
    ];
    const wires = [
        { id: 'w1', from: { compId: 'CONST1', terminal: 'Out' }, to: { compId: 'PID1', terminal: 'In' } },
        { id: 'w2', from: { compId: 'CONST1', terminal: 'Out' }, to: { compId: 'CONT_PID1', terminal: 'In' } }
    ];
    const sim = new CircuitSimulator([], { components, wires }, { t_stop: 0.001, dt: 1e-5 });
    sim.run();
    console.log('--- PID & CONT_PID outputs:');
    dumpOutputs(sim);
} catch (e) {
    console.error('✗ PID & CONT_PID test failed:', e);
}

// Test PLL_1PH and PLL_3PH
try {
    const components = [
        { id: 'CONST1', type: 'Constant', parameters: { value: '0.0' } },
        { id: 'PLL1', type: 'PLL_1PH', parameters: { fn: '50', Kp: '1', Ki: '10' } },
        { id: 'PLL3', type: 'PLL_3PH', parameters: { fn: '50', Kp: '1', Ki: '10' } }
    ];
    const wires = [
        { id: 'w1', from: { compId: 'CONST1', terminal: 'Out' }, to: { compId: 'PLL1', terminal: 'In' } },
        { id: 'w2', from: { compId: 'CONST1', terminal: 'Out' }, to: { compId: 'PLL3', terminal: 'In_a' } },
        { id: 'w3', from: { compId: 'CONST1', terminal: 'Out' }, to: { compId: 'PLL3', terminal: 'In_b' } },
        { id: 'w4', from: { compId: 'CONST1', terminal: 'Out' }, to: { compId: 'PLL3', terminal: 'In_c' } }
    ];
    const sim = new CircuitSimulator([], { components, wires }, { t_stop: 0.001, dt: 1e-5 });
    sim.run();
    console.log('--- PLL_1PH & PLL_3PH outputs:');
    dumpOutputs(sim);
} catch (e) {
    console.error('✗ PLL_1PH & PLL_3PH test failed:', e);
}
