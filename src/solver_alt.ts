import { CircuitSimulator, parseScientific, ComponentTS } from './solver_ts';

export class SimpleMatrix {
    rows: number;
    cols: number;
    data: Float64Array;

    constructor(rows: number, cols: number, initVal = 0.0) {
        this.rows = rows;
        this.cols = cols;
        this.data = new Float64Array(rows * cols);
        if (initVal !== 0.0) {
            this.data.fill(initVal);
        }
    }

    get(r: number, c: number): number {
        return this.data[r * this.cols + c];
    }

    set(r: number, c: number, v: number) {
        this.data[r * this.cols + c] = v;
    }

    add(r: number, c: number, v: number) {
        this.data[r * this.cols + c] += v;
    }

    // Solve A * x = b using Gaussian elimination with partial pivoting
    solve(b: number[]): number[] {
        const n = this.rows;
        const A_data = new Float64Array(this.data);
        const x = [...b];
        const cols = this.cols;

        for (let i = 0; i < n; i++) {
            let max_row = i;
            let max_val = Math.abs(A_data[i * cols + i]);
            for (let k = i + 1; k < n; k++) {
                const val = Math.abs(A_data[k * cols + i]);
                if (val > max_val) {
                    max_val = val;
                    max_row = k;
                }
            }

            if (max_row !== i) {
                for (let j = i; j < n; j++) {
                    const temp = A_data[i * cols + j];
                    A_data[i * cols + j] = A_data[max_row * cols + j];
                    A_data[max_row * cols + j] = temp;
                }
                const temp = x[i];
                x[i] = x[max_row];
                x[max_row] = temp;
            }

            const diag = A_data[i * cols + i];
            if (Math.abs(diag) < 1e-15) {
                throw new Error("Singular matrix in PWL solver");
            }

            for (let k = i + 1; k < n; k++) {
                const factor = A_data[k * cols + i] / diag;
                A_data[k * cols + i] = 0.0;
                for (let j = i + 1; j < n; j++) {
                    A_data[k * cols + j] -= factor * A_data[i * cols + j];
                }
                x[k] -= factor * x[i];
            }
        }

        const res = new Array(n).fill(0.0);
        for (let i = n - 1; i >= 0; i--) {
            let s = 0.0;
            for (let j = i + 1; j < n; j++) {
                s += A_data[i * cols + j] * res[j];
            }
            res[i] = (x[i] - s) / A_data[i * cols + i];
        }
        return res;
    }
}

// Disjoint Set Union (DSU) for Union-Find node collapsing
export class UnionFind {
    parent: Record<string, string> = {};

    constructor(nodes: string[]) {
        for (const n of nodes) {
            this.parent[n] = n;
        }
    }

    find(n: string): string {
        if (!this.parent[n]) {
            this.parent[n] = n;
            return n;
        }
        let curr = n;
        while (curr !== this.parent[curr]) {
            this.parent[curr] = this.parent[this.parent[curr]];
            curr = this.parent[curr];
        }
        return curr;
    }

    union(n1: string, n2: string) {
        const r1 = this.find(n1);
        const r2 = this.find(n2);
        if (r1 !== r2) {
            if (r2 === "node_0") {
                this.parent[r1] = r2;
            } else {
                this.parent[r2] = r1;
            }
        }
    }
}

interface PWLMode {
    A: number[][];
    B: number[][];
    K_x: number[][];
    K_u: number[][];
    reducedNodeToIdx: Record<string, number>;
    numReducedNodes: number;
    uf: UnionFind;
    refRep: string;
}

export class AlternativeCircuitSimulator extends CircuitSimulator {
    // Mode memoization cache
    modeCache = new Map<string, PWLMode>();

    last_swCurrents: Record<string, number> = {};
    last_capCurrents: Record<string, number> = {};

    // PWL classified components
    L_comps: ComponentTS[] = [];
    C_comps: ComponentTS[] = [];
    V_comps: ComponentTS[] = [];
    I_comps: ComponentTS[] = [];
    sw_comps: ComponentTS[] = [];

    constructor(physical: any, control: any, params: any) {
        super(physical, control, params);
        this.idealizeComponents();
        this.classifyComps();
    }

    // Intercept parsing of netlist and clear all non-ideal parameters
    idealizeComponents() {
        for (const c of this.physical_stage) {
            if (c.type === "Inductor" || c.type === "L") {
                c.parameters.esr = "0.0";
            } else if (c.type === "Capacitor" || c.type === "C") {
                c.parameters.esr = "0.0";
            } else if (["Switch", "Diode", "MOSFET", "vg-FET", "S", "D", "IGBT", "IGBT_DIODE", "IGCT", "GTO", "THYRISTOR", "JFET", "BJT"].includes(c.type)) {
                c.parameters.Ron = "0.0";
                c.parameters.Roff = "Infinity";
                c.parameters.Vd = "0.0";
            }
        }
    }

    classifyComps() {
        this.L_comps = [];
        this.C_comps = [];
        this.V_comps = [];
        this.I_comps = [];
        this.sw_comps = [];

        for (const c of this.physical_stage) {
            const type = c.type;
            if (type === "Inductor" || type === "L") {
                this.L_comps.push(c);
            } else if (type === "Capacitor" || type === "C") {
                this.C_comps.push(c);
            } else if (["VoltageSource", "ACVoltageSource", "ControlledVoltageSource", "OPAMP", "E_COMP", "Ammeter", "V", "AC_V", "AM"].includes(type)) {
                this.V_comps.push(c);
            } else if (["CurrentSource", "ControlledCurrentSource", "ACCurrentSource", "I", "AC_I"].includes(type)) {
                this.I_comps.push(c);
            } else if (["Switch", "Diode", "MOSFET", "vg-FET", "S", "D", "IGBT", "IGBT_DIODE", "IGCT", "GTO", "THYRISTOR", "JFET", "BJT"].includes(type)) {
                this.sw_comps.push(c);
            }
        }

        // Sort switches to ensure consistent hashing
        this.sw_comps.sort((a, b) => a.id.localeCompare(b.id));
    }

