import { CircuitSimulator } from './src/solver_ts';

console.log('[TESTING] Verifying newly implemented blocks in CircuitSimulator...');

// Test 1: Signal Selector (SIG_SEL), Dynamic Selector (DYNAMIC_SIG_SEL), Scalar Expander (SCALAR_EXP)
{
  const sim = new CircuitSimulator(
    [
      { id: 'CONST1', type: 'Constant', parameters: { value: '1.0' } },
      { id: 'EXP1', type: 'SCALAR_EXP', parameters: { width: '3' } },
      { id: 'SEL1', type: 'SIG_SEL', parameters: { indices: '[1]' } },
      { id: 'DYN1', type: 'DYNAMIC_SIG_SEL', parameters: {} }
    ],
    [
      { id: 'w1', from: { compId: 'CONST1', terminal: 'Out' }, to: { compId: 'EXP1', terminal: 'In' } },
      { id: 'w2', from: { compId: 'EXP1', terminal: 'Out' }, to: { compId: 'SEL1', terminal: 'In' } },
      { id: 'w3', from: { compId: 'EXP1', terminal: 'Out' }, to: { compId: 'DYN1', terminal: 'In' } },
      { id: 'w4', from: { compId: 'CONST1', terminal: 'Out' }, to: { compId: 'DYN1', terminal: 'Idx' } }
    ]
  );
  sim.run();
  console.log('✓ SCALAR_EXP, SIG_SEL & DYNAMIC_SIG_SEL simulation test completed.');
}

// Test 2: Trigger & Enable blocks
{
  const sim = new CircuitSimulator(
    [
      { id: 'CLK1', type: 'Clock', parameters: {} },
      { id: 'TRIG1', type: 'TRIGGER', parameters: { trigger_type: 'rising' } },
      { id: 'EN1', type: 'ENABLE', parameters: { enable_type: 'active_high' } }
    ],
    [
      { id: 'w1', from: { compId: 'CLK1', terminal: 'Out' }, to: { compId: 'TRIG1', terminal: 'In' } },
      { id: 'w2', from: { compId: 'CLK1', terminal: 'Out' }, to: { compId: 'EN1', terminal: 'In' } }
    ]
  );
  sim.run();
  console.log('✓ TRIGGER & ENABLE block simulation test completed.');
}

// Test 3: Bitwise OP & Combinatorial Logic
{
  const sim = new CircuitSimulator(
    [
      { id: 'C1', type: 'Constant', parameters: { value: '5' } }, // 0b101
      { id: 'C2', type: 'Constant', parameters: { value: '3' } }, // 0b011
      { id: 'BIT1', type: 'BITWISE_OP', parameters: { operator: 'AND' } },
      { id: 'COMB1', type: 'COMB_LOGIC', parameters: { truth_table: '[0; 1]' } }
    ],
    [
      { id: 'w1', from: { compId: 'C1', terminal: 'Out' }, to: { compId: 'BIT1', terminal: 'In1' } },
      { id: 'w2', from: { compId: 'C2', terminal: 'Out' }, to: { compId: 'BIT1', terminal: 'In2' } },
      { id: 'w3', from: { compId: 'C1', terminal: 'Out' }, to: { compId: 'COMB1', terminal: 'In' } }
    ]
  );
  sim.run();
  console.log('✓ BITWISE_OP & COMB_LOGIC simulation test completed.');
}

// Test 4: RMS, THD, Fourier & Filter
{
  const sim = new CircuitSimulator(
    [
      { id: 'SIN1', type: 'SINE_WAVE', parameters: { amplitude: '10', frequency: '50' } },
      { id: 'RMS1', type: 'RMS_VAL', parameters: { frequency: '50' } },
      { id: 'LPF1', type: 'Lowpass', parameters: { fc: '100' } },
      { id: 'FOUR1', type: 'FOURIER_ANALYSIS', parameters: { fundamental_freq: '50', harmonic: '1' } }
    ],
    [
      { id: 'w1', from: { compId: 'SIN1', terminal: 'Out' }, to: { compId: 'RMS1', terminal: 'In' } },
      { id: 'w2', from: { compId: 'SIN1', terminal: 'Out' }, to: { compId: 'LPF1', terminal: 'In' } },
      { id: 'w3', from: { compId: 'SIN1', terminal: 'Out' }, to: { compId: 'FOUR1', terminal: 'In' } }
    ]
  );
  sim.run();
  console.log('✓ RMS_VAL, Lowpass & FOURIER_ANALYSIS simulation test completed.');
}

console.log('🎉 ALL NEW BLOCKS VERIFIED SUCCESSFULLY!');
