export function parseScientific(str: any): number {
    if (typeof str === 'number') return str;
    if (str === undefined || str === null || str === '') return 0.0;
    let s = String(str).trim();
    if (!s) return 0.0;
    const lastChar = s[s.length - 1];
    let multiplier = 1.0;
    let hasSuffix = false;
    if (lastChar === 'p') { multiplier = 1e-12; hasSuffix = true; }
    else if (lastChar === 'n') { multiplier = 1e-9; hasSuffix = true; }
    else if (lastChar === 'u') { multiplier = 1e-6; hasSuffix = true; }
    else if (lastChar === 'm') { multiplier = 1e-3; hasSuffix = true; }
    else if (lastChar === 'k') { multiplier = 1e3; hasSuffix = true; }
    else if (lastChar === 'M') { multiplier = 1e6; hasSuffix = true; }
    else if (lastChar === 'G') { multiplier = 1e9; hasSuffix = true; }
    if (hasSuffix) s = s.slice(0, -1).trim();
    const val = parseFloat(s);
    return isNaN(val) ? 0.0 : val * multiplier;
}

export class ExpressionEvaluator {
    evaluate(expression: string, variables: Record<string, number>): number {
        const expr = expression.trim();
        if (!expr) return 0.0;
        return new Parser(expr, variables).parse();
    }
}

class Parser {
    expr: string; pos = 0; vars: Record<string, number>;
    constructor(expr: string, vars: Record<string, number>) {
        this.expr = expr; this.vars = vars;
    }
    peek() { return this.pos < this.expr.length ? this.expr[this.pos] : '\0'; }
    get() { return this.pos < this.expr.length ? this.expr[this.pos++] : '\0'; }
    skipWhitespace() { while (this.pos < this.expr.length && /\s/.test(this.expr[this.pos])) this.pos++; }
    parsePrimary(): number {
        this.skipWhitespace();
        const c = this.peek();
        if (c === '-') { this.get(); return -this.parsePrimary(); }
        if (c === '+') { this.get(); return this.parsePrimary(); }
        if (c === '(') {
            this.get();
            const val = this.parseExpression();
            this.skipWhitespace();
            if (this.peek() === ')') this.get();
            return val;
        }
        if (/[0-9.]/.test(c)) {
            let num = "";
            while (this.pos < this.expr.length && /[0-9.eE+-]/.test(this.expr[this.pos])) {
                const curr = this.expr[this.pos];
                if ((curr === '-' || curr === '+') && num.length > 0 && !/[eE]/.test(num[num.length - 1])) break;
                num += this.get();
            }
            const val = parseFloat(num);
            return isNaN(val) ? 0.0 : val;
        }
        if (/[a-zA-Z_]/.test(c)) {
            let name = "";
            while (this.pos < this.expr.length && /[a-zA-Z0-9_]/.test(this.expr[this.pos])) name += this.get();
            this.skipWhitespace();
            if (this.peek() === '(') {
                this.get();
                const arg1 = this.parseExpression();
                this.skipWhitespace();
                let arg2 = 0.0;
                if (this.peek() === ',') { this.get(); arg2 = this.parseExpression(); }
                this.skipWhitespace();
                if (this.peek() === ')') this.get();
                if (name === "sin") return Math.sin(arg1);
                if (name === "cos") return Math.cos(arg1);
                if (name === "tan") return Math.tan(arg1);
                if (name === "abs") return Math.abs(arg1);
                if (name === "sqrt") return Math.sqrt(Math.abs(arg1));
                if (name === "exp") return Math.exp(arg1);
                if (name === "log") return Math.log(Math.abs(arg1) + 1e-15);
                if (name === "max") return Math.max(arg1, arg2);
                if (name === "min") return Math.min(arg1, arg2);
                if (name === "pow") return Math.pow(arg1, arg2);
            }
            if (name in this.vars) return this.vars[name];
            if (name === "pi" || name === "M_PI") return Math.PI;
            return 0.0;
        }
        return 0.0;
    }
    parsePower(): number {
        let val = this.parsePrimary();
        this.skipWhitespace();
        while (this.peek() === '^') { this.get(); val = Math.pow(val, this.parsePrimary()); this.skipWhitespace(); }
        return val;
    }
    parseFactor(): number {
        let val = this.parsePower();
        this.skipWhitespace();
        while (this.peek() === '*' || this.peek() === '/') {
            const op = this.get();
            const r = this.parsePower();
            val = (op === '*') ? val * r : ((Math.abs(r) > 1e-30) ? val / r : 0.0);
            this.skipWhitespace();
        }
        return val;
    }
    parseExpression(): number {
        let val = this.parseFactor();
        this.skipWhitespace();
        while (this.peek() === '+' || this.peek() === '-') {
            const op = this.get();
            const r = this.parseFactor();
            val = (op === '+') ? val + r : val - r;
            this.skipWhitespace();
        }
        return val;
    }
    parse() { try { return this.parseExpression(); } catch (_) { return 0.0; } }
}

interface Statement { lhs_type: "state" | "outputs"; lhs_key: string; op: string; rhs_expr: string; }