    getAllNodes(): string[] {
        const nodesSet = new Set<string>();
        nodesSet.add("node_0");
        for (const c of this.physical_stage) {
            for (const n of (c.nodes || [])) {
                if (n) nodesSet.add(n);
            }
        }
        return Array.from(nodesSet);
    }

    // Operating mode cache hash string key
    getModeHash(swStates: Record<string, string>): string {
        return this.sw_comps.map(sw => swStates[sw.id] === "ON" ? "1" : "0").join("_");
    }

    getModeMatrices(swStates: Record<string, string>): PWLMode {
        const hash = this.getModeHash(swStates);
        if (this.modeCache.has(hash)) {
            return this.modeCache.get(hash)!;
        }

        const matrices = this.calculateModeMatrices(swStates);
        this.modeCache.set(hash, matrices);
        return matrices;
    }

    // Formulation of reduced MNA system
    calculateModeMatrices(swStates: Record<string, string>): PWLMode {
        const allNodes = this.getAllNodes();
        const uf = new UnionFind(allNodes);

        // Collapse nodes of ON switches
        for (const sw of this.sw_comps) {
            if (swStates[sw.id] === "ON") {
                const n1 = sw.nodes[0] ?? "node_0";
                const n2 = sw.nodes[1] ?? "node_0";
                uf.union(n1, n2);
            }
        }

        const reps = new Set<string>();
        for (const n of allNodes) {
            reps.add(uf.find(n));
        }
        const refRep = uf.find("node_0");

        const reducedNodeToIdx: Record<string, number> = {};
        let idxCounter = 0;
        for (const r of reps) {
            if (r !== refRep) {
                reducedNodeToIdx[r] = idxCounter++;
            }
        }
        const numReducedNodes = idxCounter;

        const N_r = numReducedNodes;
        const M_v = this.V_comps.length;
        const N_c = this.C_comps.length;
        const N_xfmr = this.all_windings.length;
        const N_vars = N_r + M_v + N_c + N_xfmr;
        const N_state = this.L_comps.length + this.C_comps.length;
        const N_inputs = M_v + this.I_comps.length;

        const M_mna = new SimpleMatrix(N_vars, N_vars, 0.0);
        const P = Array.from({ length: N_vars }, () => new Array(N_state).fill(0.0));
        const Q = Array.from({ length: N_vars }, () => new Array(N_inputs).fill(0.0));

        const getRedIdx = (node: string): number => {
            const r = uf.find(node || "node_0");
            if (r === refRep) return -1;
            return reducedNodeToIdx[r] ?? -1;
        };

        // Stamp Resistors
        for (const r of this.resistors) {
            let r_val = parseScientific(r.parameters.value ?? "10");
            if (r_val < 1e-6) r_val = 1e-6;
            const g = 1.0 / r_val;
            const n1 = r.nodes[0] ?? "node_0";
            const n2 = r.nodes[1] ?? "node_0";
            const i1 = getRedIdx(n1);
            const i2 = getRedIdx(n2);
            if (i1 >= 0) M_mna.add(i1, i1, g);
            if (i2 >= 0) M_mna.add(i2, i2, g);
            if (i1 >= 0 && i2 >= 0) {
                M_mna.add(i1, i2, -g);
                M_mna.add(i2, i1, -g);
            }
        }

        // Stamp Inductors as state current sources with a small parallel conductance (1e-6) to resolve floating nodes/cutsets
        for (let p = 0; p < this.L_comps.length; p++) {
            const ind = this.L_comps[p];
            const n1 = ind.nodes[0] ?? "node_0";
            const n2 = ind.nodes[1] ?? "node_0";
            const i1 = getRedIdx(n1);
            const i2 = getRedIdx(n2);
            if (i1 >= 0) P[i1][p] -= 1.0;
            if (i2 >= 0) P[i2][p] += 1.0;

            const g_L = 1e-6; // 1 Mohm parallel resistor
            if (i1 >= 0) M_mna.add(i1, i1, g_L);
            if (i2 >= 0) M_mna.add(i2, i2, g_L);
            if (i1 >= 0 && i2 >= 0) {
                M_mna.add(i1, i2, -g_L);
                M_mna.add(i2, i1, -g_L);
            }
        }

        // Stamp Voltage Sources with a small series resistance (1e-5) to prevent loops/singular matrices
        for (let j = 0; j < this.V_comps.length; j++) {
            const vsrc = this.V_comps[j];
            const n1 = vsrc.nodes[0] ?? "node_0";
            const n2 = vsrc.nodes[1] ?? "node_0";
            const i1 = getRedIdx(n1);
            const i2 = getRedIdx(n2);
            if (i1 >= 0) M_mna.set(i1, N_r + j, 1.0);
            if (i2 >= 0) M_mna.set(i2, N_r + j, -1.0);

            if (i1 >= 0) M_mna.set(N_r + j, i1, 1.0);
            if (i2 >= 0) M_mna.set(N_r + j, i2, -1.0);
            M_mna.set(N_r + j, N_r + j, -1e-5); // series resistance 1e-5 ohm
            Q[N_r + j][j] = 1.0;
        }

        // Stamp Capacitors as state voltage sources with a small series resistance (1e-5) to prevent loops/singular matrices
        for (let q = 0; q < this.C_comps.length; q++) {
            const cap = this.C_comps[q];
            const n1 = cap.nodes[0] ?? "node_0";
            const n2 = cap.nodes[1] ?? "node_0";
            const i1 = getRedIdx(n1);
            const i2 = getRedIdx(n2);
            if (i1 >= 0) M_mna.set(i1, N_r + M_v + q, 1.0);
            if (i2 >= 0) M_mna.set(i2, N_r + M_v + q, -1.0);

            if (i1 >= 0) M_mna.set(N_r + M_v + q, i1, 1.0);
            if (i2 >= 0) M_mna.set(N_r + M_v + q, i2, -1.0);
            M_mna.set(N_r + M_v + q, N_r + M_v + q, -1e-5); // series resistance 1e-5 ohm
            P[N_r + M_v + q][this.L_comps.length + q] = 1.0;
        }

        // Stamp Transformers
        for (const xfmr of this.transformers) {
            const txWindings = this.all_windings.filter(w => w.transformer_id === xfmr.id);
            if (txWindings.length === 0) continue;

            // 1. Stamp KCL contributions of all windings
            for (let i = 0; i < txWindings.length; i++) {
                const w = txWindings[i];
                const n1 = w.nodes[0] ?? "node_0";
                const n2 = w.nodes[1] ?? "node_0";
                const i1 = getRedIdx(n1);
                const i2 = getRedIdx(n2);
                
                const w_local_idx = this.all_windings.indexOf(w);
                const col_w = N_r + M_v + N_c + w_local_idx;

                if (i1 >= 0) M_mna.add(i1, col_w, 1.0);
                if (i2 >= 0) M_mna.add(i2, col_w, -1.0);
            }

            const w0 = txWindings[0];
            const w0_local_idx = this.all_windings.indexOf(w0);
            const row_w0 = N_r + M_v + N_c + w0_local_idx;

            // 2. Stamp Ampere's Law (MMF balance): Sum(N_k * I_wk) = 0 inside row row_w0
            for (const w of txWindings) {
                const w_local_idx = this.all_windings.indexOf(w);
                const col_w = N_r + M_v + N_c + w_local_idx;
                M_mna.add(row_w0, col_w, w.turns);
            }

            // 3. Stamp Faraday's Law (Voltage ratio): N_j * V0 - N0 * Vj = 0 inside row row_wj (for j > 0)
            const n0_1 = w0.nodes[0] ?? "node_0";
            const n0_2 = w0.nodes[1] ?? "node_0";
            const i0_1 = getRedIdx(n0_1);
            const i0_2 = getRedIdx(n0_2);

            for (let j = 1; j < txWindings.length; j++) {
                const wj = txWindings[j];
                const wj_local_idx = this.all_windings.indexOf(wj);
                const row_wj = N_r + M_v + N_c + wj_local_idx;

                const nj_1 = wj.nodes[0] ?? "node_0";
                const nj_2 = wj.nodes[1] ?? "node_0";
                const ij_1 = getRedIdx(nj_1);
                const ij_2 = getRedIdx(nj_2);

                if (i0_1 >= 0) M_mna.add(row_wj, i0_1, wj.turns);
                if (i0_2 >= 0) M_mna.add(row_wj, i0_2, -wj.turns);
                if (ij_1 >= 0) M_mna.add(row_wj, ij_1, -w0.turns);
                if (ij_2 >= 0) M_mna.add(row_wj, ij_2, w0.turns);
            }
        }

        // Stamp Current Sources
        for (let m = 0; m < this.I_comps.length; m++) {
            const isrc = this.I_comps[m];
            const n1 = isrc.nodes[0] ?? "node_0";
            const n2 = isrc.nodes[1] ?? "node_0";
            const i1 = getRedIdx(n1);
            const i2 = getRedIdx(n2);
            if (i1 >= 0) Q[i1][M_v + m] -= 1.0;
            if (i2 >= 0) Q[i2][M_v + m] += 1.0;
        }

        // Standard SPICE shunt conductance to ground for reduced nodes to prevent floating singularity
        for (let k = 0; k < N_r; k++) {
            M_mna.add(k, k, 1e-12);
        }

        // Solve for K_x = M_mna^-1 * P
        const K_x = Array.from({ length: N_vars }, () => new Array(N_state).fill(0.0));
        for (let c = 0; c < N_state; c++) {
            const col_P = [];
            for (let r = 0; r < N_vars; r++) col_P.push(P[r][c]);
            let sol = new Array(N_vars).fill(0.0);
            try {
                sol = M_mna.solve(col_P);
            } catch (_) {}
            for (let r = 0; r < N_vars; r++) {
                K_x[r][c] = sol[r];
            }
        }

        // Solve for K_u = M_mna^-1 * Q
        const K_u = Array.from({ length: N_vars }, () => new Array(N_inputs).fill(0.0));
        for (let c = 0; c < N_inputs; c++) {
            const col_Q = [];
            for (let r = 0; r < N_vars; r++) col_Q.push(Q[r][c]);
            let sol = new Array(N_vars).fill(0.0);
            try {
                sol = M_mna.solve(col_Q);
            } catch (_) {}
            for (let r = 0; r < N_vars; r++) {
                K_u[r][c] = sol[r];
            }
        }

        // Formulate state-space matrices A and B
        const A = Array.from({ length: N_state }, () => new Array(N_state).fill(0.0));
        const B = Array.from({ length: N_state }, () => new Array(N_inputs).fill(0.0));

        // Inductors equations
        for (let p = 0; p < this.L_comps.length; p++) {
            const ind = this.L_comps[p];
            const L = parseScientific(ind.parameters.L ?? "10m");
            const n1 = ind.nodes[0] ?? "node_0";
            const n2 = ind.nodes[1] ?? "node_0";
            const i1 = getRedIdx(n1);
            const i2 = getRedIdx(n2);

            for (let c = 0; c < N_state; c++) {
                const v1_coef = i1 >= 0 ? K_x[i1][c] : 0.0;
                const v2_coef = i2 >= 0 ? K_x[i2][c] : 0.0;
                A[p][c] = (v1_coef - v2_coef) / L;
            }
            for (let c = 0; c < N_inputs; c++) {
                const v1_coef = i1 >= 0 ? K_u[i1][c] : 0.0;
                const v2_coef = i2 >= 0 ? K_u[i2][c] : 0.0;
                B[p][c] = (v1_coef - v2_coef) / L;
            }
        }

        // Capacitors equations
        for (let q = 0; q < this.C_comps.length; q++) {
            const cap = this.C_comps[q];
            const C = parseScientific(cap.parameters.C ?? "100u");
            const rowIdx = N_r + M_v + q;

            for (let c = 0; c < N_state; c++) {
                A[this.L_comps.length + q][c] = K_x[rowIdx][c] / C;
            }
            for (let c = 0; c < N_inputs; c++) {
                B[this.L_comps.length + q][c] = K_u[rowIdx][c] / C;
            }
        }

        return {
            A, B, K_x, K_u, reducedNodeToIdx, numReducedNodes, uf, refRep
        };
    }

