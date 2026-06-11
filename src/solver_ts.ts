export function parseScientific(str: any): number {
    if (typeof str === 'number') return str;
    if (str === undefined || str === null || str === '') return 0.0;
    let s = String(str).trim();
    if (!s) return 0.0;
    
    // Support simple division (e.g. "1/10000" or "1/10k")
    if (s.includes('/')) {
        const parts = s.split('/');
        if (parts.length === 2) {
            const num = parseScientific(parts[0]);
            const den = parseScientific(parts[1]);
            return den !== 0.0 ? num / den : 0.0;
        }
    }
    
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
        while (this.peek() === '*' || this.peek() === '/' || this.peek() === '%') {
            const op = this.get();
            const r = this.parsePower();
            if (op === '*') val = val * r;
            else if (op === '/') val = (Math.abs(r) > 1e-30) ? val / r : 0.0;
            else if (op === '%') val = (Math.abs(r) > 1e-30) ? val % r : 0.0;
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

interface Statement { lhs_type: "state" | "outputs" | "local"; lhs_key: string; op: string; rhs_expr: string; }

export class CustomScriptBlock {
    code_str: string; params: Record<string, number>;
    state: Record<string, number> = {}; inputs: string[] = []; outputs: string[] = [];
    init_statements: Statement[] = []; step_statements: Statement[] = [];
    last_vars: Record<string, number> = {};

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
        this.inputs = Array.from(in_set).sort(); this.outputs = Array.from(out_set).sort();
    }
    normalize_expression(raw: string): string {
        let clean = raw.replace(/\bstd::/g, '').replace(/\bMath\./g, '');
        let norm = ""; let i = 0;
        while (i < clean.length) {
            if (i + 7 < clean.length && (clean.substring(i, i + 7) === "inputs[" || clean.substring(i, i + 11) === "inputs.get(")) {
                const is_get = clean.substring(i, i + 11) === "inputs.get(";
                i += is_get ? 11 : 7; norm += "inputs_";
                if (clean[i] === '"' || clean[i] === '\'') i++;
                while (i < clean.length && !/[\]\)\,\"\']/.test(clean[i])) { if (/[a-zA-Z0-9_]/.test(clean[i])) norm += clean[i]; i++; }
                while (i < clean.length && clean[i] !== ']' && clean[i] !== ')') i++;
                if (i < clean.length) i++;
            } else if (i + 8 < clean.length && (clean.substring(i, i + 8) === "outputs[" || clean.substring(i, i + 12) === "outputs.get(")) {
                const is_get = clean.substring(i, i + 12) === "outputs.get(";
                i += is_get ? 12 : 8; norm += "outputs_";
                if (clean[i] === '"' || clean[i] === '\'') i++;
                while (i < clean.length && !/[\]\)\,\"\']/.test(clean[i])) { if (/[a-zA-Z0-9_]/.test(clean[i])) norm += clean[i]; i++; }
                while (i < clean.length && clean[i] !== ']' && clean[i] !== ')') i++;
                if (i < clean.length) i++;
            } else if (i + 6 < clean.length && clean.substring(i, i + 6) === "state[") {
                i += 6; norm += "state_";
                if (clean[i] === '"' || clean[i] === '\'') i++;
                while (i < clean.length && !/[\]\"\']/.test(clean[i])) { if (/[a-zA-Z0-9_]/.test(clean[i])) norm += clean[i]; i++; }
                while (i < clean.length && clean[i] !== ']') i++;
                if (i < clean.length) i++;
            } else if (i + 7 < clean.length && clean.substring(i, i + 7) === "params[") {
                i += 7; norm += "params_";
                if (clean[i] === '"' || clean[i] === '\'') i++;
                while (i < clean.length && !/[\]\"\']/.test(clean[i])) { if (/[a-zA-Z0-9_]/.test(clean[i])) norm += clean[i]; i++; }
                while (i < clean.length && clean[i] !== ']') i++;
                if (i < clean.length) i++;
            } else if (i + 11 < clean.length && clean.substring(i, i + 11) === "params.get(") {
                i += 11; norm += "params_";
                if (clean[i] === '"' || clean[i] === '\'') i++;
                while (i < clean.length && !/[\]\)\,\"\']/.test(clean[i])) { if (/[a-zA-Z0-9_]/.test(clean[i])) norm += clean[i]; i++; }
                while (i < clean.length && clean[i] !== ']' && clean[i] !== ')') i++;
                if (i < clean.length) i++;
            } else if (i + 5 < clean.length && clean.substring(i, i + 5) === "math.") {
                i += 5;
            } else {
                norm += clean[i++];
            }
        }
        return norm;
    }
    parse_statement(line: string, target: Statement[]) {
        if (!line) return;
        let cleanLine = line.trim();
        if (cleanLine.endsWith(';')) cleanLine = cleanLine.slice(0, -1).trim();
        
        const eq = cleanLine.indexOf('='); if (eq === -1) return;
        let lhs = cleanLine.substring(0, eq).trim(); 
        let rhs = cleanLine.substring(eq + 1).trim();
        
        let op = "=";
        if (lhs.endsWith('+')) { op = "+="; lhs = lhs.slice(0, -1).trim(); }
        else if (lhs.endsWith('-')) { op = "-="; lhs = lhs.slice(0, -1).trim(); }
        else if (lhs.endsWith('*')) { op = "*="; lhs = lhs.slice(0, -1).trim(); }
        
        const typePrefixes = ["double", "float", "int", "auto", "double&", "float&", "int&"];
        for (const pref of typePrefixes) {
            if (lhs.startsWith(pref + " ")) {
                lhs = lhs.substring(pref.length + 1).trim();
                break;
            }
        }
        
        let lhs_type: "state" | "outputs" | "local" = "local"; 
        let lhs_key = lhs;
        
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
        
        if (!lhs_key) return;
        target.push({ lhs_type, lhs_key, op, rhs_expr: this.normalize_expression(rhs) });
    }
    compile_code() {
        this.init_statements = []; this.step_statements = [];
        const lines = this.code_str.split('\n');
        let in_init = false, in_step = false;
        for (const line of lines) {
            let clean = line.trim();
            if (clean.includes("//")) {
                clean = clean.substring(0, clean.indexOf("//")).trim();
            }
            if (!clean || clean === "{" || clean === "}") continue;
            
            if (clean.includes("initialize(")) { in_init = true; in_step = false; continue; }
            if (clean.includes("step(")) { in_init = false; in_step = true; continue; }
            
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
        this.last_vars = { ...vars };
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
            } else if (s.lhs_type === "local") {
                vars[s.lhs_key] = rhs;
            }
        }
        this.last_vars = { ...vars };
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
    resistors: ComponentTS[] = []; variable_resistors: ComponentTS[] = []; capacitors: ComponentTS[] = []; inductors: ComponentTS[] = [];
    voltage_sources: ComponentTS[] = []; switches: ComponentTS[] = []; voltmeters: ComponentTS[] = [];
    sw_states: Record<string, string> = {}; control_states: Record<string, Record<string, number>> = {};
    custom_blocks: Record<string, CustomScriptBlock> = {};
    wanted_variables: Set<string> = new Set<string>();
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
                        let compType = cat.type;
                        if (cat.type === "Resistor" && item.src_type === "variable") {
                            compType = "VariableResistor";
                        } else if (cat.type === "dc_ac") {
                            if (item.src_type === "controlled") {
                                compType = "ControlledVoltageSource";
                            } else if (item.src_type === "opamp" || item.src_type === "e_comp") {
                                compType = item.src_type.toUpperCase();
                            } else {
                                compType = (item.type === "ac" || item.src_type === "ac") ? "ACVoltageSource" : "VoltageSource";
                            }
                        } else if (cat.type === "CurrentSource") {
                            if (item.src_type === "controlled") {
                                compType = "ControlledCurrentSource";
                            } else if (item.src_type === "ac" || item.type === "ac") {
                                compType = "ACCurrentSource";
                            }
                        }

                        const comp: ComponentTS = {
                            id: item.id || `C_${Math.floor(Math.random() * 1000)}`,
                            type: compType,
                            nodes: item.nodes || [],
                            parameters: {},
                            channels: {}
                        };
                        
                        for (const [k, v] of Object.entries(item)) {
                            if (["id", "nodes", "type", "control_signal", "signal"].includes(k)) continue;
                            comp.parameters[k] = String(v);
                        }

                        if (["Switch", "MOSFET", "VariableResistor", "ControlledVoltageSource", "ControlledCurrentSource"].includes(compType) || item.control_signal) {
                            const sig = item.control_signal;
                            if (sig) {
                                if (compType === "Switch") comp.channels = { Switch: sig };
                                else if (compType === "MOSFET") comp.channels = { G: sig };
                                else comp.channels = { Ctrl: sig };
                            }
                        }
                        
                        if (compType === "Voltmeter" && item.signal) {
                            comp.channels = { OutV: item.signal };
                        } else if (compType === "Ammeter" && item.signal) {
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
                { key: "summing_junctions", type: "SummingJunction" },
                { key: "pwm_generators", type: "PWM_Generator" },
                { key: "triangle_carriers", type: "Triangle_Carrier" },
                { key: "comparators", type: "Comparator" },
                { key: "logic_gates", type: "logic" },
                { key: "product_blocks", type: "Product" },
                { key: "custom_functions", type: "CustomFunction" },
                { key: "custom_scripts", type: "CustomScript" },
                { key: "signals_routing", type: "routing" }
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
                        } else if (cat.type === "Gain" && item.input && item.output) {
                            comp.channels = { In: item.input, Out: item.output };
                        } else if (cat.type === "PI_Controller" && item.input && item.output) {
                            comp.channels = { In: item.input, Out: item.output };
                        } else if (cat.type === "SummingJunction" && Array.isArray(item.inputs) && item.output) {
                            comp.channels = { A: item.inputs[0], B: item.inputs[1], Out: item.output };
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
                            comp.channels = { In1: item.inputs[0], In2: item.inputs[1], Out: item.output };
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
            if (Array.isArray(params.wanted_variables)) {
                this.wanted_variables = new Set(params.wanted_variables);
            }
        }
    }

    initializeNetwork() {
        this.active_nodes = []; this.node_to_idx = {}; this.L_to_idx = {}; this.V_to_idx = {};
        this.resistors = []; this.variable_resistors = []; this.capacitors = []; this.inductors = []; this.voltage_sources = []; this.switches = []; this.voltmeters = [];
        const nodes_set = new Set<string>();
        for (const c of this.physical_stage) { 
            for (const n of c.nodes) nodes_set.add(n); 
            if (c.parameters.plus_node) nodes_set.add(c.parameters.plus_node);
            if (c.parameters.minus_node) nodes_set.add(c.parameters.minus_node);
        }
        for (const n of nodes_set) { if (n !== "node_0" && n !== "") this.active_nodes.push(n); }
        this.active_nodes.sort();
        for (let i = 0; i < this.active_nodes.length; i++) this.node_to_idx[this.active_nodes[i]] = i;
        this.num_nodes = this.active_nodes.length;

        for (const c of this.physical_stage) {
            if (c.type === "Resistor") this.resistors.push(c);
            else if (c.type === "VariableResistor") this.variable_resistors.push(c);
            else if (c.type === "Capacitor") this.capacitors.push(c);
            else if (c.type === "Inductor") this.inductors.push(c);
            else if (["VoltageSource", "ACVoltageSource", "Ammeter", "ControlledVoltageSource", "OPAMP", "E_COMP"].includes(c.type)) this.voltage_sources.push(c);
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
            else if (["PWM_Generator", "Triangle_Carrier"].includes(b.type)) this.control_states[b.id] = { time: 0.0 };
            else if (b.type === "CustomScript") {
                const bp: Record<string, number> = {};
                for (const [k, v] of Object.entries(b.parameters)) { 
                    if (!["code", "timestep", "plot_inputs", "plot_outputs", "plot_custom_vars"].includes(k)) {
                        bp[k] = parseScientific(v);
                    }
                }
                const inst = new CustomScriptBlock(b.parameters.code ?? "", bp);
                this.custom_blocks[b.id] = inst;
                
                const dt_block_str = b.parameters.timestep ?? "0";
                const dt_block = parseScientific(dt_block_str);
                
                this.control_states[b.id] = {
                    ...inst.state,
                    next_trigger_time: 0.0,
                    dt_block: dt_block,
                    last_outputs: {}
                };
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

    evaluateControls(time: number, w_curr: number[], cs: Record<string, any>, dt: number, ss: Record<string, string>, first = false, integrate = false): Record<string, number> {
        const signals: Record<string, number> = {};
        for (const b of this.control_loops) {
            const out = b.channels.Out; if (!out) continue;
            if (b.type === "Constant") {
                const orig = b.parameters.original_type;
                if (orig === "STEP") {
                    const step_time = parseScientific(b.parameters.step_time ?? "1");
                    const initial_value = parseScientific(b.parameters.initial_value ?? "0");
                    const final_value = parseScientific(b.parameters.final_value ?? "1");
                    signals[out] = (time >= step_time) ? final_value : initial_value;
                } else if (orig === "RAMP") {
                    const slope = parseScientific(b.parameters.slope ?? "1");
                    const start_time = parseScientific(b.parameters.start_time ?? "0");
                    const initial_output = parseScientific(b.parameters.initial_output ?? "0");
                    signals[out] = (time >= start_time) ? initial_output + slope * (time - start_time) : initial_output;
                } else if (orig === "CLOCK") {
                    signals[out] = time;
                } else if (orig === "SINE_WAVE") {
                    const amp = parseScientific(b.parameters.amplitude ?? "1");
                    const freq = parseScientific(b.parameters.frequency ?? "50");
                    const phase = parseScientific(b.parameters.phase ?? "0");
                    signals[out] = amp * Math.sin(2.0 * Math.PI * freq * time + phase * Math.PI / 180.0);
                } else if (orig === "PULSE_GEN") {
                    const amp = parseScientific(b.parameters.amplitude ?? "1");
                    const period = parseScientific(b.parameters.period ?? "1");
                    const width = parseScientific(b.parameters.width ?? "0.5");
                    const delay = parseScientific(b.parameters.delay ?? "0");
                    const t_pulse = (time - delay) % period;
                    signals[out] = (t_pulse >= 0.0 && t_pulse < period * width) ? amp : 0.0;
                } else if (orig === "TRI_GEN") {
                    const freq = parseScientific(b.parameters.frequency ?? "10k");
                    const min = parseScientific(b.parameters.min ?? "0");
                    const max = parseScientific(b.parameters.max ?? "1");
                    const pr = 1.0 / freq; const tl = time % pr;
                    signals[out] = (tl < pr / 2.0) ? min + (max - min) * (tl / (pr / 2.0)) : max - (max - min) * ((tl - pr / 2.0) / (pr / 2.0));
                } else if (orig === "RANDOM_NUM") {
                    if (!cs[b.id]) cs[b.id] = { val: 0.0, prev_time: -1.0 };
                    if (time !== cs[b.id].prev_time) {
                        const mean = parseScientific(b.parameters.mean ?? "0");
                        const std = parseScientific(b.parameters.std ?? "1");
                        let u = 0, v = 0;
                        while(u === 0) u = Math.random();
                        while(v === 0) v = Math.random();
                        const rand = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
                        cs[b.id].val = mean + std * rand;
                        cs[b.id].prev_time = time;
                    }
                    signals[out] = cs[b.id].val;
                } else if (orig === "WHITE_NOISE") {
                    if (!cs[b.id]) cs[b.id] = { val: 0.0, prev_time: -1.0 };
                    if (time !== cs[b.id].prev_time) {
                        const psd = parseScientific(b.parameters.psd ?? "0.1");
                        let u = 0, v = 0;
                        while(u === 0) u = Math.random();
                        while(v === 0) v = Math.random();
                        const rand = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
                        cs[b.id].val = Math.sqrt(psd / (this.sim_params.h || 1e-5)) * rand;
                        cs[b.id].prev_time = time;
                    }
                    signals[out] = cs[b.id].val;
                } else {
                    signals[out] = parseScientific(b.parameters.value ?? "1");
                }
            } else if (b.type === "Triangle_Carrier") {
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
                const out = b.channels.Out;
                if (b.type === "Gain" && out) {
                    const orig = b.parameters.original_type;
                    const val = signals[b.channels.In] ?? 0;
                    if (b.id === "TF1") {
                        console.log("DEBUG TF1: orig =", orig, "val =", val, "parameters =", JSON.stringify(b.parameters));
                    }
                    if (orig === "SATURATION") {
                        const min = parseScientific(b.parameters.min ?? "-10");
                        const max = parseScientific(b.parameters.max ?? "10");
                        signals[out] = Math.max(min, Math.min(max, val));
                    } else if (orig === "DEAD_ZONE") {
                        const start = parseScientific(b.parameters.start ?? "-0.5");
                        const end = parseScientific(b.parameters.end ?? "0.5");
                        if (val > end) signals[out] = val - end;
                        else if (val < start) signals[out] = val - start;
                        else signals[out] = 0.0;
                    } else if (orig === "RATE_LIMITER") {
                        const up = parseScientific(b.parameters.up ?? "10");
                        const down = parseScientific(b.parameters.down ?? "-10");
                        if (!cs[b.id]) cs[b.id] = { prev_out: val, last_out: val, last_t: -1.0 };
                        const prev_out = cs[b.id].prev_out;
                        if (integrate && iter === 2) {
                            const rate = (val - prev_out) / (dt || 1e-5);
                            const clamped_rate = Math.max(down, Math.min(up, rate));
                            const out_val = prev_out + clamped_rate * (dt || 1e-5);
                            cs[b.id].last_out = out_val;
                            cs[b.id].prev_out = out_val;
                            cs[b.id].last_t = time;
                            signals[out] = out_val;
                        } else {
                            if (time === cs[b.id].last_t) {
                                signals[out] = cs[b.id].last_out;
                            } else {
                                const rate = (val - prev_out) / (dt || 1e-5);
                                const clamped_rate = Math.max(down, Math.min(up, rate));
                                signals[out] = prev_out + clamped_rate * (dt || 1e-5);
                            }
                        }
                    } else if (orig === "RELAY") {
                        const on_thresh = parseScientific(b.parameters.on_threshold ?? "1");
                        const off_thresh = parseScientific(b.parameters.off_threshold ?? "-1");
                        if (!cs[b.id]) cs[b.id] = { state: 0 };
                        let st = cs[b.id].state;
                        if (val >= on_thresh) st = 1;
                        else if (val <= off_thresh) st = 0;
                        signals[out] = st;
                        if (integrate && iter === 2) {
                            cs[b.id].state = st;
                        }
                    } else if (orig === "ABS") {
                        signals[out] = Math.abs(val);
                    } else if (orig === "SIGN") {
                        signals[out] = val > 0 ? 1.0 : (val < 0 ? -1.0 : 0.0);
                    } else if (orig === "TRIG_FCN") {
                        const f = b.parameters.function ?? "sin";
                        if (f === "sin") signals[out] = Math.sin(val);
                        else if (f === "cos") signals[out] = Math.cos(val);
                        else if (f === "tan") signals[out] = Math.tan(val);
                        else if (f === "asin") signals[out] = Math.asin(Math.max(-1.0, Math.min(1.0, val)));
                        else if (f === "acos") signals[out] = Math.acos(Math.max(-1.0, Math.min(1.0, val)));
                        else if (f === "atan") signals[out] = Math.atan(val);
                        else if (f === "sinh") signals[out] = Math.sinh(val);
                        else if (f === "cosh") signals[out] = Math.cosh(val);
                        else if (f === "tanh") signals[out] = Math.tanh(val);
                        else signals[out] = 0.0;
                    } else if (orig === "MATH_FCN") {
                        const f = b.parameters.function ?? "exp";
                        if (f === "exp") signals[out] = Math.exp(val);
                        else if (f === "log" || f === "ln") signals[out] = Math.log(Math.abs(val) + 1e-15);
                        else if (f === "log10") signals[out] = Math.log10(Math.abs(val) + 1e-15);
                        else if (f === "square") signals[out] = val * val;
                        else if (f === "sqrt") signals[out] = Math.sqrt(Math.abs(val));
                        else if (f === "10^u") signals[out] = Math.pow(10.0, val);
                        else signals[out] = 0.0;
                    } else if (orig === "ROUND") {
                        const mode = b.parameters.mode ?? "nearest";
                        if (mode === "floor") signals[out] = Math.floor(val);
                        else if (mode === "ceil") signals[out] = Math.ceil(val);
                        else signals[out] = Math.round(val);
                    } else if (orig === "LUT_1D") {
                        const xStr = b.parameters.x ?? "[0, 1]";
                        const yStr = b.parameters.y ?? "[0, 1]";
                        const parseVector = (s: string) => {
                            let clean = s.replace(/[\[\]]/g, '');
                            return clean.split(/[\s,;]+/).filter(x => x.trim() !== '').map(x => parseFloat(x) || 0.0);
                        };
                        const vx = parseVector(xStr);
                        const vy = parseVector(yStr);
                        if (vx.length < 2 || vy.length < vx.length) {
                            signals[out] = vy[0] ?? 0.0;
                        } else {
                            if (val <= vx[0]) {
                                signals[out] = vy[0];
                            } else if (val >= vx[vx.length - 1]) {
                                signals[out] = vy[vy.length - 1];
                            } else {
                                let idx = 0;
                                for (let i = 0; i < vx.length - 1; i++) {
                                    if (val >= vx[i] && val <= vx[i + 1]) {
                                        idx = i;
                                        break;
                                    }
                                }
                                const x0 = vx[idx], x1 = vx[idx + 1];
                                const y0 = vy[idx], y1 = vy[idx + 1];
                                signals[out] = y0 + (y1 - y0) * (val - x0) / (x1 - x0);
                            }
                        }
                    } else if (orig === "DELAY" || orig === "TRANSPORT_DELAY") {
                        const delayDuration = parseScientific(b.parameters.delay ?? "0.1");
                        if (!cs[b.id]) cs[b.id] = { history: [] };
                        const stateObj = cs[b.id];
                        if (integrate && iter === 2) {
                            const lastPt = stateObj.history[stateObj.history.length - 1];
                            if (!lastPt || lastPt.t !== time) {
                                stateObj.history.push({ t: time, val: val });
                            }
                            const thresholdTime = time - delayDuration - 0.1;
                            while (stateObj.history.length > 2 && stateObj.history[1].t < thresholdTime) {
                                stateObj.history.shift();
                            }
                        }
                        const targetT = time - delayDuration;
                        if (stateObj.history.length === 0) {
                            signals[out] = val;
                        } else if (targetT <= stateObj.history[0].t) {
                            signals[out] = stateObj.history[0].val;
                        } else if (targetT >= stateObj.history[stateObj.history.length - 1].t) {
                            signals[out] = stateObj.history[stateObj.history.length - 1].val;
                        } else {
                            let idx = 0;
                            for (let i = 0; i < stateObj.history.length - 1; i++) {
                                if (targetT >= stateObj.history[i].t && targetT <= stateObj.history[i + 1].t) {
                                    idx = i;
                                    break;
                                }
                            }
                            const pt0 = stateObj.history[idx];
                            const pt1 = stateObj.history[idx + 1];
                            const dtInterval = pt1.t - pt0.t;
                            if (dtInterval > 1e-15) {
                                signals[out] = pt0.val + (pt1.val - pt0.val) * (targetT - pt0.t) / dtInterval;
                            } else {
                                signals[out] = pt0.val;
                            }
                        }
                    } else if (orig === "TRANSFER_FCN") {
                        const numStr = b.parameters.num ?? "[1]";
                        const denStr = b.parameters.den ?? "[1 1]";
                        const parseVector = (s: string) => {
                            let clean = s.replace(/[\[\]]/g, '');
                            return clean.split(/[\s,;]+/).filter(x => x.trim() !== '').map(x => parseFloat(x) || 0.0);
                        };
                        const num = parseVector(numStr);
                        const den = parseVector(denStr);
                        const n = den.length - 1;
                        if (n < 1) {
                            signals[out] = (num[0] ?? 1.0) / (den[0] ?? 1.0) * val;
                        } else {
                            const paddedNum = new Array(n + 1).fill(0.0);
                            for (let i = 0; i < num.length; i++) {
                                paddedNum[paddedNum.length - num.length + i] = num[i];
                            }
                            const an = den[0] || 1.0;
                            const denNorm = den.map(v => v / an);
                            const numNorm = paddedNum.map(v => v / an);
                            if (!cs[b.id]) {
                                cs[b.id] = { states: new Array(n).fill(0.0) };
                            }
                            const states = cs[b.id].states;
                            const xDot = new Array(n).fill(0.0);
                            for (let k = 0; k < n - 1; k++) {
                                xDot[k] = states[k + 1];
                            }
                            let sumA = 0.0;
                            for (let k = 0; k < n; k++) {
                                sumA += denNorm[n - k] * states[k];
                            }
                            xDot[n - 1] = -sumA + val;
                            if (dt > 0.0 && !first && integrate && iter === 2) {
                                for (let k = 0; k < n; k++) {
                                    states[k] += xDot[k] * dt;
                                }
                            }
                            const bn = numNorm[0];
                            let sumC = 0.0;
                            for (let k = 0; k < n; k++) {
                                const bk = numNorm[n - k];
                                const ak = denNorm[n - k];
                                sumC += (bk - bn * ak) * states[k];
                            }
                            signals[out] = sumC + bn * val;
                        }
                    } else if (orig === "STATE_SPACE") {
                        const aStr = b.parameters.A ?? "[-1]";
                        const bStr = b.parameters.B ?? "[1]";
                        const cStr = b.parameters.C ?? "[1]";
                        const dStr = b.parameters.D ?? "[0]";
                        const x0Str = b.parameters.x0 ?? "0";
                        const parseVector = (s: string) => {
                            let clean = s.replace(/[\[\]]/g, '');
                            return clean.split(/[\s,;]+/).filter(x => x.trim() !== '').map(x => parseFloat(x) || 0.0);
                        };
                        const parseMatrix = (s: string) => {
                            let clean = s.replace(/[\[\]]/g, '').trim();
                            if (!clean) return [];
                            let rows = clean.split(';');
                            return rows.map(r => r.split(/[\s,]+/).filter(x => x.trim() !== '').map(x => parseFloat(x) || 0.0));
                        };
                        const A = parseMatrix(aStr);
                        const B = parseMatrix(bStr);
                        const C = parseMatrix(cStr);
                        const D = parseMatrix(dStr);
                        const x0 = parseVector(x0Str);
                        const n = A.length;
                        if (n < 1) {
                            signals[out] = 0.0;
                        } else {
                            if (!cs[b.id]) {
                                const initStates = new Array(n).fill(0.0);
                                for (let i = 0; i < Math.min(n, x0.length); i++) {
                                    initStates[i] = x0[i];
                                }
                                cs[b.id] = { states: initStates };
                            }
                            const states = cs[b.id].states;
                            const xDot = new Array(n).fill(0.0);
                            for (let i = 0; i < n; i++) {
                                let ax = 0.0;
                                for (let j = 0; j < n; j++) {
                                    ax += (A[i]?.[j] ?? 0.0) * states[j];
                                }
                                const bi = B[i]?.[0] ?? (B[i] ? (typeof B[i] === 'number' ? B[i] : (B[i][0] ?? 0.0)) : 0.0);
                                xDot[i] = ax + bi * val;
                            }
                            if (dt > 0.0 && !first && integrate && iter === 2) {
                                for (let i = 0; i < n; i++) {
                                    states[i] += xDot[i] * dt;
                                }
                            }
                            let cx = 0.0;
                            for (let j = 0; j < n; j++) {
                                cx += (C[0]?.[j] ?? (C[j] ?? 0.0)) * states[j];
                            }
                            const d0 = D[0]?.[0] ?? (D[0] ?? 0.0);
                            signals[out] = cx + d0 * val;
                        }
                    } else if (orig === "INTEGRATOR") {
                        if (!cs[b.id]) cs[b.id] = { integral: 0.0 };
                        if (dt > 0.0 && !first && integrate && iter === 2) {
                            cs[b.id].integral += val * dt;
                        }
                        signals[out] = cs[b.id].integral;
                    } else if (orig === "DERIVATIVE") {
                        if (!cs[b.id]) cs[b.id] = { prev_val: val, deriv: 0.0, last_t: -1.0 };
                        if (integrate && iter === 2) {
                            const d = (dt > 1e-12) ? (val - cs[b.id].prev_val) / dt : 0.0;
                            cs[b.id].deriv = d;
                            cs[b.id].prev_val = val;
                            cs[b.id].last_t = time;
                            signals[out] = d;
                        } else {
                            if (time === cs[b.id].last_t) {
                                signals[out] = cs[b.id].deriv;
                            } else {
                                signals[out] = (dt > 1e-12) ? (val - cs[b.id].prev_val) / dt : 0.0;
                            }
                        }
                    } else if (orig === "INIT_COND") {
                        const init_val = parseScientific(b.parameters.initial_value ?? b.parameters.x0 ?? "0");
                        signals[out] = first ? init_val : val;
                    } else if (orig === "ZOH") {
                        const ts = parseScientific(b.parameters.ts ?? "100u");
                        const k = Math.floor((time + 1e-11) / ts);
                        if (!cs[b.id]) {
                            cs[b.id] = { held_val: val, last_sample_k: k };
                        }
                        if (integrate && iter === 2) {
                            if (k > cs[b.id].last_sample_k) {
                                cs[b.id].held_val = val;
                                cs[b.id].last_sample_k = k;
                            }
                        }
                        if (k === cs[b.id].last_sample_k) {
                            signals[out] = cs[b.id].held_val;
                        } else {
                            signals[out] = val;
                        }
                    } else if (orig === "UNIT_DELAY") {
                        const ts = parseScientific(b.parameters.ts ?? "100u");
                        const k = Math.floor((time + 1e-11) / ts);
                        if (!cs[b.id]) {
                            cs[b.id] = { held_val: 0.0, next_val: val, last_sample_k: k };
                        }
                        if (integrate && iter === 2) {
                            if (k > cs[b.id].last_sample_k) {
                                cs[b.id].held_val = cs[b.id].next_val;
                                cs[b.id].next_val = val;
                                cs[b.id].last_sample_k = k;
                            }
                        }
                        if (k === cs[b.id].last_sample_k) {
                            signals[out] = cs[b.id].held_val;
                        } else {
                            signals[out] = cs[b.id].next_val;
                        }
                    } else if (orig === "DISCRETE_INT") {
                        const ts = parseScientific(b.parameters.ts ?? "100u");
                        const method = b.parameters.method ?? "Forward Euler";
                        const k = Math.floor((time + 1e-11) / ts);
                        const x0 = parseScientific(b.parameters.initial_value ?? b.parameters.x0 ?? "0");
                        if (!cs[b.id]) {
                            cs[b.id] = { held_out: x0, prev_in: val, last_sample_k: k };
                        }
                        let next_out = cs[b.id].held_out;
                        if (k > cs[b.id].last_sample_k) {
                            if (method === "Forward Euler") {
                                next_out = cs[b.id].held_out + ts * cs[b.id].prev_in;
                            } else if (method === "Backward Euler") {
                                next_out = cs[b.id].held_out + ts * val;
                            } else if (method === "Trapezoidal") {
                                next_out = cs[b.id].held_out + 0.5 * ts * (val + cs[b.id].prev_in);
                            }
                        }
                        if (integrate && iter === 2) {
                            if (k > cs[b.id].last_sample_k) {
                                cs[b.id].held_out = next_out;
                                cs[b.id].prev_in = val;
                                cs[b.id].last_sample_k = k;
                            }
                        }
                        signals[out] = next_out;
                    } else if (orig === "DISCRETE_TF") {
                        const ts = parseScientific(b.parameters.ts ?? "100u");
                        const numStr = b.parameters.num ?? "[1]";
                        const denStr = b.parameters.den ?? "[1 -0.9]";
                        const parseVector = (s: string) => {
                            let clean = s.replace(/[\[\]]/g, '');
                            return clean.split(/[\s,;]+/).filter(x => x.trim() !== '').map(x => parseFloat(x) || 0.0);
                        };
                        const num = parseVector(numStr);
                        const den = parseVector(denStr);
                        const m = num.length - 1;
                        const n = den.length - 1;
                        const a0 = den[0] || 1.0;
                        const denNorm = den.map(v => v / a0);
                        const numNorm = num.map(v => v / a0);
                        const k = Math.floor((time + 1e-11) / ts);
                        
                        if (!cs[b.id]) {
                            cs[b.id] = {
                                u_hist: new Array(m).fill(val),
                                y_hist: new Array(n).fill(0.0),
                                last_sample_k: k,
                                held_out: numNorm[0] * val
                            };
                        }
                        const u_hist = cs[b.id].u_hist;
                        const y_hist = cs[b.id].y_hist;
                        
                        let y_temp = cs[b.id].held_out;
                        if (k > cs[b.id].last_sample_k) {
                            let sumB = numNorm[0] * val;
                            for (let i = 1; i <= m; i++) {
                                sumB += numNorm[i] * (u_hist[i - 1] ?? 0.0);
                            }
                            let sumA = 0.0;
                            for (let j = 1; j <= n; j++) {
                                sumA += denNorm[j] * (y_hist[j - 1] ?? 0.0);
                            }
                            y_temp = sumB - sumA;
                        }
                        if (integrate && iter === 2) {
                            if (k > cs[b.id].last_sample_k) {
                                u_hist.unshift(val);
                                if (u_hist.length > m) u_hist.pop();
                                y_hist.unshift(y_temp);
                                if (y_hist.length > n) y_hist.pop();
                                
                                cs[b.id].held_out = y_temp;
                                cs[b.id].last_sample_k = k;
                            }
                        }
                        signals[out] = y_temp;
                    } else if (orig === "DISCRETE_SS") {
                        const ts = parseScientific(b.parameters.ts ?? "100u");
                        const aStr = b.parameters.A ?? "[-1]";
                        const bStr = b.parameters.B ?? "[1]";
                        const cStr = b.parameters.C ?? "[1]";
                        const dStr = b.parameters.D ?? "[0]";
                        const x0Str = b.parameters.x0 ?? "0";
                        const parseVector = (s: string) => {
                            let clean = s.replace(/[\[\]]/g, '');
                            return clean.split(/[\s,;]+/).filter(x => x.trim() !== '').map(x => parseFloat(x) || 0.0);
                        };
                        const parseMatrix = (s: string) => {
                            let clean = s.replace(/[\[\]]/g, '').trim();
                            if (!clean) return [];
                            let rows = clean.split(';');
                            return rows.map(r => r.split(/[\s,]+/).filter(x => x.trim() !== '').map(x => parseFloat(x) || 0.0));
                        };
                        const A = parseMatrix(aStr);
                        const B = parseMatrix(bStr);
                        const C = parseMatrix(cStr);
                        const D = parseMatrix(dStr);
                        const x0 = parseVector(x0Str);
                        const n = A.length;
                        const k = Math.floor((time + 1e-11) / ts);
                        
                        if (n < 1) {
                            signals[out] = 0.0;
                        } else {
                            if (!cs[b.id]) {
                                const initStates = new Array(n).fill(0.0);
                                for (let i = 0; i < Math.min(n, x0.length); i++) {
                                    initStates[i] = x0[i];
                                }
                                let cx = 0.0;
                                for (let j = 0; j < n; j++) {
                                    cx += (C[0]?.[j] ?? (C[j] ?? 0.0)) * initStates[j];
                                }
                                const d0 = D[0]?.[0] ?? (D[0] ?? 0.0);
                                cs[b.id] = {
                                    states: initStates,
                                    u_held: val,
                                    held_out: cx + d0 * val,
                                    last_sample_k: k
                                };
                            }
                            
                            const states = cs[b.id].states;
                            const u_held = cs[b.id].u_held;
                            
                            let x_temp = [...states];
                            let y_temp = cs[b.id].held_out;
                            
                            if (k > cs[b.id].last_sample_k) {
                                for (let i = 0; i < n; i++) {
                                    let ax = 0.0;
                                    for (let j = 0; j < n; j++) {
                                        ax += (A[i]?.[j] ?? 0.0) * states[j];
                                    }
                                    const bi = B[i]?.[0] ?? (B[i] ? (typeof B[i] === 'number' ? B[i] : (B[i][0] ?? 0.0)) : 0.0);
                                    x_temp[i] = ax + bi * u_held;
                                }
                                let cx = 0.0;
                                for (let j = 0; j < n; j++) {
                                    cx += (C[0]?.[j] ?? (C[j] ?? 0.0)) * x_temp[j];
                                }
                                const d0 = D[0]?.[0] ?? (D[0] ?? 0.0);
                                y_temp = cx + d0 * val;
                            }
                            
                            if (integrate && iter === 2) {
                                if (k > cs[b.id].last_sample_k) {
                                    cs[b.id].states = x_temp;
                                    cs[b.id].u_held = val;
                                    cs[b.id].held_out = y_temp;
                                    cs[b.id].last_sample_k = k;
                                }
                            }
                            signals[out] = y_temp;
                        }
                    } else {
                        signals[out] = parseScientific(b.parameters.K ?? "1") * val;
                    }
                } else if (b.type === "SummingJunction" && out) {
                    const signs = b.parameters.signs || "+-";
                    const s1 = signs[0] === '-' ? -1 : 1;
                    const s2 = signs[1] === '-' ? -1 : 1;
                    signals[out] = s1 * (signals[b.channels.A] ?? 0) + s2 * (signals[b.channels.B] ?? 0);
                } else if (b.type === "PI_Controller" && out) {
                    const error = signals[b.channels.In] ?? 0;
                    if (!cs[b.id]) cs[b.id] = { integral: 0.0 };
                    if (dt > 0.0 && !first && integrate && iter === 2) {
                        cs[b.id].integral += error * dt;
                    }
                    signals[out] = parseScientific(b.parameters.Kp ?? "2.5") * error + parseScientific(b.parameters.Ki ?? "50") * cs[b.id].integral;
                } else if (b.type === "Comparator" && out) {
                    signals[out] = ((signals[b.channels.Plus] ?? 0) >= (signals[b.channels.Minus] ?? 0)) ? 1 : 0;
                } else if (b.type === "AND_Gate" && out) {
                    signals[out] = ((signals[b.channels.A] ?? 0) > 0.5 && (signals[b.channels.B] ?? 0) > 0.5) ? 1 : 0;
                } else if (b.type === "OR_Gate" && out) {
                    signals[out] = ((signals[b.channels.A] ?? 0) > 0.5 || (signals[b.channels.B] ?? 0) > 0.5) ? 1 : 0;
                } else if (b.type === "NOT_Gate" && out) {
                    signals[out] = ((signals[b.channels.In] ?? 0) < 0.5) ? 1 : 0;
                } else if (b.type === "Product" && out) {
                    const orig = b.parameters.original_type;
                    const val1 = signals[b.channels.In1] ?? 0;
                    const val2 = signals[b.channels.In2] ?? 0;
                    if (orig === "MIN_MAX") {
                        const f = b.parameters.function ?? "min";
                        signals[out] = (f === "max") ? Math.max(val1, val2) : Math.min(val1, val2);
                    } else if (orig === "LOGIC_OP") {
                        const op = b.parameters.operator ?? "AND";
                        if (op === "AND") signals[out] = (val1 > 0.5 && val2 > 0.5) ? 1.0 : 0.0;
                        else if (op === "OR") signals[out] = (val1 > 0.5 || val2 > 0.5) ? 1.0 : 0.0;
                        else if (op === "XOR") signals[out] = ((val1 > 0.5) !== (val2 > 0.5)) ? 1.0 : 0.0;
                        else signals[out] = 0.0;
                    } else if (orig === "LUT_2D") {
                        const xStr = b.parameters.x ?? "[0, 1]";
                        const yStr = b.parameters.y ?? "[0, 1]";
                        const zStr = b.parameters.z ?? "[0 0; 0 0]";
                        const parseVector = (s: string) => {
                            let clean = s.replace(/[\[\]]/g, '');
                            return clean.split(/[\s,;]+/).filter(x => x.trim() !== '').map(x => parseFloat(x) || 0.0);
                        };
                        const parseMatrix = (s: string) => {
                            let clean = s.replace(/[\[\]]/g, '').trim();
                            let rows = clean.split(';');
                            return rows.map(r => r.split(/[\s,]+/).filter(x => x.trim() !== '').map(x => parseFloat(x) || 0.0));
                        };
                        const vx = parseVector(xStr);
                        const vy = parseVector(yStr);
                        const mz = parseMatrix(zStr);
                        if (vx.length < 2 || vy.length < 2 || mz.length < vx.length || !mz[0] || mz[0].length < vy.length) {
                            signals[out] = mz[0]?.[0] ?? 0.0;
                        } else {
                            const xVal = Math.max(vx[0], Math.min(vx[vx.length - 1], val1));
                            const yVal = Math.max(vy[0], Math.min(vy[vy.length - 1], val2));
                            let i = 0;
                            for (let r = 0; r < vx.length - 1; r++) {
                                if (xVal >= vx[r] && xVal <= vx[r + 1]) {
                                    i = r;
                                    break;
                                }
                            }
                            let j = 0;
                            for (let c = 0; c < vy.length - 1; c++) {
                                if (yVal >= vy[c] && yVal <= vy[c + 1]) {
                                    j = c;
                                    break;
                                }
                            }
                            const x0 = vx[i], x1 = vx[i + 1];
                            const y0 = vy[j], y1 = vy[j + 1];
                            const z00 = mz[i][j], z01 = mz[i][j + 1];
                            const z10 = mz[i + 1][j], z11 = mz[i + 1][j + 1];
                            const tx = (xVal - x0) / (x1 - x0);
                            const ty = (yVal - y0) / (y1 - y0);
                            const zi0 = z00 + tx * (z10 - z00);
                            const zi1 = z01 + tx * (z11 - z01);
                            signals[out] = zi0 + ty * (zi1 - zi0);
                        }
                    } else {
                        const ops = b.parameters.operators ?? "**";
                        const op1 = ops[0] ?? "*";
                        const op2 = ops[1] ?? "*";
                        const v1 = op1 === "/" ? 1.0 / (val1 || 1e-15) : val1;
                        const v2 = op2 === "/" ? 1.0 / (val2 || 1e-15) : val2;
                        signals[out] = v1 * v2;
                    }
                } else if (b.type === "CustomFunction" && out) {
                    signals[out] = new ExpressionEvaluator().evaluate(b.parameters.expr ?? "u * 2", { u: signals[b.channels.In] ?? 0 });
                } else if (b.type === "Mux" && out) {
                    signals[out] = signals[b.channels.In1] ?? 0;
                } else if (b.type === "Demux") {
                    const iv = signals[b.channels.In] ?? 0;
                    if (b.channels.Out1) signals[b.channels.Out1] = iv;
                    if (b.channels.Out2) signals[b.channels.Out2] = 0.0;
                } else if (b.type === "CustomScript") {
                    const inst = this.custom_blocks[b.id];
                    if (inst) {
                        const stateObj = cs[b.id] ?? {};
                        const dt_block = stateObj.dt_block ?? 0.0;
                        const next_t = stateObj.next_trigger_time ?? 0.0;
                        
                        const ind: Record<string, number> = {};
                        for (const p of inst.inputs) ind[p] = signals[b.channels[p]] ?? 0.0;

                        if (dt_block <= 0.0 || time >= next_t - 1e-15 || first) {
                            inst.state = { ...stateObj };
                            // Delete solver infrastructure details before step execution
                            delete inst.state.next_trigger_time;
                            delete inst.state.dt_block;
                            delete inst.state.last_outputs;

                            const od = inst.step(time, ind);
                            
                            // Save outputs for sample-and-hold
                            stateObj.last_outputs = { ...od };
                            
                            // Update states from execution
                            for (const [sk, sv] of Object.entries(inst.state)) {
                                stateObj[sk] = sv;
                            }
                            
                            // Update next trigger time
                            if (dt_block > 0.0) {
                                if (first && time === 0.0) {
                                    stateObj.next_trigger_time = dt_block;
                                } else {
                                    stateObj.next_trigger_time = Math.floor(time / dt_block) * dt_block + dt_block;
                                    if (stateObj.next_trigger_time <= time + 1e-15) {
                                        stateObj.next_trigger_time += dt_block;
                                    }
                                }
                            }
                        }
                        
                        // Output the last values (sample-and-hold)
                        const outputs_to_use = stateObj.last_outputs ?? {};
                        for (const [k, val] of Object.entries(outputs_to_use)) {
                            const ch = b.channels[k];
                            if (ch) signals[ch] = val as number;
                        }
                        
                        // Store internal states and local variables in the signals dictionary
                        if (inst.last_vars) {
                            for (const [varKey, varVal] of Object.entries(inst.last_vars)) {
                                if (varKey.startsWith("state_")) {
                                    signals[`${b.id}.${varKey.substring(6)}`] = varVal;
                                } else if (varKey.startsWith("outputs_")) {
                                    signals[`${b.id}.${varKey.substring(8)}`] = varVal;
                                } else if (varKey.startsWith("inputs_")) {
                                    signals[`${b.id}.${varKey.substring(7)}`] = varVal;
                                } else if (varKey.startsWith("params_")) {
                                    // omit params
                                } else if (varKey !== "time") {
                                    signals[`${b.id}.${varKey}`] = varVal;
                                }
                            }
                        }
                        cs[b.id] = stateObj;
                    }
                }
            }
        }
        
        // Post-process to record all block terminal values explicitly for plotting
        for (const b of this.control_loops) {
            for (const [pinName, sigName] of Object.entries(b.channels)) {
                if (typeof sigName === 'string') {
                    signals[`${b.id}.${pinName}`] = signals[sigName] ?? 0.0;
                }
            }
        }

        return signals;
    }

    buildRHS(t_stage: number, w_stage: number[], sigs: Record<string, number>): number[] {
        const b = new Array(this.dim).fill(0.0);
        for (const src of this.voltage_sources) {
            const idx = this.V_to_idx[src.id];
            if (idx === undefined) continue;

            if (["VoltageSource", "ControlledVoltageSource", "OPAMP", "E_COMP"].includes(src.type)) {
                const srcType = src.parameters.src_type;
                if (srcType === "controlled" || src.type === "ControlledVoltageSource") {
                    const gain = parseScientific(src.parameters.value ?? "1.0");
                    const ctrlSig = src.channels.Ctrl;
                    const ctrlVal = (ctrlSig && sigs[ctrlSig] !== undefined) ? sigs[ctrlSig] : 0.0;
                    b[idx] = ctrlVal * gain;
                } else if (srcType === "opamp" || src.type === "OPAMP") {
                    const gain = parseScientific(src.parameters.gain ?? "1e5");
                    const vsat = parseScientific(src.parameters.value ?? "12.0");
                    const nPlus = src.parameters.plus_node;
                    const nMinus = src.parameters.minus_node;
                    const idxPlus = (nPlus !== "node_0" && nPlus !== undefined) ? this.node_to_idx[nPlus] : -1;
                    const idxMinus = (nMinus !== "node_0" && nMinus !== undefined) ? this.node_to_idx[nMinus] : -1;
                    const vPlus = idxPlus >= 0 ? w_stage[idxPlus] : 0.0;
                    const vMinus = idxMinus >= 0 ? w_stage[idxMinus] : 0.0;
                    const vdiff = vPlus - vMinus;
                    let vout = gain * vdiff;
                    if (vout > vsat) vout = vsat;
                    else if (vout < -vsat) vout = -vsat;
                    b[idx] = vout;
                } else if (srcType === "e_comp" || src.type === "E_COMP") {
                    const vsat = parseScientific(src.parameters.value ?? "12.0");
                    const nPlus = src.parameters.plus_node;
                    const nMinus = src.parameters.minus_node;
                    const idxPlus = (nPlus !== "node_0" && nPlus !== undefined) ? this.node_to_idx[nPlus] : -1;
                    const idxMinus = (nMinus !== "node_0" && nMinus !== undefined) ? this.node_to_idx[nMinus] : -1;
                    const vPlus = idxPlus >= 0 ? w_stage[idxPlus] : 0.0;
                    const vMinus = idxMinus >= 0 ? w_stage[idxMinus] : 0.0;
                    b[idx] = vPlus > vMinus ? vsat : -vsat;
                } else {
                    b[idx] = parseScientific(src.parameters.value ?? "24");
                }
            } else if (src.type === "ACVoltageSource") {
                const amp = parseScientific(src.parameters.amplitude ?? "12"), freq = parseScientific(src.parameters.frequency ?? "50");
                const phase = parseScientific(src.parameters.phase ?? "0");
                b[idx] = amp * Math.sin(2.0 * Math.PI * freq * t_stage + phase * Math.PI / 180.0);
            }
        }
        for (const c of this.physical_stage) {
            if (["CurrentSource", "ControlledCurrentSource", "ACCurrentSource"].includes(c.type)) {
                const n1 = c.nodes[0] ?? "node_0", n2 = c.nodes[1] ?? "node_0";
                const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
                let iv = 0.0;
                const srcType = c.parameters.src_type;
                if (c.type === "ControlledCurrentSource" || srcType === "controlled") {
                    const gain = parseScientific(c.parameters.value ?? "1.0");
                    const ctrlSig = c.channels.Ctrl;
                    const ctrlVal = (ctrlSig && sigs[ctrlSig] !== undefined) ? sigs[ctrlSig] : 0.0;
                    iv = ctrlVal * gain;
                } else if (c.type === "ACCurrentSource" || srcType === "ac") {
                    const amp = parseScientific(c.parameters.amplitude ?? "1.0"), freq = parseScientific(c.parameters.frequency ?? "50.0");
                    const phase = parseScientific(c.parameters.phase ?? "0.0");
                    iv = amp * Math.sin(2.0 * Math.PI * freq * t_stage + phase * Math.PI / 180.0);
                } else {
                    iv = parseScientific(c.parameters.value ?? "1.0");
                }
                if (i1 >= 0) b[i1] -= iv; if (i2 >= 0) b[i2] += iv;
            }
        }
        return b;
    }

    stampVariableResistors(K: Matrix, sigs: Record<string, number>) {
        for (const vr of this.variable_resistors) {
            const baseVal = parseScientific(vr.parameters.value ?? "10");
            const ctrlSig = vr.channels.Ctrl;
            const ctrlVal = (ctrlSig && sigs[ctrlSig] !== undefined) ? sigs[ctrlSig] : baseVal;
            let r_val = ctrlVal;
            if (r_val < 1e-6) r_val = 1e-6;
            const g = 1.0 / r_val;
            const n1 = vr.nodes[0] ?? "node_0", n2 = vr.nodes[1] ?? "node_0";
            const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
            if (i1 >= 0) K.add(i1, i1, g);
            if (i2 >= 0) K.add(i2, i2, g);
            if (i1 >= 0 && i2 >= 0) { K.add(i1, i2, -g); K.add(i2, i1, -g); }
        }
    }

    compute_k(t_stage: number, w_stage: number[], cs: Record<string, Record<string, number>>, dt: number, ss: Record<string, string>): number[] {
        const wl = [...w_stage]; 
        let sigs = this.evaluateControls(t_stage, wl, cs, dt, ss, false, false);
        const K = new Matrix(this.dim, this.dim); K.data = [...this.K_static.data];
        for (const sw of this.switches) this.stampSwitch(K, sw, ss[sw.id] ?? "OFF");
        this.stampVariableResistors(K, sigs);
        let b = this.buildRHS(t_stage, wl, sigs);

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

        let wl_prev = new Array(this.dim).fill(0.0);
        for (let iter = 0; iter < 10; iter++) {
            wl_prev = [...wl];
            sigs = this.evaluateControls(t_stage, wl, cs, dt, ss, false, false);
            let any_ch = false;
            for (const sw of this.switches) {
                const n1 = sw.nodes[0] ?? "node_0", n2 = sw.nodes[1] ?? "node_0";
                const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
                const vd = ((i1 >= 0) ? wl[i1] : 0.0) - ((i2 >= 0) ? wl[i2] : 0.0);
                const old = ss[sw.id] ?? "OFF"; 
                let swn = "OFF";
                if (sw.type === "MOSFET") swn = (sigs[sw.channels.G] ?? 0) > 0.5 ? "ON" : "OFF";
                else if (sw.type === "Diode") swn = vd > (old === "ON" ? 0.0 : 0.7) ? "ON" : "OFF";
                else if (sw.type === "Switch") {
                    const swCtrl = sw.channels.Switch || sw.channels.Ctrl;
                    if (swCtrl && sigs[swCtrl] !== undefined) {
                        swn = sigs[swCtrl] > 0.5 ? "ON" : "OFF";
                    } else {
                        swn = parseScientific(sw.parameters.state ?? "0") > 0.5 ? "ON" : "OFF";
                    }
                }
                if (swn !== old) { ss[sw.id] = swn; any_ch = true; }
            }
            
            let max_diff = 0.0;
            for (let i = 0; i < this.dim; i++) {
                const d = Math.abs(wl[i] - wl_prev[i]);
                if (d > max_diff) max_diff = d;
            }
            
            if (any_ch || max_diff > 1e-4) {
                const K_new = new Matrix(this.dim, this.dim); K_new.data = [...this.K_static.data];
                for (const sw of this.switches) this.stampSwitch(K_new, sw, ss[sw.id] ?? "OFF");
                this.stampVariableResistors(K_new, sigs);
                b = this.buildRHS(t_stage, wl, sigs);
                if (this.alg_idx.length > 0 && this.diff_idx.length > 0) {
                    try {
                        const K_aa = K_new.submatrix(this.alg_idx, this.alg_idx), K_ad = K_new.submatrix(this.alg_idx, this.diff_idx);
                        const ba = this.alg_idx.map(i => b[i]), wd = this.diff_idx.map(i => wl[i]);
                        const sol = K_aa.solve(ba.map((v, idx) => v - K_ad.multiply(wd)[idx]));
                        for (let i = 0; i < this.alg_idx.length; i++) wl[this.alg_idx[i]] = sol[i];
                    } catch (_) {}
                } else if (this.alg_idx.length > 0 && this.diff_idx.length === 0) {
                    try { const sol = K_new.solve(b); for (let i = 0; i < sol.length; i++) wl[i] = sol[i]; } catch (_) {}
                }
            } else break;
        }

        const fK = new Matrix(this.dim, this.dim); fK.data = [...this.K_static.data];
        for (const sw of this.switches) this.stampSwitch(fK, sw, ss[sw.id] ?? "OFF");
        this.stampVariableResistors(fK, sigs);
        b = this.buildRHS(t_stage, wl, sigs);
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
            let sigs = this.evaluateControls(time + dt, wn, cs, dt, s_stage, false, false);
            let wn_prev = new Array(this.dim).fill(0.0);
            while (s_ch && loop < 10) {
                s_ch = false; loop++;
                wn_prev = [...wn];
                const K = new Matrix(this.dim, this.dim); K.data = [...this.K_static.data];
                for (const sw of this.switches) this.stampSwitch(K, sw, s_stage[sw.id]);
                this.stampVariableResistors(K, sigs);
                const b = this.buildRHS(time + dt, wn, sigs);
                
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
                sigs = this.evaluateControls(time + dt, wn, cs, dt, s_stage, false, false);
                let any_ch = false; const next_sw: Record<string, string> = {};
                for (const sw of this.switches) {
                    const n1 = sw.nodes[0] ?? "node_0", n2 = sw.nodes[1] ?? "node_0";
                    const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
                    const vd = ((i1 >= 0) ? wn[i1] : 0.0) - ((i2 >= 0) ? wn[i2] : 0.0);
                    const old = s_stage[sw.id] ?? "OFF"; 
                    let swn = "OFF";
                    if (sw.type === "MOSFET") swn = (sigs[sw.channels.G] ?? 0) > 0.5 ? "ON" : "OFF";
                    else if (sw.type === "Diode") swn = vd > (old === "ON" ? 0.0 : 0.7) ? "ON" : "OFF";
                    else if (sw.type === "Switch") {
                        const swCtrl = sw.channels.Switch || sw.channels.Ctrl;
                        if (swCtrl && sigs[swCtrl] !== undefined) {
                            swn = sigs[swCtrl] > 0.5 ? "ON" : "OFF";
                        } else {
                            swn = parseScientific(sw.parameters.state ?? "0") > 0.5 ? "ON" : "OFF";
                        }
                    }
                    next_sw[sw.id] = swn; if (swn !== old) any_ch = true;
                }
                let max_diff = 0.0;
                for (let i = 0; i < this.dim; i++) {
                    const d = Math.abs(wn[i] - wn_prev[i]);
                    if (d > max_diff) max_diff = d;
                }
                if (any_ch || max_diff > 1e-4) {
                    s_stage = next_sw; s_ch = true;
                }
            }
            sw_n = s_stage;
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
                const sigs = this.evaluateControls(time + dt, w_con, cs, dt, s_stage, false, false);
                let any_ch = false; const next_sw = { ...s_stage };
                for (const sw of this.switches) {
                    const n1 = sw.nodes[0] ?? "node_0", n2 = sw.nodes[1] ?? "node_0";
                    const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
                    const vd = ((i1 >= 0) ? w_con[i1] : 0.0) - ((i2 >= 0) ? w_con[i2] : 0.0);
                    const old = s_stage[sw.id] ?? "OFF"; 
                    let swn = "OFF";
                    if (sw.type === "MOSFET") swn = (sigs[sw.channels.G] ?? 0) > 0.5 ? "ON" : "OFF";
                    else if (sw.type === "Diode") swn = vd > (old === "ON" ? 0.0 : 0.7) ? "ON" : "OFF";
                    else if (sw.type === "Switch") {
                        const swCtrl = sw.channels.Switch || sw.channels.Ctrl;
                        if (swCtrl && sigs[swCtrl] !== undefined) {
                            swn = sigs[swCtrl] > 0.5 ? "ON" : "OFF";
                        } else {
                            swn = parseScientific(sw.parameters.state ?? "0") > 0.5 ? "ON" : "OFF";
                        }
                    }
                    next_sw[sw.id] = swn; if (swn !== old) any_ch = true;
                }
                if (any_ch) {
                    s_stage = next_sw;
                    const K = new Matrix(this.dim, this.dim); K.data = [...this.K_static.data];
                    for (const sw of this.switches) this.stampSwitch(K, sw, s_stage[sw.id]);
                    this.stampVariableResistors(K, sigs);
                    const b = this.buildRHS(time + dt, w_con, sigs);
                    if (this.alg_idx.length > 0 && this.diff_idx.length > 0) {
                        try {
                            const K_aa = K.submatrix(this.alg_idx, this.alg_idx), K_ad = K.submatrix(this.alg_idx, this.diff_idx);
                            const sol = K_aa.solve(this.alg_idx.map(i => b[i]).map((v, idx) => v - K_ad.multiply(this.diff_idx.map(i => w_con[i]))[idx]));
                            for (let i = 0; i < this.alg_idx.length; i++) w_con[this.alg_idx[i]] = sol[i];
                        } catch (_) {}
                    } else if (this.alg_idx.length > 0 && this.diff_idx.length === 0) {
                        try { const sol = K.solve(b); for (let i = 0; i < sol.length; i++) w_con[i] = sol[i]; } catch (_) {}
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
                const W_prev = [ [...W[0]], [...W[1]], [...W[2]] ];
                const Klist: Matrix[] = [], blist: number[][] = [];
                for (let j = 0; j < 3; j++) {
                    const Tj = time + c_radau[j] * dt;
                    const sigs = this.evaluateControls(Tj, W[j], cs, dt, s_stage, false, false);
                    const Kj = new Matrix(this.dim, this.dim); Kj.data = [...this.K_static.data];
                    for (const sw of this.switches) this.stampSwitch(Kj, sw, s_stage[sw.id]);
                    this.stampVariableResistors(Kj, sigs);
                    const bj = this.buildRHS(Tj, W[j], sigs);
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
                const sigs = this.evaluateControls(time + dt, wn, cs, dt, s_stage, false, false);
                let any_ch = false; const next_sw = { ...s_stage };
                for (const sw of this.switches) {
                    const n1 = sw.nodes[0] ?? "node_0", n2 = sw.nodes[1] ?? "node_0";
                    const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
                    const vd = ((i1 >= 0) ? wn[i1] : 0.0) - ((i2 >= 0) ? wn[i2] : 0.0);
                    const old = s_stage[sw.id] ?? "OFF"; 
                    let swn = "OFF";
                    if (sw.type === "MOSFET") swn = (sigs[sw.channels.G] ?? 0) > 0.5 ? "ON" : "OFF";
                    else if (sw.type === "Diode") swn = vd > (old === "ON" ? 0.0 : 0.7) ? "ON" : "OFF";
                    else if (sw.type === "Switch") {
                        const swCtrl = sw.channels.Switch || sw.channels.Ctrl;
                        if (swCtrl && sigs[swCtrl] !== undefined) {
                            swn = sigs[swCtrl] > 0.5 ? "ON" : "OFF";
                        } else {
                            swn = parseScientific(sw.parameters.state ?? "0") > 0.5 ? "ON" : "OFF";
                        }
                    }
                    next_sw[sw.id] = swn; if (swn !== old) any_ch = true;
                }
                let max_diff = 0.0;
                for (let j = 0; j < 3; j++) {
                    for (let i = 0; i < this.dim; i++) {
                        const d = Math.abs(W[j][i] - W_prev[j][i]);
                        if (d > max_diff) max_diff = d;
                    }
                }
                if (any_ch || max_diff > 1e-4) {
                    s_stage = next_sw; s_ch = true;
                }
            }
            sw_n = s_stage;
        }
        const final_ctrl = JSON.parse(JSON.stringify(cs));
        this.evaluateControls(time + dt, wn, final_ctrl, dt, sw_n, false, true);
        ctrl_n = final_ctrl;
        return { w_new: wn, ctrl_new: ctrl_n, sw_new: sw_n, out_trans };
    }

    logAcceptedState(time: number, w_val: number[], sigs: Record<string, number>, ss: Record<string, string>, dt: number) {
        this.time_log.push(time);
        
        const hasWanted = this.wanted_variables.size > 0;

        for (const node of this.active_nodes) {
            if (hasWanted && !this.wanted_variables.has(node)) continue;
            const idx = this.node_to_idx[node]; if (!this.voltages_log[node]) this.voltages_log[node] = [];
            this.voltages_log[node].push(w_val[idx]);
        }
        for (const ind of this.inductors) {
            if (hasWanted && !this.wanted_variables.has(ind.id)) continue;
            const idx = this.L_to_idx[ind.id]; if (!this.inductors_log[ind.id]) this.inductors_log[ind.id] = [];
            this.inductors_log[ind.id].push(w_val[idx]);
        }
        for (const comp of this.voltage_sources) {
            if (comp.type === "Ammeter") {
                if (hasWanted && !this.wanted_variables.has(comp.id)) continue;
                const idx = this.V_to_idx[comp.id]; if (!this.ammeters_log[comp.id]) this.ammeters_log[comp.id] = [];
                this.ammeters_log[comp.id].push(w_val[idx]);
            }
        }
        for (const vm of this.voltmeters) {
            if (hasWanted && !this.wanted_variables.has(vm.id) && !this.wanted_variables.has(`${vm.id}.Out`)) continue;
            const n1 = vm.nodes[0] ?? "node_0", n2 = vm.nodes[1] ?? "node_0";
            const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
            if (!this.voltmeters_log[vm.id]) this.voltmeters_log[vm.id] = [];
            this.voltmeters_log[vm.id].push(((i1 >= 0) ? w_val[i1] : 0.0) - ((i2 >= 0) ? w_val[i2] : 0.0));
        }
        for (const [k, v] of Object.entries(sigs)) {
            if (hasWanted && !this.wanted_variables.has(k)) continue;
            if (!this.signals_log[k]) this.signals_log[k] = [];
            this.signals_log[k].push(v);
        }

        for (const comp of this.physical_stage) {
            const kv = "V_" + comp.id; 
            const ki = "I_" + comp.id; 
            const kc = "Ctrl_" + comp.id;
            
            const logV = !hasWanted || this.wanted_variables.has(kv);
            const logI = !hasWanted || this.wanted_variables.has(ki);
            const logC = !hasWanted || this.wanted_variables.has(kc);
            
            const ctrlChan = comp.channels.Ctrl || comp.channels.Switch || comp.channels.G;
            if (logC && ctrlChan !== undefined) {
                const ctrlVal = sigs[ctrlChan] !== undefined ? sigs[ctrlChan] : 0.0;
                if (!this.custom_plots_log[kc]) this.custom_plots_log[kc] = [];
                this.custom_plots_log[kc].push(ctrlVal);
            }

            if (!logV && !logI) continue;

            const n1 = comp.nodes[0] ?? "node_0", n2 = comp.nodes[1] ?? "node_0";
            const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
            const v = ((i1 >= 0) ? w_val[i1] : 0.0) - ((i2 >= 0) ? w_val[i2] : 0.0);
            
            if (logV) {
                if (!this.custom_plots_log[kv]) this.custom_plots_log[kv] = []; 
                this.custom_plots_log[kv].push(v);
            }
            
            if (logI) {
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
                    const cv = parseScientific(comp.parameters.C ?? "100u");
                    if (this.cap_history[comp.id]) curr = cv / dt * (v - this.cap_history[comp.id].v_prev);
                } 
                else if (["VoltageSource", "ACVoltageSource", "Ammeter", "V", "AC_V", "AM", "ControlledVoltageSource", "OPAMP", "E_COMP"].includes(comp.type)) { 
                    const idx = this.V_to_idx[comp.id]; 
                    curr = (idx !== undefined) ? w_val[idx] : 0.0; 
                }
                else if (["Switch", "Diode", "MOSFET", "S", "D"].includes(comp.type)) {
                    const ron = parseScientific(comp.parameters.Ron ?? "1e-3"), roff = parseScientific(comp.parameters.Roff ?? "1e6");
                    curr = v / ((ss[comp.id] ?? "OFF") === "ON" ? ron : roff);
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

    run() {
        this.initializeNetwork();
        this.time_log = []; this.voltages_log = {}; this.inductors_log = {}; this.voltmeters_log = {}; this.ammeters_log = {}; this.signals_log = {}; this.custom_plots_log = {};
        let t = 0.0; let h = this.sim_params.h; const t_end = this.sim_params.t_end;
        const init_sigs = this.evaluateControls(0.0, this.w, this.control_states, h, this.sw_states, true, false);
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
                        const sig_half1 = this.evaluateControls(t + h_half, half1.w_new, this.control_states, h_half, half1.sw_new, false, false);
                        this.logAcceptedState(t + h_half, half1.w_new, sig_half1, half1.sw_new, h_half);
                        for (const ev of half2.out_trans) this.logAcceptedState(ev.time, ev.w, ev.signals, ev.sw_states, ev.dt);

                        for (const c of this.capacitors) {
                            const n1 = c.nodes[0] ?? "node_0", n2 = c.nodes[1] ?? "node_0";
                            const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
                            const v1 = ((i1 >= 0) ? half1.w_new[i1] : 0.0) - ((i2 >= 0) ? half1.w_new[i2] : 0.0);
                            const hist = this.cap_history[c.id]; hist.v_prev_prev = hist.v_prev; hist.v_prev = v1; hist.dt_prev = h_half;
                        }
                        for (const c of this.capacitors) {
                            const n1 = c.nodes[0] ?? "node_0", n2 = c.nodes[1] ?? "node_0";
                            const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
                            const v2 = ((i1 >= 0) ? this.w[i1] : 0.0) - ((i2 >= 0) ? this.w[i2] : 0.0);
                            const hist = this.cap_history[c.id]; hist.v_prev_prev = hist.v_prev; hist.v_prev = v2; hist.dt_prev = h_half;
                        }
                        this.control_states = half2.ctrl_new; this.sw_states = half2.sw_new;
                        for (const k of Object.keys(this.custom_blocks)) { if (half2.ctrl_new[k]) this.custom_blocks[k].state = half2.ctrl_new[k]; }
                        const final_sigs = this.evaluateControls(t_new, this.w, this.control_states, h_half, this.sw_states, false, false);
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
                    for (const c of this.capacitors) {
                        const n1 = c.nodes[0] ?? "node_0", n2 = c.nodes[1] ?? "node_0";
                        const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
                        const v = ((i1 >= 0) ? this.w[i1] : 0.0) - ((i2 >= 0) ? this.w[i2] : 0.0);
                        const hist = this.cap_history[c.id]; hist.v_prev_prev = hist.v_prev; hist.v_prev = v; hist.dt_prev = h;
                    }
                    this.control_states = step.ctrl_new; this.sw_states = step.sw_new;
                    for (const k of Object.keys(this.custom_blocks)) { if (step.ctrl_new[k]) this.custom_blocks[k].state = step.ctrl_new[k]; }
                    const final_sigs = this.evaluateControls(t_new, this.w, this.control_states, h, this.sw_states, false, false);
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