export class CustomScriptBlock {
    code_str: string; params: Record<string, number>;
    state: Record<string, number> = {}; inputs: string[] = []; outputs: string[] = [];
    init_statements: Statement[] = []; step_statements: Statement[] = [];
    constructor(code: string, inputParams: Record<string, number>) {
        this.code_str = code; this.params = inputParams;
        this.discover_ports(); this.compile_code(); this.reset();
    }
    discover_ports() {
        const parsePorts = (kw: string, set: Set<string>) => {
            let pos = 0;
            while (true) {
                const p = this.code_str.indexOf(kw, pos);
                if (p === -1) break;
                pos = p + kw.length;
                if (p + kw.length < this.code_str.length && (this.code_str[p + kw.length] === '[' || this.code_str.substring(p + kw.length, p + kw.length + 5) === ".get(")) {
                    const is_get = this.code_str.substring(p + kw.length, p + kw.length + 5) === ".get(";
                    let sp = p + kw.length + (is_get ? 5 : 1);
                    if (this.code_str[sp] === '"' || this.code_str[sp] === '\'') sp++;
                    let key = "";
                    while (sp < this.code_str.length && !/[\]\)\,\"\']/.test(this.code_str[sp])) {
                        if (/[a-zA-Z0-9_]/.test(this.code_str[sp])) key += this.code_str[sp];
                        sp++;
                    }
                    if (key) set.add(key);
                }
            }
        };
        const in_set = new Set<string>(); const out_set = new Set<string>();
        parsePorts("inputs", in_set); parsePorts("outputs", out_set);
        this.inputs = Array.from(in_set); this.outputs = Array.from(out_set);
    }
    normalize_expression(raw: string): string {
        let norm = ""; let i = 0;
        while (i < raw.length) {
            if (i + 7 < raw.length && (raw.substring(i, i + 7) === "inputs[" || raw.substring(i, i + 11) === "inputs.get(")) {
                const is_get = raw.substring(i, i + 11) === "inputs.get(";
                i += is_get ? 11 : 7; norm += "inputs_";
                if (raw[i] === '"' || raw[i] === '\'') i++;
                while (i < raw.length && !/[\]\)\,\"\']/.test(raw[i])) { if (/[a-zA-Z0-9_]/.test(raw[i])) norm += raw[i]; i++; }
                while (i < raw.length && raw[i] !== ']' && raw[i] !== ')') i++;
                if (i < raw.length) i++;
            } else if (i + 8 < raw.length && (raw.substring(i, i + 8) === "outputs[" || raw.substring(i, i + 12) === "outputs.get(")) {
                const is_get = raw.substring(i, i + 12) === "outputs.get(";
                i += is_get ? 12 : 8; norm += "outputs_";
                if (raw[i] === '"' || raw[i] === '\'') i++;
                while (i < raw.length && !/[\]\)\,\"\']/.test(raw[i])) { if (/[a-zA-Z0-9_]/.test(raw[i])) norm += raw[i]; i++; }
                while (i < raw.length && raw[i] !== ']' && raw[i] !== ')') i++;
                if (i < raw.length) i++;
            } else if (i + 6 < raw.length && raw.substring(i, i + 6) === "state[") {
                i += 6; norm += "state_";
                if (raw[i] === '"' || raw[i] === '\'') i++;
                while (i < raw.length && !/[\]\"\']/.test(raw[i])) { if (/[a-zA-Z0-9_]/.test(raw[i])) norm += raw[i]; i++; }
                while (i < raw.length && raw[i] !== ']') i++;
                if (i < raw.length) i++;
            } else if (i + 7 < raw.length && raw.substring(i, i + 7) === "params[") {
                i += 7; norm += "params_";
                if (raw[i] === '"' || raw[i] === '\'') i++;
                while (i < raw.length && !/[\]\"\']/.test(raw[i])) { if (/[a-zA-Z0-9_]/.test(raw[i])) norm += raw[i]; i++; }
                while (i < raw.length && raw[i] !== ']') i++;
                if (i < raw.length) i++;
            } else if (i + 5 < raw.length && raw.substring(i, i + 5) === "math.") {
                i += 5;
            } else {
                norm += raw[i++];
            }
        }
        return norm;
    }
    parse_statement(line: string, target: Statement[]) {
        if (!line) return;
        const eq = line.indexOf('='); if (eq === -1) return;
        let lhs = line.substring(0, eq).trim(); let rhs = line.substring(eq + 1).trim();
        let op = "=";
        if (lhs.endsWith('+')) { op = "+="; lhs = lhs.slice(0, -1).trim(); }
        else if (lhs.endsWith('-')) { op = "-="; lhs = lhs.slice(0, -1).trim(); }
        else if (lhs.endsWith('*')) { op = "*="; lhs = lhs.slice(0, -1).trim(); }
        let lhs_type: "state" | "outputs" | "" = ""; let lhs_key = "";
        if (lhs.startsWith("state[") || lhs.startsWith("state_")) {
            lhs_type = "state";
            if (lhs.startsWith("state[")) {
                let p1 = lhs.indexOf('"'); if (p1 === -1) p1 = lhs.indexOf('\'');
                if (p1 !== -1) { const p2 = lhs.indexOf(lhs[p1], p1 + 1); if (p2 !== -1) lhs_key = lhs.substring(p1 + 1, p2); }
            } else lhs_key = lhs.substring(6);
        } else if (lhs.startsWith("outputs[") || lhs.startsWith("outputs_")) {
            lhs_type = "outputs";
            if (lhs.startsWith("outputs[")) {
                let p1 = lhs.indexOf('"'); if (p1 === -1) p1 = lhs.indexOf('\'');
                if (p1 !== -1) { const p2 = lhs.indexOf(lhs[p1], p1 + 1); if (p2 !== -1) lhs_key = lhs.substring(p1 + 1, p2); }
            } else lhs_key = lhs.substring(8);
        }
        if (!lhs_key || !lhs_type) return;
        if (rhs.endsWith(';')) rhs = rhs.slice(0, -1).trim();
        target.push({ lhs_type, lhs_key, op, rhs_expr: this.normalize_expression(rhs) });
    }
    compile_code() {
        this.init_statements = []; this.step_statements = [];
        const lines = this.code_str.split('\n');
        let in_init = false, in_step = false;
        for (const line of lines) {
            if (line.includes("def initialize")) { in_init = true; in_step = false; continue; }
            if (line.includes("def step")) { in_init = false; in_step = true; continue; }
            if (line.includes("def ")) { in_init = false; in_step = false; continue; }
            const clean = line.trim();
            if (!clean || clean.startsWith('#') || clean === "pass") continue;
            if (in_init) this.parse_statement(clean, this.init_statements);
            else if (in_step) this.parse_statement(clean, this.step_statements);
        }
    }
    reset() {
        this.state = {};
        const ev = new ExpressionEvaluator();
        const vars: Record<string, number> = {};
        for (const [k, v] of Object.entries(this.params)) vars["params_" + k] = v;
        for (const s of this.init_statements) {
            if (s.lhs_type === "state") {
                const val = ev.evaluate(s.rhs_expr, vars);
                this.state[s.lhs_key] = val; vars["state_" + s.lhs_key] = val;
            }
        }
    }
    step(time: number, inputs_dict: Record<string, number>): Record<string, number> {
        const run_outputs: Record<string, number> = {};
        for (const out of this.outputs) run_outputs[out] = 0.0;
        const vars: Record<string, number> = { time };
        for (const [k, v] of Object.entries(this.params)) vars["params_" + k] = v;
        for (const [k, v] of Object.entries(this.state)) vars["state_" + k] = v;
        for (const inp of this.inputs) vars["inputs_" + inp] = inputs_dict[inp] ?? 0.0;
        for (const out of this.outputs) vars["outputs_" + out] = 0.0;
        const ev = new ExpressionEvaluator();
        for (const s of this.step_statements) {
            const rhs = ev.evaluate(s.rhs_expr, vars);
            if (s.lhs_type === "state") {
                if (s.op === "=") this.state[s.lhs_key] = rhs;
                else if (s.op === "+=") this.state[s.lhs_key] = (this.state[s.lhs_key] ?? 0.0) + rhs;
                else if (s.op === "-=") this.state[s.lhs_key] = (this.state[s.lhs_key] ?? 0.0) - rhs;
                else if (s.op === "*=") this.state[s.lhs_key] = (this.state[s.lhs_key] ?? 0.0) * rhs;
                vars["state_" + s.lhs_key] = this.state[s.lhs_key];
            } else if (s.lhs_type === "outputs") {
                if (s.op === "=") run_outputs[s.lhs_key] = rhs;
                else if (s.op === "+=") run_outputs[s.lhs_key] = (run_outputs[s.lhs_key] ?? 0.0) + rhs;
                else if (s.op === "-=") run_outputs[s.lhs_key] = (run_outputs[s.lhs_key] ?? 0.0) - rhs;
                else if (s.op === "*=") run_outputs[s.lhs_key] = (run_outputs[s.lhs_key] ?? 0.0) * rhs;
                vars["outputs_" + s.lhs_key] = run_outputs[s.lhs_key];
            }
        }
        return run_outputs;
    }
}

export class Vector {
    data: number[]; constructor(size: number, val = 0.0) { this.data = new Array(size).fill(val); }
    size() { return this.data.length; }
}

export class Matrix {
    rows: number; cols: number; data: number[];
    constructor(rows: number, cols: number, val = 0.0) {
        this.rows = rows; this.cols = cols; this.data = new Array(rows * cols).fill(val);
    }
    get(r: number, c: number) { return this.data[r * this.cols + c]; }
    set(r: number, c: number, v: number) { this.data[r * this.cols + c] = v; }
    add(r: number, c: number, v: number) { this.data[r * this.cols + c] += v; }
    multiply(vec: number[]): number[] {
        const res = new Array(this.rows).fill(0);
        for (let r = 0; r < this.rows; r++) {
            let s = 0; for (let c = 0; c < this.cols; c++) s += this.get(r, c) * vec[c];
            res[r] = s;
        }
        return res;
    }
    submatrix(rowsIdx: number[], colsIdx: number[]): Matrix {
        const sub = new Matrix(rowsIdx.length, colsIdx.length);
        for (let r = 0; r < rowsIdx.length; r++) {
            for (let c = 0; c < colsIdx.length; c++) sub.set(r, c, this.get(rowsIdx[r], colsIdx[c]));
        }
        return sub;
    }
    solve(b: number[]): number[] {
        const n = this.rows; const A_data = [...this.data]; const x = [...b]; const cols = this.cols;
        for (let i = 0; i < n; i++) {
            let max_row = i; let max_val = Math.abs(A_data[i * cols + i]);
            for (let k = i + 1; k < n; k++) {
                const val = Math.abs(A_data[k * cols + i]);
                if (val > max_val) { max_val = val; max_row = k; }
            }
            if (max_row !== i) {
                for (let j = i; j < n; j++) {
                    const temp = A_data[i * cols + j]; A_data[i * cols + j] = A_data[max_row * cols + j]; A_data[max_row * cols + j] = temp;
                }
                const temp = x[i]; x[i] = x[max_row]; x[max_row] = temp;
            }
            if (Math.abs(A_data[i * cols + i]) < 1e-15) throw new Error("Singular matrix");
            for (let k = i + 1; k < n; k++) {
                const factor = A_data[k * cols + i] / A_data[i * cols + i]; A_data[k * cols + i] = 0.0;
                for (let j = i + 1; j < n; j++) A_data[k * cols + j] -= factor * A_data[i * cols + j];
                x[k] -= factor * x[i];
            }
        }
        const res = new Array(n).fill(0);
        for (let i = n - 1; i >= 0; i--) {
            let s = 0; for (let j = i + 1; j < n; j++) s += A_data[i * cols + j] * res[j];
            res[i] = (x[i] - s) / A_data[i * cols + i];
        }
        return res;
    }
}

export interface ComponentTS {
    id: string; type: string; nodes: string[]; parameters: Record<string, any>; channels: Record<string, any>;
}

export class CircuitSimulator {
    physical_stage: ComponentTS[] = []; control_loops: ComponentTS[] = [];
    sim_params = { t_end: 0.05, h: 1e-5, solver: "euler", step_type: "fixed" };
    node_to_idx: Record<string, number> = {}; L_to_idx: Record<string, number> = {}; V_to_idx: Record<string, number> = {};
    active_nodes: string[] = []; num_nodes = 0; num_L = 0; num_V = 0; dim = 0;
    M = new Matrix(0, 0); K_static = new Matrix(0, 0); w: number[] = [];
    diff_idx: number[] = []; alg_idx: number[] = []; is_alg_all_zero = false;
    resistors: ComponentTS[] = []; capacitors: ComponentTS[] = []; inductors: ComponentTS[] = [];
    voltage_sources: ComponentTS[] = []; switches: ComponentTS[] = []; voltmeters: ComponentTS[] = [];
    sw_states: Record<string, string> = {}; control_states: Record<string, any> = {};
    custom_blocks: Record<string, CustomScriptBlock> = {};
    time_log: number[] = []; voltages_log: Record<string, number[]> = {}; inductors_log: Record<string, number[]> = {};
    voltmeters_log: Record<string, number[]> = {}; ammeters_log: Record<string, number[]> = {};
    signals_log: Record<string, number[]> = {}; custom_plots_log: Record<string, number[]> = {};
    cap_history: Record<string, { v_prev: number; v_prev_prev: number; dt_prev: number }> = {};

    constructor(physical: any, control: any, params: any) {
        let physicalArray: ComponentTS[] = [];
        if (Array.isArray(physical)) {
            physicalArray = physical;
        } else if (physical && typeof physical === "object") {
            const categories = [
                { key: "resistors", type: "Resistor" },
                { key: "inductors", type: "Inductor" },
                { key: "capacitors", type: "Capacitor" },
                { key: "voltage_sources", type: "dc_ac" },
                { key: "current_sources", type: "CurrentSource" },
                { key: "switches", type: "Switch" },
                { key: "diodes", type: "Diode" },
                { key: "analog_switches", type: "MOSFET" },
                { key: "transformers", type: "XFMR" },
                { key: "voltmeters", type: "Voltmeter" },
                { key: "ammeters", type: "Ammeter" }
            ];

            for (const cat of categories) {
                const list = physical[cat.key];
                if (Array.isArray(list)) {
                    for (const item of list) {
                        const comp: ComponentTS = {
                            id: item.id || `C_${Math.floor(Math.random() * 1000)}`,
                            type: cat.type === "dc_ac" ? (item.type === "ac" ? "ACVoltageSource" : "VoltageSource") : cat.type,
                            nodes: item.nodes || [],
                            parameters: {},
                            channels: {}
                        };
                        
                        for (const [k, v] of Object.entries(item)) {
                            if (["id", "nodes", "type", "control_signal", "signal"].includes(k)) continue;
                            comp.parameters[k] = String(v);
                        }

                        if (cat.type === "Switch" && item.control_signal) {
                            comp.channels = { Switch: item.control_signal };
                        } else if (cat.type === "MOSFET" && item.control_signal) {
                            comp.channels = { G: item.control_signal };
                        } else if (cat.type === "Voltmeter" && item.signal) {
                            comp.channels = { OutV: item.signal };
                        } else if (cat.type === "Ammeter" && item.signal) {
                            comp.channels = { OutI: item.signal };
                        }

                        physicalArray.push(comp);
                    }
                }
            }
        }

        this.physical_stage = physicalArray.map(c => ({
            ...c,
            nodes: c.nodes || [],
            parameters: c.parameters || {},
            channels: c.channels || {}
        }));

        let controlArray: ComponentTS[] = [];
        if (Array.isArray(control)) {
            controlArray = control;
        } else if (control && typeof control === "object") {
            const categories = [
                { key: "constants", type: "Constant" },
                { key: "gains", type: "Gain" },
                { key: "pi_controllers", type: "PI_Controller" },
                { key: "pid_controllers", type: "ContinuousPID" },
                { key: "summing_junctions", type: "SummingJunction" },
                { key: "pwm_generators", type: "PWM_Generator" },
                { key: "triangle_carriers", type: "Triangle_Carrier" },
                { key: "comparators", type: "Comparator" },
                { key: "logic_gates", type: "logic" },
                { key: "product_blocks", type: "Product" },
                { key: "custom_functions", type: "CustomFunction" },
                { key: "custom_scripts", type: "CustomScript" },
                { key: "signals_routing", type: "routing" },
                { key: "plls", type: "PLL" }
            ];

            for (const cat of categories) {
                const list = control[cat.key];
                if (Array.isArray(list)) {
                    for (const item of list) {
                        const comp: ComponentTS = {
                            id: item.id || `CTRL_${Math.floor(Math.random() * 1000)}`,
                            type: cat.type === "logic" 
                                ? (item.type === "and" ? "AND_Gate" : item.type === "or" ? "OR_Gate" : "NOT_Gate") 
                                : cat.type === "routing"
                                    ? (item.type === "mux" ? "Mux" : "Demux")
                                    : cat.type,
                            nodes: [],
                            parameters: {},
                            channels: {}
                        };

                        for (const [k, v] of Object.entries(item)) {
                            if (["id", "type", "nodes", "input", "output", "inputs", "outputs", "signs", "expr", "code"].includes(k)) continue;
                            comp.parameters[k] = String(v);
                        }

                        if (cat.type === "Constant" && item.output) {
                            comp.channels = { Out: item.output };
                                                } else if (cat.type === "Gain" && item.output) {
                            const chs: Record<string, string> = { Out: item.output };
                            if (item.input) chs.In = item.input;
                            if (item.input1) chs.In1 = item.input1;
                            if (item.input2) chs.In2 = item.input2;
                            if (item.control_signal) chs.Ctrl = item.control_signal;
                            if (Array.isArray(item.inputs)) {
                                item.inputs.forEach((inp: string, idx: number) => {
                                    if (inp) chs[`In${idx + 1}`] = inp;
                                });
                            }
                            comp.channels = chs;
                        } else if (cat.type === "PI_Controller" && item.input && item.output) {
                            comp.channels = { In: item.input, Out: item.output };
                        } else if (cat.type === "ContinuousPID" && item.input && item.output) {
                            comp.channels = { In: item.input, Out: item.output };
                        } else if (cat.type === "PLL") {
                            const chs: Record<string, string> = {};
                            if (item.input) chs.In = item.input;
                            if (Array.isArray(item.inputs)) {
                                if (item.inputs[0]) chs.Va = item.inputs[0];
                                if (item.inputs[1]) chs.Vb = item.inputs[1];
                                if (item.inputs[2]) chs.Vc = item.inputs[2];
                            }
                            if (item.output_theta) chs.Theta = item.output_theta;
                            if (item.output_freq) chs.Freq = item.output_freq;
                            if (item.output_cos) chs.Cos = item.output_cos;
                            if (item.output_sin) chs.Sin = item.output_sin;
                            comp.channels = chs;
                        } else if (cat.type === "SummingJunction" && Array.isArray(item.inputs) && item.output) {
                            const chs: Record<string, string> = { Out: item.output };
                            item.inputs.forEach((inp: string, index: number) => {
                                chs[`In${index + 1}`] = inp;
                            });
                            if (item.inputs[0]) chs.A = item.inputs[0];
                            if (item.inputs[1]) chs.B = item.inputs[1];
                            if (item.control_signal) chs.Ctrl = item.control_signal;
                            comp.channels = chs;
                            comp.parameters.signs = item.signs;
                        } else if (cat.type === "PWM_Generator" && item.input && item.output) {
                            comp.channels = { In: item.input, Out: item.output };
                        } else if (cat.type === "Triangle_Carrier" && item.output) {
                            comp.channels = { Out: item.output };
                        } else if (cat.type === "Comparator" && Array.isArray(item.inputs) && item.output) {
                            comp.channels = { Plus: item.inputs[0], Minus: item.inputs[1], Out: item.output };
                        } else if (cat.type === "logic" && Array.isArray(item.inputs) && item.output) {
                            if (item.type === "not") {
                                comp.channels = { In: item.inputs[0], Out: item.output };
                            } else {
                                comp.channels = { A: item.inputs[0], B: item.inputs[1], Out: item.output };
                            }
                        } else if (cat.type === "Product" && Array.isArray(item.inputs) && item.output) {
                            const chs: Record<string, string> = { Out: item.output };
                            item.inputs.forEach((inp: string, index: number) => {
                                chs[`In${index + 1}`] = inp;
                            });
                            if (item.inputs[0]) chs.In1 = item.inputs[0];
                            if (item.inputs[1]) chs.In2 = item.inputs[1];
                            if (item.control_signal) chs.Ctrl = item.control_signal;
                            comp.channels = chs;
                        } else if (cat.type === "CustomFunction" && item.input && item.output) {
                            comp.channels = { In: item.input, Out: item.output };
                            comp.parameters.expr = item.expr;
                        } else if (cat.type === "CustomScript") {
                            comp.parameters.code = item.code || "";
                            
                            const codeStr = item.code || "";
                            const parsePorts = (kw: string, set: Set<string>) => {
                                let pos = 0;
                                while (true) {
                                    const p = codeStr.indexOf(kw, pos);
                                    if (p === -1) break;
                                    pos = p + kw.length;
                                    if (p + kw.length < codeStr.length && (codeStr[p + kw.length] === '[' || codeStr.substring(p + kw.length, p + kw.length + 5) === ".get(")) {
                                        const is_get = codeStr.substring(p + kw.length, p + kw.length + 5) === ".get(";
                                        let sp = p + kw.length + (is_get ? 5 : 1);
                                        if (codeStr[sp] === '"' || codeStr[sp] === '\'') sp++;
                                        let key = "";
                                        while (sp < codeStr.length && !/[\]\)\,\"\']/.test(codeStr[sp])) {
                                            if (/[a-zA-Z0-9_]/.test(codeStr[sp])) key += codeStr[sp];
                                            sp++;
                                        }
                                        if (key) set.add(key);
                                    }
                                }
                            };
                            const in_set = new Set<string>();
                            const out_set = new Set<string>();
                            parsePorts("inputs", in_set);
                            parsePorts("outputs", out_set);
                            const discoveredInputs = Array.from(in_set);
                            const discoveredOutputs = Array.from(out_set);

                            const scriptChannels: Record<string, string> = {};
                            if (Array.isArray(item.inputs)) {
                                discoveredInputs.forEach((inPort, idx) => {
                                    if (item.inputs[idx]) {
                                        scriptChannels[inPort] = item.inputs[idx];
                                    }
                                });
                            }
                            if (Array.isArray(item.outputs)) {
                                discoveredOutputs.forEach((outPort, idx) => {
                                    if (item.outputs[idx]) {
                                        scriptChannels[outPort] = item.outputs[idx];
                                    }
                                });
                            }
                            comp.channels = scriptChannels;
                        } else if (cat.type === "routing" && item.type === "mux") {
                            comp.channels = { Out: item.output };
                            if (Array.isArray(item.inputs)) {
                                item.inputs.forEach((inpValue: string, idx: number) => {
                                    comp.channels[`In${idx + 1}`] = inpValue;
                                });
                            }
                        } else if (cat.type === "routing" && item.type === "demux") {
                            comp.channels = { In: item.input };
                            if (Array.isArray(item.outputs)) {
                                item.outputs.forEach((outValue: string, idx: number) => {
                                    comp.channels[`Out${idx + 1}`] = outValue;
                                });
                            }
                        }

                        controlArray.push(comp);
                    }
                }
            }
        }

        this.control_loops = controlArray.map(c => ({
            ...c,
            nodes: c.nodes || [],
            parameters: c.parameters || {},
            channels: c.channels || {}
        }));
        if (params) {
            this.sim_params.t_end = parseScientific(params.stop_time ?? "0.05");
            this.sim_params.h = parseScientific(params.step_size ?? "1e-5");
            this.sim_params.solver = params.solver ?? "euler";
            this.sim_params.step_type = params.step_type ?? "fixed";
        }
    }

    initializeNetwork() {
        this.active_nodes = []; this.node_to_idx = {}; this.L_to_idx = {}; this.V_to_idx = {};
        this.resistors = []; this.capacitors = []; this.inductors = []; this.voltage_sources = []; this.switches = []; this.voltmeters = [];
        const nodes_set = new Set<string>();
        for (const c of this.physical_stage) { for (const n of c.nodes) nodes_set.add(n); }
        for (const n of nodes_set) { if (n !== "node_0") this.active_nodes.push(n); }
        this.active_nodes.sort();
        for (let i = 0; i < this.active_nodes.length; i++) this.node_to_idx[this.active_nodes[i]] = i;
        this.num_nodes = this.active_nodes.length;

        for (const c of this.physical_stage) {
            if (c.type === "Resistor") this.resistors.push(c);
            else if (c.type === "Capacitor") this.capacitors.push(c);
            else if (c.type === "Inductor") this.inductors.push(c);
            else if (["VoltageSource", "ACVoltageSource", "Ammeter"].includes(c.type)) this.voltage_sources.push(c);
            else if (["Switch", "Diode", "MOSFET"].includes(c.type)) this.switches.push(c);
            else if (c.type === "Voltmeter") this.voltmeters.push(c);
        }
        this.num_L = this.inductors.length; this.num_V = this.voltage_sources.length;
        this.dim = this.num_nodes + this.num_L + this.num_V;
        this.M = new Matrix(this.dim, this.dim, 0.0); this.K_static = new Matrix(this.dim, this.dim, 0.0);
        this.w = new Array(this.dim).fill(0.0);

        for (let i = 0; i < this.num_L; i++) this.L_to_idx[this.inductors[i].id] = this.num_nodes + i;
        for (let i = 0; i < this.num_V; i++) this.V_to_idx[this.voltage_sources[i].id] = this.num_nodes + this.num_L + i;

        for (const r of this.resistors) {
            let r_val = parseScientific(r.parameters.value ?? "10"); if (r_val < 1e-6) r_val = 1e-6;
            const g = 1.0 / r_val; const n1 = r.nodes[0] ?? "node_0", n2 = r.nodes[1] ?? "node_0";
            const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
            if (i1 >= 0) this.K_static.add(i1, i1, g);
            if (i2 >= 0) this.K_static.add(i2, i2, g);
            if (i1 >= 0 && i2 >= 0) { this.K_static.add(i1, i2, -g); this.K_static.add(i2, i1, -g); }
        }

        for (const c of this.capacitors) {
            const c_val = parseScientific(c.parameters.C ?? "100u");
            const n1 = c.nodes[0] ?? "node_0", n2 = c.nodes[1] ?? "node_0";
            const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
            if (i1 >= 0) this.M.add(i1, i1, c_val);
            if (i2 >= 0) this.M.add(i2, i2, c_val);
            if (i1 >= 0 && i2 >= 0) { this.M.add(i1, i2, -c_val); this.M.add(i2, i1, -c_val); }
        }

        for (let i = 0; i < this.num_L; i++) {
            const ind = this.inductors[i];
            const l_val = parseScientific(ind.parameters.L ?? "10m"); const esr = parseScientific(ind.parameters.esr ?? "0.05");
            const n1 = ind.nodes[0] ?? "node_0", n2 = ind.nodes[1] ?? "node_0";
            const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
            const idx_L = this.L_to_idx[ind.id];
            if (i1 >= 0) { this.K_static.add(i1, idx_L, 1.0); this.K_static.add(idx_L, i1, -1.0); }
            if (i2 >= 0) { this.K_static.add(i2, idx_L, -1.0); this.K_static.add(idx_L, i2, 1.0); }
            this.M.add(idx_L, idx_L, l_val);
            if (esr > 0) this.K_static.add(idx_L, idx_L, esr);
        }

        for (const src of this.voltage_sources) {
            const n1 = src.nodes[0] ?? "node_0", n2 = src.nodes[1] ?? "node_0";
            const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
            const idx_V = this.V_to_idx[src.id];
            if (i1 >= 0) { this.K_static.add(i1, idx_V, 1.0); this.K_static.add(idx_V, i1, 1.0); }
            if (i2 >= 0) { this.K_static.add(i2, idx_V, -1.0); this.K_static.add(idx_V, i2, -1.0); }
        }

        this.sw_states = {}; for (const sw of this.switches) this.sw_states[sw.id] = "OFF";
        this.control_states = {}; this.custom_blocks = {};
        for (const b of this.control_loops) {
            if (b.type === "PI_Controller") this.control_states[b.id] = { integral: 0.0 };
            else if (b.type === "ContinuousPID") this.control_states[b.id] = { integral: 0.0, prev_error: 0.0, prev_deriv: 0.0 };
            else if (b.type === "PLL") this.control_states[b.id] = { valpha: 0.0, vbeta: 0.0, theta: 0.0, pll_int: 0.0, vq: 0.0 };
            else if (["PWM_Generator", "Triangle_Carrier"].includes(b.type)) this.control_states[b.id] = { time: 0.0 };
            else if (b.type === "CustomScript") {
                const bp: Record<string, number> = {};
                for (const [k, v] of Object.entries(b.parameters)) { if (k !== "code") bp[k] = parseScientific(v); }
                const inst = new CustomScriptBlock(b.parameters.code ?? "", bp);
                this.custom_blocks[b.id] = inst; this.control_states[b.id] = inst.state;
            }
        }

        this.diff_idx = []; this.alg_idx = [];
        for (let i = 0; i < this.dim; i++) {
            let hz = true; for (let j = 0; j < this.dim; j++) { if (Math.abs(this.M.get(i, j)) > 1e-15) { hz = false; break; } }
            if (hz) this.alg_idx.push(i); else this.diff_idx.push(i);
        }
        this.is_alg_all_zero = this.alg_idx.length === 0;

        for (const ind of this.inductors) this.w[this.L_to_idx[ind.id]] = parseScientific(ind.parameters.iL0 ?? "0");
        for (const cap of this.capacitors) {
            const vC0 = parseScientific(cap.parameters.vC0 ?? "0");
            if (vC0 !== 0.0) {
                const n1 = cap.nodes[0] ?? "node_0", n2 = cap.nodes[1] ?? "node_0";
                const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
                if (i2 === -1) { if (i1 >= 0) this.w[i1] = vC0; }
                else if (i1 === -1) { if (i2 >= 0) this.w[i2] = -vC0; }
                else { this.w[i1] = this.w[i2] + vC0; }
            }
        }

        this.cap_history = {};
        for (const cap of this.capacitors) {
            const n1 = cap.nodes[0] ?? "node_0", n2 = cap.nodes[1] ?? "node_0";
            const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
            const v = ((i1 >= 0) ? this.w[i1] : 0.0) - ((i2 >= 0) ? this.w[i2] : 0.0);
            this.cap_history[cap.id] = { v_prev: v, v_prev_prev: v, dt_prev: this.sim_params.h };
        }
    }

    stampSwitch(K: Matrix, sw: ComponentTS, state: string) {
        const ron = parseScientific(sw.parameters.Ron ?? "1e-3");
        const roff = parseScientific(sw.parameters.Roff ?? "1e6");
        const g = 1.0 / (state === "ON" ? ron : roff);
        const n1 = sw.nodes[0] ?? "node_0", n2 = sw.nodes[1] ?? "node_0";
        const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
        if (i1 >= 0) K.add(i1, i1, g); if (i2 >= 0) K.add(i2, i2, g);
        if (i1 >= 0 && i2 >= 0) { K.add(i1, i2, -g); K.add(i2, i1, -g); }
    }

    evaluateControls(time: number, w_curr: number[], cs: Record<string, Record<string, number>>, dt: number, ss: Record<string, string>, first = false): Record<string, number> {
        const signals: Record<string, number> = {};
        for (const b of this.control_loops) {
            const out = b.channels.Out; if (!out) continue;
            if (b.type === "Constant") signals[out] = parseScientific(b.parameters.value ?? "1");
            else if (b.type === "Triangle_Carrier") {
                const freq = parseScientific(b.parameters.frequency ?? "10k");
                const min = parseScientific(b.parameters.min ?? "0"); const max = parseScientific(b.parameters.max ?? "1");
                const pr = 1.0 / freq; const tl = time % pr;
                signals[out] = (tl < pr / 2.0) ? min + (max - min) * (tl / (pr / 2.0)) : max - (max - min) * ((tl - pr / 2.0) / (pr / 2.0));
            }
        }
        for (let iter = 0; iter < 3; iter++) {
            for (const c of this.physical_stage) {
                const out = c.channels.Out;
                if (c.type === "Voltmeter" && out) {
                    const n1 = c.nodes[0] ?? "node_0", n2 = c.nodes[1] ?? "node_0";
                    const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
                    signals[out] = ((i1 >= 0) ? w_curr[i1] : 0.0) - ((i2 >= 0) ? w_curr[i2] : 0.0);
                } else if (c.type === "Ammeter" && out) {
                    const idx = this.V_to_idx[c.id]; signals[out] = (idx !== undefined) ? w_curr[idx] : 0.0;
                } else if (c.type === "UnifiedProbe") {
                    const tid = c.parameters.target; let v = 0.0, i = 0.0;
                    if (tid) {
                        const tc = this.physical_stage.find(x => x.id === tid);
                        if (tc) {
                            const n1 = tc.nodes[0] ?? "node_0", n2 = tc.nodes[1] ?? "node_0";
                            const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
                            v = ((i1 >= 0) ? w_curr[i1] : 0.0) - ((i2 >= 0) ? w_curr[i2] : 0.0);
                            if (tc.type === "Resistor") {
                                let rv = parseScientific(tc.parameters.value ?? "10"); if (rv < 1e-6) rv = 1e-6; i = v / rv;
                            } else if (tc.type === "Inductor") {
                                const idxL = this.L_to_idx[tc.id]; i = (idxL !== undefined) ? w_curr[idxL] : 0.0;
                            } else if (tc.type === "Capacitor") {
                                const cv = parseScientific(tc.parameters.C ?? "100u");
                                if (!first && this.cap_history[tc.id]) i = cv / this.cap_history[tc.id].dt_prev * (v - this.cap_history[tc.id].v_prev);
                            } else if (["VoltageSource", "ACVoltageSource", "Ammeter"].includes(tc.type)) {
                                const idxV = this.V_to_idx[tc.id]; i = (idxV !== undefined) ? w_curr[idxV] : 0.0;
                            } else if (["Switch", "Diode", "MOSFET"].includes(tc.type)) {
                                const ron = parseScientific(tc.parameters.Ron ?? "1e-3"), roff = parseScientific(tc.parameters.Roff ?? "1e6");
                                i = v / ((ss[tc.id] ?? "OFF") === "ON" ? ron : roff);
                            } else if (tc.type === "CurrentSource") {
                                i = parseScientific(tc.parameters.value ?? "1");
                            }
                        }
                    }
                    const ov = c.channels.OutV; const oi = c.channels.OutI;
                    if (ov) signals[ov] = v; if (oi) signals[oi] = i;
                }
            }
            for (const b of this.control_loops) {
                const out = b.channels.Out; if (!out) continue;
                if (b.type === "Gain") {
                    const orig = b.parameters.original_type;
                    if (orig === "OFFSET") {
                        signals[out] = (signals[b.channels.In] ?? 0) + parseScientific(b.parameters.offset ?? "0.0");
                    } else if (orig === "SIGNUM") {
                        const val = signals[b.channels.In] ?? 0;
                        signals[out] = val > 0 ? 1.0 : (val < 0 ? -1.0 : 0.0);
                    } else if (orig === "DATATYPE_CONV") {
                        const val = signals[b.channels.In] ?? 0;
                        const dt_type = b.parameters.datatype ?? "boolean";
                        if (dt_type === "boolean") {
                            signals[out] = val > 0.5 ? 1.0 : 0.0;
                        } else if (dt_type.startsWith("int") || dt_type.startsWith("uint")) {
                            signals[out] = Math.round(val);
                        } else {
                            signals[out] = val;
                        }
                    } else if (orig === "TURN_ON_DELAY") {
                        const val = signals[b.channels.In] ?? 0.0;
                        const delayDuration = parseScientific(b.parameters.delay ?? "0.05");
                        if (!this.control_states[b.id]) {
                            this.control_states[b.id] = { high_start_time: -1.0, prev_input_high: false };
                        }
                        const isHigh = val > 0.5;
                        if (dt > 0.0 && !first) {
                            if (isHigh) {
                                if (!this.control_states[b.id].prev_input_high) {
                                    this.control_states[b.id].high_start_time = time;
                                }
                            } else {
                                this.control_states[b.id].high_start_time = -1.0;
                            }
                            this.control_states[b.id].prev_input_high = isHigh;
                        }
                        
                        let outVal = 0.0;
                        if (isHigh) {
                            if (this.control_states[b.id].high_start_time >= 0.0 && (time - this.control_states[b.id].high_start_time) >= delayDuration) {
                                outVal = 1.0;
                            }
                        }
                        signals[out] = outVal;
                    } else if (orig === "MEMORY_BLOCK") {
                        const val = signals[b.channels.In] ?? 0.0;
                        const initialVal = parseScientific(b.parameters.initial_value ?? "0.0");
                        if (!this.control_states[b.id]) {
                            this.control_states[b.id] = { prev_val: initialVal, current_val: val, last_time: time };
                        }
                        if (dt > 0.0 && !first) {
                            if (time > this.control_states[b.id].last_time) {
                                this.control_states[b.id].prev_val = this.control_states[b.id].current_val;
                                this.control_states[b.id].current_val = val;
                                this.control_states[b.id].last_time = time;
                            }
                        }
                        signals[out] = this.control_states[b.id].prev_val;
                    } else if (orig === "QUANTIZER") {
                        const val = signals[b.channels.In] ?? 0.0;
                        const step = parseScientific(b.parameters.step_size ?? "0.5");
                        const mode = b.parameters.mode ?? "round";
                        const ratio = val / (step || 1e-15);
                        let q = 0.0;
                        if (mode === "floor") q = Math.floor(ratio);
                        else if (mode === "ceil") q = Math.ceil(ratio);
                        else q = Math.round(ratio);
                        signals[out] = q * step;
                    } else if (orig === "SIGNAL_SWITCH") {
                        const in1 = signals[b.channels.In1] ?? 0.0;
                        const ctrl = signals[b.channels.Ctrl] ?? 0.0;
                        const in2 = signals[b.channels.In2] ?? 0.0;
                        const threshold = parseScientific(b.parameters.threshold ?? "0.5");
                        const criteria = b.parameters.criteria ?? "u2 >= threshold";
                        
                        let pass = false;
                        if (criteria === "u2 > threshold") {
                            pass = ctrl > threshold;
                        } else if (criteria === "u2 != 0") {
                            pass = ctrl !== 0.0;
                        } else {
                            pass = ctrl >= threshold;
                        }
                        signals[out] = pass ? in1 : in2;
                    } else if (orig === "MANUAL_SWITCH") {
                        const in1 = signals[b.channels.In1] ?? 0.0;
                        const in2 = signals[b.channels.In2] ?? 0.0;
                        const stateVal = b.parameters.state ?? "Input 1";
                        signals[out] = (stateVal === "Input 1") ? in1 : in2;
                    } else if (orig === "MULTIPORT_SWITCH") {
                        const ctrl = Math.round(signals[b.channels.Ctrl] ?? 0.0);
                        const indexing = b.parameters.indexing ?? "1-based";
                        const numInputs = parseInt(b.parameters.inputs) || 3;
                        let targetIdx = ctrl;
                        if (indexing === "0-based") {
                            targetIdx = ctrl + 1;
                        }
                        let selectedVal = 0.0;
                        if (targetIdx >= 1 && targetIdx <= numInputs) {
                            selectedVal = signals[b.channels[`In${targetIdx}`]] ?? 0.0;
                        }
                        signals[out] = selectedVal;
                    } else if (orig === "HIT_CROSSING") {
                        const val = signals[b.channels.In] ?? 0.0;
                        const offset = parseScientific(b.parameters.offset ?? "0.0");
                        const direction = b.parameters.direction ?? "either";
                        if (!this.control_states[b.id]) {
                            this.control_states[b.id] = { prev_input: val };
                        }
                        const prev = this.control_states[b.id].prev_input;
                        let hit = 0.0;
                        
                        if (direction === "rising" && prev < offset && val >= offset) {
                            hit = 1.0;
                        } else if (direction === "falling" && prev > offset && val <= offset) {
                            hit = 1.0;
                        } else if (direction === "either") {
                            if ((prev < offset && val >= offset) || (prev > offset && val <= offset)) {
                                hit = 1.0;
                            }
                        }
                        
                        if (dt > 0.0 && !first) {
                            this.control_states[b.id].prev_input = val;
                        }
                        signals[out] = hit;
                    } else if (orig === "DISCRETE_MEAN") {
                        const val = signals[b.channels.In] ?? 0.0;
                        const ts = parseScientific(b.parameters.ts ?? "100u");
                        const period = parseScientific(b.parameters.period ?? "0.02");
                        const initialVal = parseScientific(b.parameters.initial_value ?? "0.0");
                        
                        const k = Math.floor((time + 1e-11) / ts);
                        let N = Math.round(period / ts);
                        if (N < 1) N = 1;
                        
                        if (!this.control_states[b.id]) {
                            this.control_states[b.id] = {
                                history: new Array(N).fill(initialVal),
                                idx: 0,
                                last_sample_k: k,
                                held_out: initialVal
                            };
                        }
                        
                        let y_temp = this.control_states[b.id].held_out;
                        if (dt > 0.0 && !first) {
                            if (k > this.control_states[b.id].last_sample_k) {
                                this.control_states[b.id].history[this.control_states[b.id].idx] = val;
                                this.control_states[b.id].idx = (this.control_states[b.id].idx + 1) % N;
                                const sum = this.control_states[b.id].history.reduce((a: number, x: number) => a + x, 0.0);
                                y_temp = sum / N;
                                this.control_states[b.id].held_out = y_temp;
                                this.control_states[b.id].last_sample_k = k;
                            }
                        }
                        signals[out] = y_temp;
                    } else if (orig === "DISCRETE_PID") {
                        const val = signals[b.channels.In] ?? 0.0;
                        const Kp = parseScientific(b.parameters.Kp ?? "1.0");
                        const Ki = parseScientific(b.parameters.Ki ?? "10.0");
                        const Kd = parseScientific(b.parameters.Kd ?? "0.0");
                        const Tf = parseScientific(b.parameters.Tf ?? "0.001");
                        const ts = parseScientific(b.parameters.ts ?? "100u");
                        const method = b.parameters.method ?? "Forward Euler";
                        
                        const k = Math.floor((time + 1e-11) / ts);
                        
                        if (!this.control_states[b.id]) {
                            this.control_states[b.id] = {
                                held_out: 0.0,
                                prev_error: 0.0,
                                held_I: 0.0,
                                held_D: 0.0,
                                last_sample_k: k
                            };
                        }
                        
                        let y_temp = this.control_states[b.id].held_out;
                        if (dt > 0.0 && !first) {
                            if (k > this.control_states[b.id].last_sample_k) {
                                const e = val;
                                const prev_err = this.control_states[b.id].prev_error;
                                const I_prev = this.control_states[b.id].held_I;
                                const D_prev = this.control_states[b.id].held_D;
                                
                                const P = Kp * e;
                                let I_new = I_prev;
                                if (method === "Forward Euler") {
                                    I_new = I_prev + Ki * ts * prev_err;
                                } else if (method === "Backward Euler") {
                                    I_new = I_prev + Ki * ts * e;
                                } else if (method === "Trapezoidal") {
                                    I_new = I_prev + 0.5 * Ki * ts * (e + prev_err);
                                }
                                
                                const D_new = (Tf / (Tf + ts)) * D_prev + (Kd / (Tf + ts)) * (e - prev_err);
                                y_temp = P + I_new + D_new;
                                
                                this.control_states[b.id].prev_error = val;
                                this.control_states[b.id].held_I = I_new;
                                this.control_states[b.id].held_D = D_new;
                                this.control_states[b.id].held_out = y_temp;
                                this.control_states[b.id].last_sample_k = k;
                            }
                        }
                        signals[out] = y_temp;
                    } else {
                        signals[out] = parseScientific(b.parameters.K ?? "1") * (signals[b.channels.In] ?? 0);
                    }
                } else if (b.type === "SummingJunction") {
                    const ctrlSig = b.channels.Ctrl;
                    if (ctrlSig && (signals[ctrlSig] ?? 0.0) <= 0.5) {
                        signals[out] = 0.0;
                    } else {
                        const signs = b.parameters.signs || "++";
                        let sum = 0.0;
                        if (b.channels.In1 !== undefined) {
                            let i = 1;
                            while (true) {
                                const ch = b.channels[`In${i}`];
                                if (!ch) break;
                                const signChar = signs[i - 1] ?? '+';
                                const s = signChar === '-' ? -1.0 : 1.0;
                                sum += s * (signals[ch] ?? 0.0);
                                i++;
                            }
                        } else if (b.channels.A || b.channels.B) {
                            const s1 = signs[0] === '-' ? -1 : 1;
                            const s2 = signs[1] === '-' ? -1 : 1;
                            sum = s1 * (signals[b.channels.A] ?? 0) + s2 * (signals[b.channels.B] ?? 0);
                        }
                        signals[out] = sum;
                    }
                } else if (b.type === "PI_Controller") {
                    const error = signals[b.channels.In] ?? 0.0;
                    if (!cs[b.id]) cs[b.id] = { integral: 0.0 };
                    if (dt > 0.0 && !first) {
                        cs[b.id].integral += error * dt;
                    }
                    signals[out] = parseScientific(b.parameters.Kp ?? "2.5") * error + parseScientific(b.parameters.Ki ?? "50") * cs[b.id].integral;
                } else if (b.type === "ContinuousPID") {
                    const error = signals[b.channels.In] ?? 0.0;
                    if (!cs[b.id]) {
                        cs[b.id] = { integral: 0.0, prev_error: error, prev_deriv: 0.0 };
                    }
                    const Kp = parseScientific(b.parameters.Kp ?? "1.0");
                    const Ki = parseScientific(b.parameters.Ki ?? "0.0");
                    const Kd = parseScientific(b.parameters.Kd ?? "0.0");
                    const Tf = parseScientific(b.parameters.Tf ?? "0.01");
                    
                    if (dt > 0.0 && !first) {
                        cs[b.id].integral += error * dt;
                        let deriv = 0.0;
                        if (Kd > 0.0) {
                            deriv = (Tf / (dt + Tf)) * cs[b.id].prev_deriv + (Kd / (dt + Tf)) * (error - cs[b.id].prev_error);
                        }
                        cs[b.id].prev_deriv = deriv;
                        cs[b.id].prev_error = error;
                    }
                    signals[out] = Kp * error + Ki * cs[b.id].integral + cs[b.id].prev_deriv;
                } else if (b.type === "PLL") {
                    const fn = parseScientific(b.parameters.fn ?? "50.0");
                    const w_nom = 2.0 * Math.PI * fn;
                    const Kp = parseScientific(b.parameters.Kp ?? "20.0");
                    const Ki = parseScientific(b.parameters.Ki ?? "1000.0");
                    
                    if (!cs[b.id]) {
                        cs[b.id] = { valpha: 0.0, vbeta: 0.0, theta: 0.0, pll_int: 0.0, vq: 0.0 };
                    }
                    
                    let valpha = cs[b.id].valpha;
                    let vbeta = cs[b.id].vbeta;
                    let theta = cs[b.id].theta;
                    let pll_int = cs[b.id].pll_int;
                    
                    const omega_est = w_nom + Kp * cs[b.id].vq + Ki * pll_int;
                    
                    if (dt > 0.0 && !first) {
                        if (b.channels.In !== undefined) {
                            const input = signals[b.channels.In] ?? 0.0;
                            const k_sogi = 1.414;
                            const err = input - valpha;
                            const d_valpha = k_sogi * omega_est * err - omega_est * vbeta;
                            const d_vbeta = omega_est * valpha;
                            valpha += d_valpha * dt;
                            vbeta += d_vbeta * dt;
                        } else {
                            const va = signals[b.channels.Va] ?? 0.0;
                            const vb = signals[b.channels.Vb] ?? 0.0;
                            const vc = signals[b.channels.Vc] ?? 0.0;
                            valpha = (2.0 / 3.0) * (va - 0.5 * vb - 0.5 * vc);
                            vbeta = (2.0 / 3.0) * ((Math.sqrt(3.0) / 2.0) * vb - (Math.sqrt(3.0) / 2.0) * vc);
                        }
                        
                        const vq = valpha * Math.cos(theta) + vbeta * Math.sin(theta);
                        cs[b.id].vq = vq;
                        pll_int += vq * dt;
                        theta += omega_est * dt;
                        if (theta > 2.0 * Math.PI) theta -= 2.0 * Math.PI;
                        if (theta < 0.0) theta += 2.0 * Math.PI;
                        
                        cs[b.id].valpha = valpha;
                        cs[b.id].vbeta = vbeta;
                        cs[b.id].theta = theta;
                        cs[b.id].pll_int = pll_int;
                    }
                    
                    if (b.channels.Theta) signals[b.channels.Theta] = theta;
                    if (b.channels.Freq) signals[b.channels.Freq] = omega_est / (2.0 * Math.PI);
                    if (b.channels.Cos) signals[b.channels.Cos] = Math.cos(theta);
                    if (b.channels.Sin) signals[b.channels.Sin] = Math.sin(theta);
                } else if (b.type === "Comparator") {
                    signals[out] = ((signals[b.channels.Plus] ?? 0) >= (signals[b.channels.Minus] ?? 0)) ? 1 : 0;
                } else if (b.type === "AND_Gate") {
                    signals[out] = ((signals[b.channels.A] ?? 0) > 0.5 && (signals[b.channels.B] ?? 0) > 0.5) ? 1 : 0;
                } else if (b.type === "OR_Gate") {
                    signals[out] = ((signals[b.channels.A] ?? 0) > 0.5 || (signals[b.channels.B] ?? 0) > 0.5) ? 1 : 0;
                } else if (b.type === "NOT_Gate") {
                    signals[out] = ((signals[b.channels.In] ?? 0) < 0.5) ? 1 : 0;
                } else if (b.type === "Product") {
                    const ctrlSig = b.channels.Ctrl;
                    if (ctrlSig && (signals[ctrlSig] ?? 0.0) <= 0.5) {
                        signals[out] = 0.0;
                    } else {
                        const orig = b.parameters.original_type;
                        if (orig === "DIVIDE") {
                            signals[out] = (signals[b.channels.In1] ?? 0) / ((signals[b.channels.In2] ?? 0) || 1e-15);
                        } else {
                            const ops = b.parameters.operators ?? "**";
                            let prod = 1.0;
                            let i = 1;
                            while (true) {
                                const ch = b.channels[`In${i}`];
                                if (!ch) break;
                                const val = signals[ch] ?? 0.0;
                                const opChar = ops[i - 1] ?? '*';
                                if (opChar === '/') {
                                    prod /= (val || 1e-15);
                                } else {
                                    prod *= val;
                                }
                                i++;
                            }
                            signals[out] = prod;
                        }
                    }
                } else if (b.type === "CustomFunction") {
                    signals[out] = new ExpressionEvaluator().evaluate(b.parameters.expr ?? "u * 2", { u: signals[b.channels.In] ?? 0 });
                } else if (b.type === "Mux") {
                    signals[out] = signals[b.channels.In1] ?? 0;
                } else if (b.type === "Demux") {
                    const iv = signals[b.channels.In] ?? 0;
                    if (b.channels.Out1) signals[b.channels.Out1] = iv;
                    if (b.channels.Out2) signals[b.channels.Out2] = 0.0;
                } else if (b.type === "CustomScript") {
                    const inst = this.custom_blocks[b.id];
                    if (inst) {
                        const ind: Record<string, number> = {};
                        for (const p of inst.inputs) ind[p] = signals[b.channels[p]] ?? 0.0;
                        inst.state = cs[b.id] ?? {};
                        const od = inst.step(time, ind); cs[b.id] = inst.state;
                        for (const [k, val] of Object.entries(od)) { const ch = b.channels[k]; if (ch) signals[ch] = val; }
                    }
                }
            }
        }
        return signals;
    }

    compute_k(t_stage: number, w_stage: number[], cs: Record<string, Record<string, number>>, dt: number, ss: Record<string, string>): number[] {
        const wl = [...w_stage]; const K = new Matrix(this.dim, this.dim); K.data = [...this.K_static.data];
        for (const sw of this.switches) this.stampSwitch(K, sw, ss[sw.id] ?? "OFF");
        const b = new Array(this.dim).fill(0.0);
        for (const src of this.voltage_sources) {
            const idx = this.V_to_idx[src.id];
            if (src.type === "VoltageSource") b[idx] = parseScientific(src.parameters.value ?? "24");
            else if (src.type === "ACVoltageSource") {
                const amp = parseScientific(src.parameters.amplitude ?? "12"), freq = parseScientific(src.parameters.frequency ?? "50");
                b[idx] = amp * Math.sin(2.0 * Math.PI * freq * t_stage);
            }
        }
        for (const c of this.physical_stage) {
            if (c.type === "CurrentSource") {
                const n1 = c.nodes[0] ?? "node_0", n2 = c.nodes[1] ?? "node_0";
                const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
                const iv = parseScientific(c.parameters.value ?? "1");
                if (i1 >= 0) b[i1] -= iv; if (i2 >= 0) b[i2] += iv;
            }
        }
        if (this.alg_idx.length > 0 && this.diff_idx.length > 0) {
            try {
                const K_aa = K.submatrix(this.alg_idx, this.alg_idx), K_ad = K.submatrix(this.alg_idx, this.diff_idx);
                const ba = this.alg_idx.map(i => b[i]), wd = this.diff_idx.map(i => wl[i]);
                const kad_wd = K_ad.multiply(wd);
                const sol = K_aa.solve(ba.map((v, idx) => v - kad_wd[idx]));
                for (let i = 0; i < this.alg_idx.length; i++) wl[this.alg_idx[i]] = sol[i];
            } catch (_) {}
        } else if (this.alg_idx.length > 0 && this.diff_idx.length === 0) {
            try { const sol = K.solve(b); for (let i = 0; i < sol.length; i++) wl[i] = sol[i]; } catch (_) {}
        }

        for (let iter = 0; iter < 3; iter++) {
            const sc = JSON.parse(JSON.stringify(cs)); const sigs = this.evaluateControls(t_stage, wl, sc, dt, ss);
            let any_ch = false;
            for (const sw of this.switches) {
                const n1 = sw.nodes[0] ?? "node_0", n2 = sw.nodes[1] ?? "node_0";
                const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
                const vd = ((i1 >= 0) ? wl[i1] : 0.0) - ((i2 >= 0) ? wl[i2] : 0.0);
                const old = ss[sw.id] ?? "OFF"; let swn = "OFF";
                if (sw.type === "MOSFET") swn = (sigs[sw.channels.G] ?? 0) > 0.5 ? "ON" : "OFF";
                else if (sw.type === "Diode") swn = vd > (old === "ON" ? 0.0 : 0.7) ? "ON" : "OFF";
                else if (sw.type === "Switch") swn = parseScientific(sw.parameters.state ?? "0") > 0.5 ? "ON" : "OFF";
                if (swn !== old) { ss[sw.id] = swn; any_ch = true; }
            }
            if (any_ch) {
                const K_new = new Matrix(this.dim, this.dim); K_new.data = [...this.K_static.data];
                for (const sw of this.switches) this.stampSwitch(K_new, sw, ss[sw.id] ?? "OFF");
                if (this.alg_idx.length > 0 && this.diff_idx.length > 0) {
                    try {
                        const K_aa = K_new.submatrix(this.alg_idx, this.alg_idx), K_ad = K_new.submatrix(this.alg_idx, this.diff_idx);
                        const ba = this.alg_idx.map(i => b[i]), wd = this.diff_idx.map(i => wl[i]);
                        const sol = K_aa.solve(ba.map((v, idx) => v - K_ad.multiply(wd)[idx]));
                        for (let i = 0; i < this.alg_idx.length; i++) wl[this.alg_idx[i]] = sol[i];
                    } catch (_) {}
                }
            } else break;
        }

        const fK = new Matrix(this.dim, this.dim); fK.data = [...this.K_static.data];
        for (const sw of this.switches) this.stampSwitch(fK, sw, ss[sw.id] ?? "OFF");
        const rhs = b.map((v, idx) => v - fK.multiply(wl)[idx]); const dw = new Array(this.dim).fill(0.0);
        if (this.diff_idx.length > 0) {
            try {
                const sol = this.M.submatrix(this.diff_idx, this.diff_idx).solve(this.diff_idx.map(i => rhs[i]));
                for (let i = 0; i < this.diff_idx.length; i++) dw[this.diff_idx[i]] = sol[i];
            } catch (_) {}
        }
        return dw;
    }

    takeStep(time: number, w_curr: number[], dt: number, solver: string, cs: Record<string, Record<string, number>>, ss: Record<string, string>) {
        const out_trans: any[] = []; let wn = [...w_curr]; let ctrl_n = JSON.parse(JSON.stringify(cs)); let sw_n = { ...ss };
        if (solver === "euler") {
            let s_stage = { ...ss }; let s_ch = true; let loop = 0;
            while (s_ch && loop < 10) {
                s_ch = false; loop++;
                const K = new Matrix(this.dim, this.dim); K.data = [...this.K_static.data];
                for (const sw of this.switches) this.stampSwitch(K, sw, s_stage[sw.id]);
                const b = new Array(this.dim).fill(0.0);
                for (const src of this.voltage_sources) {
                    const idx = this.V_to_idx[src.id];
                    if (src.type === "VoltageSource") b[idx] = parseScientific(src.parameters.value ?? "24");
                    else if (src.type === "ACVoltageSource") {
                        const amp = parseScientific(src.parameters.amplitude ?? "12"), freq = parseScientific(src.parameters.frequency ?? "50");
                        b[idx] = amp * Math.sin(2.0 * Math.PI * freq * (time + dt));
                    }
                }
                for (const c of this.physical_stage) {
                    if (c.type === "CurrentSource") {
                        const n1 = c.nodes[0] ?? "node_0", n2 = c.nodes[1] ?? "node_0";
                        const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
                        const iv = parseScientific(c.parameters.value ?? "1");
                        if (i1 >= 0) b[i1] -= iv; if (i2 >= 0) b[i2] += iv;
                    }
                }
                const Anum = new Matrix(this.dim, this.dim);
                for (let r = 0; r < this.dim; r++) {
                    for (let c = 0; c < this.dim; c++) Anum.set(r, c, this.M.get(r, c) / dt + K.get(r, c));
                }
                const M_w = new Array(this.dim).fill(0.0);
                for (let r = 0; r < this.dim; r++) {
                    let s = 0.0; for (let c = 0; c < this.dim; c++) s += (this.M.get(r, c) / dt) * w_curr[c];
                    M_w[r] = s;
                }
                try { wn = Anum.solve(M_w.map((v, i) => v + b[i])); } catch (_) {}
                const t_cs = JSON.parse(JSON.stringify(cs)); const sigs = this.evaluateControls(time + dt, wn, t_cs, dt, s_stage);
                let any_ch = false; const next_sw: Record<string, string> = {};
                for (const sw of this.switches) {
                    const n1 = sw.nodes[0] ?? "node_0", n2 = sw.nodes[1] ?? "node_0";
                    const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
                    const vd = ((i1 >= 0) ? wn[i1] : 0.0) - ((i2 >= 0) ? wn[i2] : 0.0);
                    const old = s_stage[sw.id] ?? "OFF"; let swn = "OFF";
                    if (sw.type === "MOSFET") swn = (sigs[sw.channels.G] ?? 0) > 0.5 ? "ON" : "OFF";
                    else if (sw.type === "Diode") swn = vd > (old === "ON" ? 0.0 : 0.7) ? "ON" : "OFF";
                    else if (sw.type === "Switch") swn = parseScientific(sw.parameters.state ?? "0") > 0.5 ? "ON" : "OFF";
                    next_sw[sw.id] = swn; if (swn !== old) any_ch = true;
                }
                if (any_ch) {
                    // Re-evaluate with new switch states instead of creating vertical discontinuity
                    s_stage = next_sw; s_ch = true;
                }
            }
            sw_n = s_stage; ctrl_n = JSON.parse(JSON.stringify(cs));
            for (const b of this.control_loops) {
                if (b.type === "CustomScript" && this.custom_blocks[b.id]) {
                    const inst = this.custom_blocks[b.id]; inst.state = ctrl_n[b.id];
                    inst.step(time + dt, {}); ctrl_n[b.id] = inst.state;
                }
            }
        } else if (solver === "rk45") {
            const k1 = this.compute_k(time, w_curr, ctrl_n, dt, sw_n);
            const k2 = this.compute_k(time + 0.2 * dt, w_curr.map((v, idx) => v + (dt * 0.2) * k1[idx]), ctrl_n, dt, sw_n);
            const k3 = this.compute_k(time + 0.3 * dt, w_curr.map((v, idx) => v + dt * (3.0/40.0 * k1[idx] + 9.0/40.0 * k2[idx])), ctrl_n, dt, sw_n);
            const k4 = this.compute_k(time + 0.8 * dt, w_curr.map((v, idx) => v + dt * (44.0/45.0 * k1[idx] - 56.0/15.0 * k2[idx] + 32.0/9.0 * k3[idx])), ctrl_n, dt, sw_n);
            const k5 = this.compute_k(time + 8.0/9.0 * dt, w_curr.map((v, idx) => v + dt * (19372.0/6561.0 * k1[idx] - 25360.0/2187.0 * k2[idx] + 64448.0/6561.0 * k3[idx] - 212.0/729.0 * k4[idx])), ctrl_n, dt, sw_n);
            const k6 = this.compute_k(time + dt, w_curr.map((v, idx) => v + dt * (9017.0/3168.0 * k1[idx] - 355.0/33.0 * k2[idx] + 46732.0/5247.0 * k3[idx] + 49.0/176.0 * k4[idx] - 5103.0/18656.0 * k5[idx])), ctrl_n, dt, sw_n);
            wn = w_curr.map((v, idx) => v + dt * (35.0/384.0 * k1[idx] + 500.0/1113.0 * k3[idx] + 125.0/192.0 * k4[idx] - 2187.0/6784.0 * k5[idx] + 11.0/84.0 * k6[idx]));
            let w_con = [...wn]; let s_stage = { ...sw_n };
            for (let iter = 0; iter < 3; iter++) {
                const t_cs = JSON.parse(JSON.stringify(cs)); const sigs = this.evaluateControls(time + dt, w_con, t_cs, dt, s_stage);
                let any_ch = false; const next_sw = { ...s_stage };
                for (const sw of this.switches) {
                    const n1 = sw.nodes[0] ?? "node_0", n2 = sw.nodes[1] ?? "node_0";
                    const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
                    const vd = ((i1 >= 0) ? w_con[i1] : 0.0) - ((i2 >= 0) ? w_con[i2] : 0.0);
                    const old = s_stage[sw.id] ?? "OFF"; let swn = "OFF";
                    if (sw.type === "MOSFET") swn = (sigs[sw.channels.G] ?? 0) > 0.5 ? "ON" : "OFF";
                    else if (sw.type === "Diode") swn = vd > (old === "ON" ? 0.0 : 0.7) ? "ON" : "OFF";
                    else if (sw.type === "Switch") swn = parseScientific(sw.parameters.state ?? "0") > 0.5 ? "ON" : "OFF";
                    next_sw[sw.id] = swn; if (swn !== old) any_ch = true;
                }
                if (any_ch) {
                    // Re-iterate with new switch state to find continuous convergence
                    s_stage = next_sw;
                    const K = new Matrix(this.dim, this.dim); K.data = [...this.K_static.data];
                    for (const sw of this.switches) this.stampSwitch(K, sw, s_stage[sw.id]);
                    const b = new Array(this.dim).fill(0.0);
                    for (const src of this.voltage_sources) { const idx = this.V_to_idx[src.id]; b[idx] = (src.type === "VoltageSource") ? parseScientific(src.parameters.value ?? "24") : 0.0; }
                    if (this.alg_idx.length > 0 && this.diff_idx.length > 0) {
                        try {
                            const K_aa = K.submatrix(this.alg_idx, this.alg_idx), K_ad = K.submatrix(this.alg_idx, this.diff_idx);
                            const sol = K_aa.solve(this.alg_idx.map(i => b[i]).map((v, idx) => v - K_ad.multiply(this.diff_idx.map(i => w_con[i]))[idx]));
                            for (let i = 0; i < this.alg_idx.length; i++) w_con[this.alg_idx[i]] = sol[i];
                        } catch (_) {}
                    }
                } else break;
            }
            wn = w_con; sw_n = s_stage;
        } else if (solver === "radau") {
            const sqrt6 = Math.sqrt(6.0);
            const c_radau = [ (4.0 - sqrt6) / 10.0, (4.0 + sqrt6) / 10.0, 1.0 ];
            const a_radau = [
                [ (88.0 - 7.0*sqrt6)/360.0, (296.0 - 169.0*sqrt6)/1800.0, (-2.0 + 3.0*sqrt6)/225.0 ],
                [ (296.0 + 169.0*sqrt6)/1800.0, (88.0 + 7.0*sqrt6)/360.0, (-2.0 - 3.0*sqrt6)/225.0 ],
                [ (16.0 - sqrt6)/360.0, (16.0 + sqrt6)/360.0, 1.0/9.0 ]
            ];
            let s_stage = { ...ss }; let s_ch = true, o_loop = 0;
            const W = [ [...wn], [...wn], [...wn] ];
            while (s_ch && o_loop < 10) {
                s_ch = false; o_loop++;
                const Klist: Matrix[] = [], blist: number[][] = [];
                for (let j = 0; j < 3; j++) {
                    const Tj = time + c_radau[j] * dt, t_cs = JSON.parse(JSON.stringify(cs));
                    this.evaluateControls(Tj, W[j], t_cs, dt, s_stage);
                    const Kj = new Matrix(this.dim, this.dim); Kj.data = [...this.K_static.data];
                    for (const sw of this.switches) this.stampSwitch(Kj, sw, s_stage[sw.id]);
                    const bj = new Array(this.dim).fill(0.0);
                    for (const src of this.voltage_sources) {
                        const idx = this.V_to_idx[src.id];
                        if (src.type === "VoltageSource") bj[idx] = parseScientific(src.parameters.value ?? "24");
                        else if (src.type === "ACVoltageSource") bj[idx] = parseScientific(src.parameters.amplitude ?? "12") * Math.sin(2.0 * Math.PI * parseScientific(src.parameters.frequency ?? "50") * Tj);
                    }
                    for (const c of this.physical_stage) {
                        if (c.type === "CurrentSource") {
                            const n1 = c.nodes[0] ?? "node_0", n2 = c.nodes[1] ?? "node_0";
                            const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
                            const iv = parseScientific(c.parameters.value ?? "1");
                            if (i1 >= 0) bj[i1] -= iv; if (i2 >= 0) bj[i2] += iv;
                        }
                    }
                    Klist.push(Kj); blist.push(bj);
                }
                const A_block = new Matrix(3 * this.dim, 3 * this.dim, 0.0); const b_block = new Array(3 * this.dim).fill(0.0);
                for (let i = 0; i < 3; i++) {
                    for (let r = 0; r < this.dim; r++) { for (let c = 0; c < this.dim; c++) A_block.set(i * this.dim + r, i * this.dim + c, this.M.get(r, c)); }
                    for (let j = 0; j < 3; j++) {
                        for (let r = 0; r < this.dim; r++) { for (let c = 0; c < this.dim; c++) A_block.set(i*this.dim + r, j*this.dim + c, A_block.get(i*this.dim + r, j*this.dim + c) + dt*a_radau[i][j]*Klist[j].get(r, c)); }
                    }
                    const Mw = this.M.multiply(wn); const b_sum = new Array(this.dim).fill(0.0);
                    for (let j = 0; j < 3; j++) { for (let r = 0; r < this.dim; r++) b_sum[r] += a_radau[i][j] * blist[j][r]; }
                    const b_b_i = Mw.map((v, idx) => v + dt * b_sum[idx]);
                    for (let r = 0; r < this.dim; r++) b_block[i * this.dim + r] = b_b_i[r];
                }
                try {
                    const Wall = A_block.solve(b_block);
                    for (let i = 0; i < 3; i++) { for (let r = 0; r < this.dim; r++) W[i][r] = Wall[i * this.dim + r]; }
                    wn = W[2];
                } catch (_) { break; }
                const t_cs = JSON.parse(JSON.stringify(cs)); const sigs = this.evaluateControls(time + dt, wn, t_cs, dt, s_stage);
                let any_ch = false; const next_sw = { ...s_stage };
                for (const sw of this.switches) {
                    const n1 = sw.nodes[0] ?? "node_0", n2 = sw.nodes[1] ?? "node_0";
                    const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
                    const vd = ((i1 >= 0) ? wn[i1] : 0.0) - ((i2 >= 0) ? wn[i2] : 0.0);
                    const old = s_stage[sw.id] ?? "OFF"; let swn = "OFF";
                    if (sw.type === "MOSFET") swn = (sigs[sw.channels.G] ?? 0) > 0.5 ? "ON" : "OFF";
                    else if (sw.type === "Diode") swn = vd > (old === "ON" ? 0.0 : 0.7) ? "ON" : "OFF";
                    else if (sw.type === "Switch") swn = parseScientific(sw.parameters.state ?? "0") > 0.5 ? "ON" : "OFF";
                    next_sw[sw.id] = swn; if (swn !== old) any_ch = true;
                }
                if (any_ch) {
                    // Re-iterate with new switch state to find continuous convergence
                    s_stage = next_sw; s_ch = true;
                }
            }
            sw_n = s_stage;
        }
        return { w_new: wn, ctrl_new: ctrl_n, sw_new: sw_n, out_trans };
    }

    logAcceptedState(time: number, w_val: number[], sigs: Record<string, number>, ss: Record<string, string>, dt: number) {
        this.time_log.push(time);
        for (const node of this.active_nodes) {
            const idx = this.node_to_idx[node]; if (!this.voltages_log[node]) this.voltages_log[node] = [];
            this.voltages_log[node].push(w_val[idx]);
        }
        for (const ind of this.inductors) {
            const idx = this.L_to_idx[ind.id]; if (!this.inductors_log[ind.id]) this.inductors_log[ind.id] = [];
            this.inductors_log[ind.id].push(w_val[idx]);
        }
        for (const comp of this.voltage_sources) {
            if (comp.type === "Ammeter") {
                const idx = this.V_to_idx[comp.id]; if (!this.ammeters_log[comp.id]) this.ammeters_log[comp.id] = [];
                this.ammeters_log[comp.id].push(w_val[idx]);
            }
        }
        for (const vm of this.voltmeters) {
            const n1 = vm.nodes[0] ?? "node_0", n2 = vm.nodes[1] ?? "node_0";
            const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
            if (!this.voltmeters_log[vm.id]) this.voltmeters_log[vm.id] = [];
            this.voltmeters_log[vm.id].push(((i1 >= 0) ? w_val[i1] : 0.0) - ((i2 >= 0) ? w_val[i2] : 0.0));
        }
        for (const [k, v] of Object.entries(sigs)) { if (!this.signals_log[k]) this.signals_log[k] = []; this.signals_log[k].push(v); }

        for (const comp of this.physical_stage) {
            const n1 = comp.nodes[0] ?? "node_0", n2 = comp.nodes[1] ?? "node_0";
            const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
            const v = ((i1 >= 0) ? w_val[i1] : 0.0) - ((i2 >= 0) ? w_val[i2] : 0.0);
            
            // Log differential voltage with the V_<id> format
            const kv = "V_" + comp.id; 
            if (!this.custom_plots_log[kv]) this.custom_plots_log[kv] = []; 
            this.custom_plots_log[kv].push(v);
            
            let curr = 0.0;
            if (comp.type === "Resistor" || comp.type === "R") { 
                let val = parseScientific(comp.parameters.value ?? "10"); 
                if (val < 1e-6) val = 1e-6; 
                curr = v / val; 
            }
            else if (comp.type === "Inductor" || comp.type === "L") { 
                const idx = this.L_to_idx[comp.id]; 
                curr = (idx !== undefined) ? w_val[idx] : 0.0; 
            }
            else if (comp.type === "Capacitor" || comp.type === "C") {
                const cv = parseScientific(comp.parameters.C ?? "100u");
                if (this.cap_history[comp.id]) {
                    curr = cv / dt * (v - this.cap_history[comp.id].v_prev);
                }
            } 
            else if (["VoltageSource", "ACVoltageSource", "Ammeter", "V", "AC_V", "AM"].includes(comp.type)) { 
                const idx = this.V_to_idx[comp.id]; 
                curr = (idx !== undefined) ? w_val[idx] : 0.0; 
            }
            else if (["Switch", "Diode", "MOSFET", "S", "D"].includes(comp.type)) {
                const ron = parseScientific(comp.parameters.Ron ?? "1e-3"), roff = parseScientific(comp.parameters.Roff ?? "1e6");
                curr = v / ((ss[comp.id] ?? "OFF") === "ON" ? ron : roff);
            } 
            else if (comp.type === "CurrentSource" || comp.type === "I") { 
                curr = parseScientific(comp.parameters.value ?? "1"); 
            }
            
            // Log current through component with the I_<id> format
            const ki = "I_" + comp.id; 
            if (!this.custom_plots_log[ki]) this.custom_plots_log[ki] = []; 
            this.custom_plots_log[ki].push(curr);
        }

        // Update capacitor history
        for (const c of this.capacitors) {
            const n1 = c.nodes[0] ?? "node_0", n2 = c.nodes[1] ?? "node_0";
            const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
            const v = ((i1 >= 0) ? w_val[i1] : 0.0) - ((i2 >= 0) ? w_val[i2] : 0.0);
            if (this.cap_history[c.id]) {
                this.cap_history[c.id].v_prev_prev = this.cap_history[c.id].v_prev;
                this.cap_history[c.id].v_prev = v;
                this.cap_history[c.id].dt_prev = dt;
            }
        }
    }

    run() {
        this.initializeNetwork();
        this.time_log = []; this.voltages_log = {}; this.inductors_log = {}; this.voltmeters_log = {}; this.ammeters_log = {}; this.signals_log = {}; this.custom_plots_log = {};
        let t = 0.0; let h = this.sim_params.h; const t_end = this.sim_params.t_end;
        const init_sigs = this.evaluateControls(0.0, this.w, this.control_states, h, this.sw_states, true);
        this.logAcceptedState(0.0, this.w, init_sigs, this.sw_states, h);
        const atol = 1e-4, rtol = 1e-3;
        const h_min = Math.max(this.sim_params.h * 1e-4, 1e-12), h_max = this.sim_params.h * 10.0;
        let rejects = 0;
        while (t < t_end) {
            if (t + h > t_end) h = t_end - t;
            try {
                const step = this.takeStep(t, this.w, h, this.sim_params.solver, this.control_states, this.sw_states);
                if (this.sim_params.step_type === "variable") {
                    const h_half = h / 2.0;
                    const half1 = this.takeStep(t, this.w, h_half, this.sim_params.solver, this.control_states, this.sw_states);
                    const half2 = this.takeStep(t + h_half, half1.w_new, h_half, this.sim_params.solver, half1.ctrl_new, half1.sw_new);
                    let err = 0.0;
                    if (this.diff_idx.length > 0) {
                        let me = 0.0;
                        for (const idx of this.diff_idx) {
                            const scale = atol + rtol * Math.max(Math.abs(step.w_new[idx]), Math.abs(half2.w_new[idx]));
                            const e = Math.abs(step.w_new[idx] - half2.w_new[idx]) / scale;
                            if (e > me) me = e;
                        }
                        err = me;
                    }
                    if (err <= 1.0 || h < h_min) {
                        this.w = half2.w_new; const t_new = t + h;
                        for (const ev of half1.out_trans) this.logAcceptedState(ev.time, ev.w, ev.signals, ev.sw_states, ev.dt);
                        const sig_half1 = this.evaluateControls(t + h_half, half1.w_new, this.control_states, h_half, half1.sw_new);
                        this.logAcceptedState(t + h_half, half1.w_new, sig_half1, half1.sw_new, h_half);
                        for (const ev of half2.out_trans) this.logAcceptedState(ev.time, ev.w, ev.signals, ev.sw_states, ev.dt);

                        this.control_states = half2.ctrl_new; this.sw_states = half2.sw_new;
                        for (const k of Object.keys(this.custom_blocks)) { if (half2.ctrl_new[k]) this.custom_blocks[k].state = half2.ctrl_new[k]; }
                        const final_sigs = this.evaluateControls(t_new, this.w, this.control_states, h_half, this.sw_states);
                        this.logAcceptedState(t_new, this.w, final_sigs, this.sw_states, h_half);
                        t = t_new; rejects = 0;
                        const p = (this.sim_params.solver === "euler" ? 1.0 : (this.sim_params.solver === "rk45" ? 4.0 : 5.0));
                        let hn = err > 0 ? 0.9 * h * Math.pow(err, -1.0 / (p + 1.0)) : 5.0 * h;
                        h = Math.max(0.1 * h, Math.min(5.0 * h, hn)); h = Math.min(h_max, Math.max(h_min, h));
                    } else {
                        rejects++; if (rejects >= 50) { this.w = half2.w_new; t += h; rejects = 0; h = h_min; } else h = Math.max(h_min, h * 0.5);
                    }
                } else {
                    this.w = step.w_new; const t_new = t + h;
                    for (const ev of step.out_trans) this.logAcceptedState(ev.time, ev.w, ev.signals, ev.sw_states, ev.dt);
                    this.control_states = step.ctrl_new; this.sw_states = step.sw_new;
                    for (const k of Object.keys(this.custom_blocks)) { if (step.ctrl_new[k]) this.custom_blocks[k].state = step.ctrl_new[k]; }
                    const final_sigs = this.evaluateControls(t_new, this.w, this.control_states, h, this.sw_states);
                    this.logAcceptedState(t_new, this.w, final_sigs, this.sw_states, h);
                    t = t_new;
                }
            } catch (_) { if (this.sim_params.step_type === "variable") { h *= 0.5; if (h < 1e-15) break; } else break; }
        }
        return {
            time: this.time_log, voltages: this.voltages_log, inductors: this.inductors_log,
            voltmeters: this.voltmeters_log, ammeters: this.ammeters_log, signals: this.signals_log,
            custom_plots: this.custom_plots_log
        };
    }
}