    // Solve for switch currents using leaf elimination inside merged short circuit clusters
    solveSwitchCurrents(
        swStates: Record<string, string>,
        nodeVoltages: Record<string, number>,
        capCurrents: Record<string, number>,
        vsrcCurrents: Record<string, number>,
        xfmrCurrents: Record<string, number>,
        u_vals: number[],
        x_vals: number[]
    ): Record<string, number> {
        const swCurrents: Record<string, number> = {};
        for (const sw of this.sw_comps) {
            swCurrents[sw.id] = 0.0;
        }

        const onSwitches = this.sw_comps.filter(sw => swStates[sw.id] === "ON");
        if (onSwitches.length === 0) return swCurrents;

        const nodeToSwitches: Record<string, Array<{ swId: string; otherNode: string; isAnode: boolean }>> = {};
        const degrees: Record<string, number> = {};

        const addEdge = (u: string, v: string, swId: string) => {
            if (!nodeToSwitches[u]) nodeToSwitches[u] = [];
            nodeToSwitches[u].push({ swId, otherNode: v, isAnode: true });
            degrees[u] = (degrees[u] || 0) + 1;

            if (!nodeToSwitches[v]) nodeToSwitches[v] = [];
            nodeToSwitches[v].push({ swId, otherNode: u, isAnode: false });
            degrees[v] = (degrees[v] || 0) + 1;
        };

        const activeNodes = new Set<string>();
        for (const sw of onSwitches) {
            const n1 = sw.nodes[0] ?? "node_0";
            const n2 = sw.nodes[1] ?? "node_0";
            addEdge(n1, n2, sw.id);
            activeNodes.add(n1);
            activeNodes.add(n2);
        }

        const I_ext: Record<string, number> = {};
        for (const n of activeNodes) {
            I_ext[n] = this.computeExternalCurrentEnteringNode(n, nodeVoltages, capCurrents, vsrcCurrents, xfmrCurrents, u_vals, x_vals);
        }

        const queue: string[] = [];
        for (const n of activeNodes) {
            if (degrees[n] === 1) {
                queue.push(n);
            }
        }

        const solvedSwitches = new Set<string>();

        while (queue.length > 0) {
            const leaf = queue.shift()!;
            if (degrees[leaf] !== 1) continue;

            const edges = nodeToSwitches[leaf] || [];
            const edge = edges.find(e => !solvedSwitches.has(e.swId));
            if (!edge) continue;

            const swId = edge.swId;
            const parent = edge.otherNode;
            const isAnode = edge.isAnode;

            const i_sw = isAnode ? I_ext[leaf] : -I_ext[leaf];
            swCurrents[swId] = i_sw;
            solvedSwitches.add(swId);

            if (activeNodes.has(parent)) {
                if (isAnode) {
                    I_ext[parent] += i_sw;
                } else {
                    I_ext[parent] -= i_sw;
                }
            }

            degrees[leaf] = 0;
            degrees[parent]--;
            if (degrees[parent] === 1) {
                queue.push(parent);
            }
        }

        return swCurrents;
    }

    computeExternalCurrentEnteringNode(
        n: string,
        nodeVoltages: Record<string, number>,
        capCurrents: Record<string, number>,
        vsrcCurrents: Record<string, number>,
        xfmrCurrents: Record<string, number>,
        u_vals: number[],
        x_vals: number[]
    ): number {
        let I_in = 0.0;
        const v_n = nodeVoltages[n] ?? 0.0;

        // Resistors
        for (const c of this.resistors) {
            const n1 = c.nodes[0] ?? "node_0";
            const n2 = c.nodes[1] ?? "node_0";
            if (n1 === n || n2 === n) {
                const r = parseScientific(c.parameters.value ?? "10");
                const v_other = (n1 === n) ? (nodeVoltages[n2] ?? 0.0) : (nodeVoltages[n1] ?? 0.0);
                I_in += (v_other - v_n) / r;
            }
        }

        // Inductors
        for (let p = 0; p < this.L_comps.length; p++) {
            const ind = this.L_comps[p];
            const n1 = ind.nodes[0] ?? "node_0";
            const n2 = ind.nodes[1] ?? "node_0";
            if (n1 === n) {
                I_in -= x_vals[p];
            }
            if (n2 === n) {
                I_in += x_vals[p];
            }
        }

        // Capacitors
        for (let q = 0; q < this.C_comps.length; q++) {
            const cap = this.C_comps[q];
            const n1 = cap.nodes[0] ?? "node_0";
            const n2 = cap.nodes[1] ?? "node_0";
            const curr = capCurrents[cap.id] ?? 0.0;
            if (n1 === n) I_in -= curr;
            if (n2 === n) I_in += curr;
        }

        // Voltage Sources
        for (let j = 0; j < this.V_comps.length; j++) {
            const vsrc = this.V_comps[j];
            const n1 = vsrc.nodes[0] ?? "node_0";
            const n2 = vsrc.nodes[1] ?? "node_0";
            const curr = vsrcCurrents[vsrc.id] ?? 0.0;
            if (n1 === n) I_in -= curr;
            if (n2 === n) I_in += curr;
        }

        // Current Sources
        for (let m = 0; m < this.I_comps.length; m++) {
            const isrc = this.I_comps[m];
            const n1 = isrc.nodes[0] ?? "node_0";
            const n2 = isrc.nodes[1] ?? "node_0";
            const val = u_vals[this.V_comps.length + m];
            if (n1 === n) I_in -= val;
            if (n2 === n) I_in += val;
        }

        // Transformers
        for (let i = 0; i < this.all_windings.length; i++) {
            const w = this.all_windings[i];
            const n1 = w.nodes[0] ?? "node_0";
            const n2 = w.nodes[1] ?? "node_0";
            const curr = xfmrCurrents[w.idx] ?? 0.0;
            if (n1 === n) I_in -= curr;
            if (n2 === n) I_in += curr;
        }

        return I_in;
    }

    evaluateInputVector(t: number, sigs: Record<string, number>, nodeVoltages: Record<string, number>): number[] {
        const u_vals: number[] = [];

        // Voltage Sources
        for (let j = 0; j < this.V_comps.length; j++) {
            const vsrc = this.V_comps[j];
            let val = 0.0;

            if (["VoltageSource", "ControlledVoltageSource", "OPAMP", "E_COMP", "V", "ControlledVoltageSource"].includes(vsrc.type)) {
                const srcType = vsrc.parameters.src_type;
                if (srcType === "controlled" || vsrc.type === "ControlledVoltageSource") {
                    const gain = parseScientific(vsrc.parameters.value ?? "1.0");
                    const ctrlSig = vsrc.channels.Ctrl;
                    const ctrlVal = (ctrlSig && sigs[ctrlSig] !== undefined) ? sigs[ctrlSig] : 0.0;
                    val = ctrlVal * gain;
                } else if (srcType === "opamp" || vsrc.type === "OPAMP") {
                    const gain = parseScientific(vsrc.parameters.gain ?? "1e5");
                    const vsat = parseScientific(vsrc.parameters.value ?? "12.0");
                    const nPlus = vsrc.parameters.plus_node;
                    const nMinus = vsrc.parameters.minus_node;

                    const vPlus = (nPlus && nPlus !== "node_0") ? (nodeVoltages[nPlus] ?? 0.0) : 0.0;
                    const vMinus = (nMinus && nMinus !== "node_0") ? (nodeVoltages[nMinus] ?? 0.0) : 0.0;
                    const vdiff = vPlus - vMinus;
                    let vout = gain * vdiff;
                    if (vout > vsat) vout = vsat;
                    else if (vout < -vsat) vout = -vsat;
                    val = vout;
                } else if (srcType === "e_comp" || vsrc.type === "E_COMP") {
                    const vsat = parseScientific(vsrc.parameters.value ?? "12.0");
                    const nPlus = vsrc.parameters.plus_node;
                    const nMinus = vsrc.parameters.minus_node;

                    const vPlus = (nPlus && nPlus !== "node_0") ? (nodeVoltages[nPlus] ?? 0.0) : 0.0;
                    const vMinus = (nMinus && nMinus !== "node_0") ? (nodeVoltages[nMinus] ?? 0.0) : 0.0;
                    val = vPlus > vMinus ? vsat : -vsat;
                } else {
                    val = parseScientific(vsrc.parameters.value ?? "24");
                }
            } else if (vsrc.type === "ACVoltageSource" || vsrc.type === "AC_V") {
                const amp = parseScientific(vsrc.parameters.amplitude ?? "230");
                const freq = parseScientific(vsrc.parameters.frequency ?? "50");
                const phase = parseScientific(vsrc.parameters.phase ?? "0");
                val = amp * Math.sin(2.0 * Math.PI * freq * t + phase * Math.PI / 180.0);
            } else if (vsrc.type === "Ammeter" || vsrc.type === "AM") {
                val = 0.0;
            }

            u_vals.push(val);
        }

        // Current Sources
        for (let m = 0; m < this.I_comps.length; m++) {
            const isrc = this.I_comps[m];
            let val = 0.0;
            const srcType = isrc.parameters.src_type;

            if (isrc.type === "ControlledCurrentSource" || srcType === "controlled") {
                const gain = parseScientific(isrc.parameters.value ?? "1.0");
                const ctrlSig = isrc.channels.Ctrl;
                const ctrlVal = (ctrlSig && sigs[ctrlSig] !== undefined) ? sigs[ctrlSig] : 0.0;
                val = ctrlVal * gain;
            } else if (isrc.type === "ACCurrentSource" || srcType === "ac") {
                const amp = parseScientific(isrc.parameters.amplitude ?? "1.0");
                const freq = parseScientific(isrc.parameters.frequency ?? "50.0");
                const phase = parseScientific(isrc.parameters.phase ?? "0.0");
                val = amp * Math.sin(2.0 * Math.PI * freq * t + phase * Math.PI / 180.0);
            } else {
                val = parseScientific(isrc.parameters.value ?? "1.0");
            }

            u_vals.push(val);
        }

        return u_vals;
    }

    projectStateAndDerivatives(x: number[], dx: number[] | null, swStates: Record<string, string>) {
        const allNodes = this.getAllNodes();
        const compUf = new UnionFind(allNodes);

        // Union nodes connected by resistors, voltage sources, and ON switches
        for (const r of this.resistors) {
            compUf.union(r.nodes[0] ?? "node_0", r.nodes[1] ?? "node_0");
        }
        for (const vsrc of this.V_comps) {
            compUf.union(vsrc.nodes[0] ?? "node_0", vsrc.nodes[1] ?? "node_0");
        }
        for (const sw of this.sw_comps) {
            if (swStates[sw.id] === "ON") {
                compUf.union(sw.nodes[0] ?? "node_0", sw.nodes[1] ?? "node_0");
            }
        }
        for (const w of this.all_windings) {
            compUf.union(w.nodes[0] ?? "node_0", w.nodes[1] ?? "node_0");
        }
        for (const cap of this.C_comps) {
            compUf.union(cap.nodes[0] ?? "node_0", cap.nodes[1] ?? "node_0");
        }

        const refRep = compUf.find("node_0");
        const reps = new Set<string>();
        for (const n of allNodes) {
            reps.add(compUf.find(n));
        }

        for (const r of reps) {
            if (r === refRep) continue;

            // This is a floating component. Find crossing inductors
            const crossing: Array<{ idx: number; sign: number }> = [];
            for (let p = 0; p < this.L_comps.length; p++) {
                const ind = this.L_comps[p];
                const r1 = compUf.find(ind.nodes[0] ?? "node_0");
                const r2 = compUf.find(ind.nodes[1] ?? "node_0");

                if (r1 === r && r2 !== r) {
                    crossing.push({ idx: p, sign: -1 });
                } else if (r2 === r && r1 !== r) {
                    crossing.push({ idx: p, sign: 1 });
                }
            }

            if (crossing.length > 0) {
                // Project state x
                let I_err = 0.0;
                for (const c of crossing) {
                    I_err += c.sign * x[c.idx];
                }
                for (const c of crossing) {
                    x[c.idx] -= c.sign * (I_err / crossing.length);
                }

                // Project derivatives dx if provided
                if (dx) {
                    let dI_err = 0.0;
                    for (const c of crossing) {
                        dI_err += c.sign * dx[c.idx];
                    }
                    for (const c of crossing) {
                        dx[c.idx] -= c.sign * (dI_err / crossing.length);
                    }
                }
            }
        }
    }

    takePWLStep(
        t: number,
        dt: number,
        x: number[],
        ss: Record<string, string>,
        sigs: Record<string, number>
    ) {
        let s_stage = { ...ss };
        let s_ch = true;
        let loop = 0;

        let dx = new Array(x.length).fill(0.0);
        let w_red = [];
        let cur_uf: any = null;
        let cur_refRep = "node_0";
        let cur_reducedNodeToIdx: Record<string, number> = {};

        let nodeVoltages: Record<string, number> = {};
        let capCurrents: Record<string, number> = {};
        let vsrcCurrents: Record<string, number> = {};
        let swCurrents: Record<string, number> = {};
        let xfmrCurrents: Record<string, number> = {};
        let u_vals: number[] = [];

        while (s_ch && loop < 10) {
            s_ch = false;
            loop++;

            const { A, B, K_x, K_u, uf, refRep, reducedNodeToIdx, numReducedNodes } = this.getModeMatrices(s_stage);
            cur_uf = uf;
            cur_refRep = refRep;
            cur_reducedNodeToIdx = reducedNodeToIdx;

            u_vals = this.evaluateInputVector(t, sigs, nodeVoltages);

            const rhs = new Array(x.length).fill(0.0);
            for (let i = 0; i < x.length; i++) {
                let sum = 0.0;
                for (let j = 0; j < x.length; j++) sum += A[i][j] * x[j];
                for (let j = 0; j < u_vals.length; j++) sum += B[i][j] * u_vals[j];
                rhs[i] = sum;
            }

            if (x.length > 0) {
                const M_mat = new SimpleMatrix(x.length, x.length);
                for (let i = 0; i < x.length; i++) {
                    for (let j = 0; j < x.length; j++) {
                        M_mat.set(i, j, (i === j ? 1.0 : 0.0) - dt * A[i][j]);
                    }
                }
                dx = M_mat.solve(rhs);
            } else {
                dx = [];
            }

            const N_vars = K_x.length;
            w_red = new Array(N_vars).fill(0.0);
            for (let i = 0; i < N_vars; i++) {
                let sum = 0.0;
                for (let j = 0; j < x.length; j++) sum += K_x[i][j] * x[j];
                for (let j = 0; j < u_vals.length; j++) sum += K_u[i][j] * u_vals[j];
                w_red[i] = sum;
            }

            nodeVoltages = {};
            for (const n of this.getAllNodes()) {
                const r = uf.find(n);
                if (r === refRep) {
                    nodeVoltages[n] = 0.0;
                } else {
                    const idx = reducedNodeToIdx[r];
                    nodeVoltages[n] = idx !== undefined ? w_red[idx] : 0.0;
                }
            }

            const N_r = numReducedNodes;

            capCurrents = {};
            for (let q = 0; q < this.C_comps.length; q++) {
                const cap = this.C_comps[q];
                capCurrents[cap.id] = w_red[N_r + this.V_comps.length + q];
            }

            vsrcCurrents = {};
            for (let j = 0; j < this.V_comps.length; j++) {
                const vsrc = this.V_comps[j];
                vsrcCurrents[vsrc.id] = w_red[N_r + j];
            }

            xfmrCurrents = {};
            for (let i = 0; i < this.all_windings.length; i++) {
                const w = this.all_windings[i];
                xfmrCurrents[w.idx] = w_red[N_r + this.V_comps.length + this.C_comps.length + i];
            }

            swCurrents = this.solveSwitchCurrents(s_stage, nodeVoltages, capCurrents, vsrcCurrents, xfmrCurrents, u_vals, x);

            let any_ch = false;
            const next_sw: Record<string, string> = {};
            for (const sw of this.sw_comps) {
                const n1 = sw.nodes[0] ?? "node_0";
                const n2 = sw.nodes[1] ?? "node_0";
                const vd = (nodeVoltages[n1] ?? 0.0) - (nodeVoltages[n2] ?? 0.0);
                const old_state = s_stage[sw.id] ?? "OFF";
                let swn = "OFF";

                if (["MOSFET", "vg-FET", "IGBT", "IGBT_DIODE", "IGCT", "GTO", "THYRISTOR", "JFET", "BJT"].includes(sw.type)) {
                    const gate_on = (sigs[sw.channels.G] ?? 0.0) > 0.5;
                    if (old_state === "ON") {
                        if (gate_on) {
                            swn = "ON";
                        } else {
                            const i_body = -swCurrents[sw.id];
                            swn = i_body > 1e-6 ? "ON" : "OFF";
                        }
                    } else {
                        const v_body = -vd;
                        swn = (gate_on || v_body > 1e-6) ? "ON" : "OFF";
                    }
                }
                else if (sw.type === "Diode") {
                    if (old_state === "ON") {
                        const i_diode = swCurrents[sw.id];
                        swn = i_diode > 1e-6 ? "ON" : "OFF";
                    } else {
                        swn = vd > 1e-6 ? "ON" : "OFF";
                    }
                }
                else if (sw.type === "Switch") {
                    const swCtrl = sw.channels.Switch || sw.channels.Ctrl;
                    if (swCtrl && sigs[swCtrl] !== undefined) {
                        swn = sigs[swCtrl] > 0.5 ? "ON" : "OFF";
                    } else {
                        swn = parseScientific(sw.parameters.state ?? "0") > 0.5 ? "ON" : "OFF";
                    }
                }

                next_sw[sw.id] = swn;
                if (swn !== old_state) {
                    any_ch = true;
                }
            }

            if (any_ch) {
                s_stage = next_sw;
                s_ch = true;
            }
        }

        this.projectStateAndDerivatives(x, dx, s_stage);

        return {
            dx,
            s_stage,
            nodeVoltages,
            capCurrents,
            vsrcCurrents,
            swCurrents,
            u_vals,
            xfmrCurrents
        };
    }

    // Explicit high-speed time stepping execution loop overriding the main runAsync
    async runAsync(shouldCancel: () => boolean, shouldPause: () => boolean) {
        this.initializeNetwork();

        this.idealizeComponents();
        this.classifyComps();

        this.time_log = [];
        this.voltages_log = {};
        this.inductors_log = {};
        this.voltmeters_log = {};
        this.ammeters_log = {};
        this.signals_log = {};
        this.custom_plots_log = {};

        const N_state = this.L_comps.length + this.C_comps.length;
        let x = new Array(N_state).fill(0.0);
        for (let p = 0; p < this.L_comps.length; p++) {
            x[p] = parseScientific(this.L_comps[p].parameters.iL0 ?? "0");
        }
        for (let q = 0; q < this.C_comps.length; q++) {
            x[this.L_comps.length + q] = parseScientific(this.C_comps[q].parameters.vC0 ?? "0");
        }

        let t = 0.0;
        let h = parseScientific(this.sim_params.h || "1e-5");
        const t_end = parseScientific(this.sim_params.t_end || "0.05");

        this.sw_states = {};
        for (const sw of this.sw_comps) {
            this.sw_states[sw.id] = "OFF";
        }

        let sigs = this.evaluateControls(0.0, this.w, this.control_states, h, this.sw_states, true, false);

        const initStep = this.takePWLStep(0.0, h, x, this.sw_states, sigs);
        this.sw_states = initStep.s_stage;

        const w_full = new Array(this.dim).fill(0.0);
        const mapToWFull = (
            nodeV: Record<string, number>, 
            capI: Record<string, number>, 
            vsrcI: Record<string, number>,
            xfmrI: Record<string, number>
        ) => {
            for (const n of this.active_nodes) {
                const idx = this.node_to_idx[n];
                if (idx !== undefined) w_full[idx] = nodeV[n] ?? 0.0;
            }
            for (let p = 0; p < this.L_comps.length; p++) {
                const ind = this.L_comps[p];
                const idx = this.L_to_idx[ind.id];
                if (idx !== undefined) w_full[idx] = x[p];
            }
            for (let j = 0; j < this.V_comps.length; j++) {
                const vsrc = this.V_comps[j];
                const idx = this.V_to_idx[vsrc.id];
                if (idx !== undefined) w_full[idx] = vsrcI[vsrc.id] ?? 0.0;
            }
            for (let i = 0; i < this.all_windings.length; i++) {
                const w = this.all_windings[i];
                w_full[w.idx] = xfmrI[w.idx] ?? 0.0;
            }
        };

        mapToWFull(initStep.nodeVoltages, initStep.capCurrents, initStep.vsrcCurrents, initStep.xfmrCurrents);
        this.w = [...w_full];

        this.last_swCurrents = initStep.swCurrents;
        this.last_capCurrents = initStep.capCurrents;
        sigs = this.evaluateControls(0.0, w_full, this.control_states, h, this.sw_states, true, false);
        this.logAcceptedState(0.0, w_full, sigs, this.sw_states, h);

        let iterations = 0;
        const max_iterations = 200000;

        while (t < t_end) {
            iterations++;
            if (iterations > max_iterations) {
                console.warn(`Simulation terminated early in runAsync PWL: exceeded max iterations (${max_iterations})`);
                break;
            }

            if (iterations % 200 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
                if (shouldCancel()) {
                    console.log("runAsync PWL simulation cancelled.");
                    break;
                }
                while (shouldPause()) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                    if (shouldCancel()) break;
                }
            }

            if (t + h > t_end) h = t_end - t;

            try {
                sigs = this.evaluateControls(t, w_full, this.control_states, h, this.sw_states, false, true);

                const step = this.takePWLStep(t, h, x, this.sw_states, sigs);
                this.sw_states = step.s_stage;

                for (let i = 0; i < x.length; i++) {
                    x[i] = x[i] + step.dx[i] * h;
                }

                mapToWFull(step.nodeVoltages, step.capCurrents, step.vsrcCurrents, step.xfmrCurrents);
                this.w = [...w_full];

                t += h;

                this.last_swCurrents = step.swCurrents;
                this.last_capCurrents = step.capCurrents;
                const final_sigs = this.evaluateControls(t, w_full, this.control_states, h, this.sw_states, false, false, true);
                this.logAcceptedState(t, w_full, final_sigs, this.sw_states, h);

            } catch (err: any) {
                console.error("Error in PWL transient loop:", err);
                break;
            }
        }

        return {
            time: this.time_log,
            voltages: this.voltages_log,
            inductors: this.inductors_log,
            voltmeters: this.voltmeters_log,
            ammeters: this.ammeters_log,
            signals: this.signals_log,
            custom_plots: this.custom_plots_log
        };
    }

    logAcceptedState(time: number, w_val: number[], sigs: Record<string, number>, ss: Record<string, string>, dt: number) {
        this.time_log.push(time);
        
        for (const node of this.active_nodes) {
            if (!this.voltages_log[node]) this.voltages_log[node] = [];
            this.voltages_log[node].push(w_val[this.node_to_idx[node]]);
        }
        for (const ind of this.inductors) {
            const idx = this.L_to_idx[ind.id];
            if (!this.inductors_log[ind.id]) this.inductors_log[ind.id] = [];
            this.inductors_log[ind.id].push(w_val[idx]);
        }
        for (const comp of this.voltage_sources) {
            if (comp.type === "Ammeter") {
                const idx = this.V_to_idx[comp.id];
                if (!this.ammeters_log[comp.id]) this.ammeters_log[comp.id] = [];
                this.ammeters_log[comp.id].push(w_val[idx]);
            }
        }
        for (const vm of this.voltmeters) {
            const n1 = vm.nodes[0] ?? "node_0", n2 = vm.nodes[1] ?? "node_0";
            const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1;
            const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
            if (!this.voltmeters_log[vm.id]) this.voltmeters_log[vm.id] = [];
            this.voltmeters_log[vm.id].push(((i1 >= 0) ? w_val[i1] : 0.0) - ((i2 >= 0) ? w_val[i2] : 0.0));
        }
        for (const [k, v] of Object.entries(sigs)) {
            if (!this.signals_log[k]) this.signals_log[k] = [];
            this.signals_log[k].push(v);
        }

        for (const comp of this.physical_stage) {
            const kv = "V_" + comp.id; 
            const ki = "I_" + comp.id; 
            const kc = "Ctrl_" + comp.id;
            
            const ctrlChan = comp.channels.Ctrl || comp.channels.Switch || comp.channels.G;
            if (ctrlChan !== undefined) {
                const ctrlVal = sigs[ctrlChan] !== undefined ? sigs[ctrlChan] : 0.0;
                if (!this.custom_plots_log[kc]) this.custom_plots_log[kc] = [];
                this.custom_plots_log[kc].push(ctrlVal);
            }

            if (comp.type === "XFMR") {
                const txWindings = this.all_windings.filter(w => w.transformer_id === comp.id);
                if (txWindings.length > 0) {
                    const w0 = txWindings[0];
                    const wn1 = w0.nodes[0] ?? "node_0", wn2 = w0.nodes[1] ?? "node_0";
                    const wi1 = (wn1 !== "node_0") ? this.node_to_idx[wn1] : -1;
                    const wi2 = (wn2 !== "node_0") ? this.node_to_idx[wn2] : -1;
                    const v0 = ((wi1 >= 0) ? w_val[wi1] : 0.0) - ((wi2 >= 0) ? w_val[wi2] : 0.0);
                    const curr0 = w_val[w0.idx];
                    
                    if (!this.custom_plots_log[kv]) this.custom_plots_log[kv] = [];
                    this.custom_plots_log[kv].push(v0);
                    if (!this.custom_plots_log[ki]) this.custom_plots_log[ki] = [];
                    this.custom_plots_log[ki].push(curr0);
                }
                
                for (const w of txWindings) {
                    const wn1 = w.nodes[0] ?? "node_0", wn2 = w.nodes[1] ?? "node_0";
                    const wi1 = (wn1 !== "node_0") ? this.node_to_idx[wn1] : -1;
                    const wi2 = (wn2 !== "node_0") ? this.node_to_idx[wn2] : -1;
                    const vw = ((wi1 >= 0) ? w_val[wi1] : 0.0) - ((wi2 >= 0) ? w_val[wi2] : 0.0);
                    const currw = w_val[w.idx];
                    
                    const label = `${comp.id}_${w.type === "primary" ? "P" : "S"}${w.winding_index}`;
                    const w_kv = "V_" + label;
                    const w_ki = "I_" + label;
                    
                    if (!this.custom_plots_log[w_kv]) this.custom_plots_log[w_kv] = [];
                    this.custom_plots_log[w_kv].push(vw);
                    if (!this.custom_plots_log[w_ki]) this.custom_plots_log[w_ki] = [];
                    this.custom_plots_log[w_ki].push(currw);
                }
                continue;
            }

            const n1 = comp.nodes[0] ?? "node_0", n2 = comp.nodes[1] ?? "node_0";
            const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1;
            const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
            const v = ((i1 >= 0) ? w_val[i1] : 0.0) - ((i2 >= 0) ? w_val[i2] : 0.0);
            
            if (!this.custom_plots_log[kv]) this.custom_plots_log[kv] = []; 
            this.custom_plots_log[kv].push(v);
            
            let curr = 0.0;
            if (comp.type === "Resistor" || comp.type === "R") { 
                let val = parseScientific(comp.parameters.value ?? "10"); 
                if (val < 1e-6) val = 1e-6; 
                curr = v / val; 
            }
            else if (comp.type === "VariableResistor") {
                const ctrlSig = comp.channels.Ctrl;
                const baseVal = parseScientific(comp.parameters.value ?? "10");
                const ctrlVal = (ctrlSig && sigs[ctrlSig] !== undefined) ? sigs[ctrlSig] : baseVal;
                let r_val = ctrlVal;
                if (r_val < 1e-6) r_val = 1e-6;
                curr = v / r_val;
            }
            else if (comp.type === "Inductor" || comp.type === "L") { 
                const idx = this.L_to_idx[comp.id]; 
                curr = (idx !== undefined) ? w_val[idx] : 0.0; 
            }
            else if (comp.type === "Capacitor" || comp.type === "C") {
                curr = this.last_capCurrents[comp.id] ?? 0.0;
            } 
            else if (["VoltageSource", "ACVoltageSource", "Ammeter", "V", "AC_V", "AM", "ControlledVoltageSource", "OPAMP", "E_COMP"].includes(comp.type)) { 
                const idx = this.V_to_idx[comp.id]; 
                curr = (idx !== undefined) ? w_val[idx] : 0.0; 
            } 
            else if (["Switch", "Diode", "MOSFET", "vg-FET", "S", "D", "IGBT", "IGBT_DIODE", "IGCT", "GTO", "THYRISTOR", "JFET", "BJT"].some(t => comp.type.includes(t))) {
                curr = this.last_swCurrents[comp.id] ?? 0.0;
            } 
            else if (comp.type === "CurrentSource" || comp.type === "I" || comp.type === "ControlledCurrentSource" || comp.type === "ACCurrentSource") { 
                const srcType = comp.parameters.src_type;
                if (comp.type === "ControlledCurrentSource" || srcType === "controlled") {
                    const gain = parseScientific(comp.parameters.value ?? "1.0");
                    const ctrlSig = comp.channels.Ctrl;
                    const ctrlVal = (ctrlSig && sigs[ctrlSig] !== undefined) ? sigs[ctrlSig] : 0.0;
                    curr = ctrlVal * gain;
                } else if (comp.type === "ACCurrentSource" || srcType === "ac") {
                    const amp = parseScientific(comp.parameters.amplitude ?? "1.0"), freq = parseScientific(comp.parameters.frequency ?? "50.0");
                    const phase = parseScientific(comp.parameters.phase ?? "0.0");
                    curr = amp * Math.sin(2.0 * Math.PI * freq * time + phase * Math.PI / 180.0);
                } else {
                    curr = parseScientific(comp.parameters.value ?? "1.0");
                }
            }

            if (!this.custom_plots_log[ki]) this.custom_plots_log[ki] = [];
            this.custom_plots_log[ki].push(curr);
        }
    }
}
