import { discoverPortsJS } from "./schematic/config";

export function parseScientific(str: any): number {
    if (typeof str === 'number') return str;
    if (str === undefined || str === null || str === '') return 0.0;
    let s = String(str).trim();
    if (!s) return 0.0;

    // Strip trailing units like ohm, v, a, hz, f, h, w, etc. case-insensitively
    s = s.replace(/\s*(?:ohms?|ohm|Ω|hz|hertz|v(?:olts?)?|a(?:mps?)?|f(?:arads?)?|h(?:enrys?)?|w(?:atts?))\s*$/i, '');
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
    evaluate(expression: string, variables: Record<string, number>, block?: CustomScriptBlock): number {
        const expr = expression.trim();
        if (!expr) return 0.0;
        return new Parser(expr, variables, block).parse();
    }
}

class Parser {
    expr: string; pos = 0; vars: Record<string, number>; block?: CustomScriptBlock;
    constructor(expr: string, vars: Record<string, number>, block?: CustomScriptBlock) {
        this.expr = expr; this.vars = vars; this.block = block;
    }
    peek() { return this.pos < this.expr.length ? this.expr[this.pos] : '\0'; }
    get() { return this.pos < this.expr.length ? this.expr[this.pos++] : '\0'; }
    skipWhitespace() { while (this.pos < this.expr.length && /\s/.test(this.expr[this.pos])) this.pos++; }
    
    matchString(s: string): boolean {
        this.skipWhitespace();
        if (this.pos + s.length <= this.expr.length && this.expr.substring(this.pos, this.pos + s.length) === s) {
            this.pos += s.length;
            return true;
        }
        return false;
    }

    parsePrimary(): number {
        this.skipWhitespace();
        const c = this.peek();
        if (c === '-') { this.get(); return -this.parsePrimary(); }
        if (c === '+') { this.get(); return this.parsePrimary(); }
        if (c === '!') { this.get(); return (this.parsePrimary() === 0.0) ? 1.0 : 0.0; }
        if (c === '(') {
            this.get();
            const val = this.parseTernary();
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
            
            // Check for array syntax: name[idx_expr]
            if (this.peek() === '[') {
                this.get(); // consume '['
                const idx = this.parseTernary();
                this.skipWhitespace();
                if (this.peek() === ']') this.get(); // consume ']'
                
                if (name === "inputs" && this.block) {
                    const port_name = this.block.inputs[Math.round(idx)];
                    return port_name ? (this.vars["inputs_" + port_name] ?? 0.0) : 0.0;
                }
                if (name === "outputs" && this.block) {
                    const port_name = this.block.outputs[Math.round(idx)];
                    return port_name ? (this.vars["outputs_" + port_name] ?? 0.0) : 0.0;
                }
                // Check if it's a state array element
                const state_key = `${name}_${Math.round(idx)}`;
                if (("state_" + state_key) in this.vars) {
                    return this.vars["state_" + state_key];
                }
                return 0.0;
            }
            
            // Check if it's a math function
            if (this.peek() === '(') {
                this.get();
                const arg1 = this.parseTernary();
                this.skipWhitespace();
                let arg2 = 0.0;
                if (this.peek() === ',') { this.get(); arg2 = this.parseTernary(); }
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
            
            if (("state_" + name) in this.vars) return this.vars["state_" + name];
            if (("params_" + name) in this.vars) return this.vars["params_" + name];
            if (name in this.vars) return this.vars[name];
            if (name === "pi" || name === "PI" || name === "M_PI") return Math.PI;
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
    parseComparison(): number {
        let val = this.parseExpression();
        while (true) {
            if (this.matchString(">=")) {
                const r = this.parseExpression();
                val = (val >= r) ? 1.0 : 0.0;
            } else if (this.matchString("<=")) {
                const r = this.parseExpression();
                val = (val <= r) ? 1.0 : 0.0;
            } else if (this.matchString(">")) {
                const r = this.parseExpression();
                val = (val > r) ? 1.0 : 0.0;
            } else if (this.matchString("<")) {
                const r = this.parseExpression();
                val = (val < r) ? 1.0 : 0.0;
            } else {
                break;
            }
        }
        return val;
    }
    parseEquality(): number {
        let val = this.parseComparison();
        while (true) {
            if (this.matchString("==")) {
                const r = this.parseComparison();
                val = (val === r) ? 1.0 : 0.0;
            } else if (this.matchString("!=")) {
                const r = this.parseComparison();
                val = (val !== r) ? 1.0 : 0.0;
            } else {
                break;
            }
        }
        return val;
    }
    parseLogicalAnd(): number {
        let val = this.parseEquality();
        while (this.matchString("&&")) {
            const r = this.parseEquality();
            val = (val !== 0.0 && r !== 0.0) ? 1.0 : 0.0;
        }
        return val;
    }
    parseLogicalOr(): number {
        let val = this.parseLogicalAnd();
        while (this.matchString("||")) {
            const r = this.parseLogicalAnd();
            val = (val !== 0.0 || r !== 0.0) ? 1.0 : 0.0;
        }
        return val;
    }
    parseTernary(): number {
        const cond = this.parseLogicalOr();
        this.skipWhitespace();
        if (this.peek() === '?') {
            this.get();
            const val1 = this.parseTernary();
            this.skipWhitespace();
            if (this.peek() === ':') {
                this.get();
            }
            const val2 = this.parseTernary();
            return (cond !== 0.0) ? val1 : val2;
        }
        return cond;
    }
    parse() { try { return this.parseTernary(); } catch (_) { return 0.0; } }
}

export interface Statement {
    type?: "assign" | "for" | "if";
    lhs_type?: "state" | "outputs" | "state_array" | "local";
    lhs_key?: string;
    lhs_idx_expr?: string;
    op?: string;
    rhs_expr?: string;
    loop_var?: string;
    loop_start_expr?: string;
    loop_limit_expr?: string;
    body?: Statement[];
    // if/else if/else fields
    condition_expr?: string;
    else_if_branches?: { condition_expr: string; body: Statement[] }[];
    else_body?: Statement[];
}

class JsExpressionCompiler {
    expr: string; pos = 0; block: CustomScriptBlock; localVars: Set<string>;
    constructor(expr: string, block: CustomScriptBlock, localVars: Set<string>) {
        this.expr = expr; this.block = block; this.localVars = localVars;
    }
    peek() { return this.pos < this.expr.length ? this.expr[this.pos] : '\0'; }
    get() { return this.pos < this.expr.length ? this.expr[this.pos++] : '\0'; }
    skipWhitespace() { while (this.pos < this.expr.length && /\s/.test(this.expr[this.pos])) this.pos++; }
    
    matchString(s: string): boolean {
        this.skipWhitespace();
        if (this.pos + s.length <= this.expr.length && this.expr.substring(this.pos, this.pos + s.length) === s) {
            this.pos += s.length;
            return true;
        }
        return false;
    }
    parsePrimary(): string {
        this.skipWhitespace();
        const c = this.peek();
        if (c === '-') { this.get(); return `(-${this.parsePrimary()})`; }
        if (c === '+') { this.get(); return `(+${this.parsePrimary()})`; }
        if (c === '!') { this.get(); return `((${this.parsePrimary()} === 0.0) ? 1.0 : 0.0)`; }
        if (c === '(') {
            this.get();
            const val = this.parseTernary();
            this.skipWhitespace();
            if (this.peek() === ')') this.get();
            return `(${val})`;
        }
        if (c === '"' || c === '\'') {
            this.get();
            let str = c;
            while (this.pos < this.expr.length && this.expr[this.pos] !== c) {
                str += this.get();
            }
            if (this.pos < this.expr.length) str += this.get();
            return str;
        }
        if (/[0-9.]/.test(c)) {
            let num = "";
            while (this.pos < this.expr.length && /[0-9.eE+-]/.test(this.expr[this.pos])) {
                const curr = this.expr[this.pos];
                if ((curr === '-' || curr === '+') && num.length > 0 && !/[eE]/.test(num[num.length - 1])) break;
                num += this.get();
            }
            return num;
        }
        if (/[a-zA-Z_]/.test(c)) {
            let name = "";
            while (this.pos < this.expr.length && /[a-zA-Z0-9_]/.test(this.expr[this.pos])) name += this.get();
            this.skipWhitespace();
            
            // Check for array syntax: name[idx_expr]
            if (this.peek() === '[') {
                this.get(); // consume '['
                const idx = this.parseTernary();
                this.skipWhitespace();
                if (this.peek() === ']') this.get(); // consume ']'
                
                if (name === "inputs") {
                    const portIdx = resolve_port_index(idx, this.block.inputs);
                    if (portIdx !== -1) {
                        return `(inputs[${portIdx}])`;
                    }
                    return `(inputs[Math.round(${idx})])`;
                }
                if (name === "outputs") {
                    const portIdx = resolve_port_index(idx, this.block.outputs);
                    if (portIdx !== -1) {
                        return `(outputs[${portIdx}])`;
                    }
                    return `(outputs[Math.round(${idx})])`;
                }
                if (name === "state" || name === "params") {
                    const cleanKey = idx.replace(/['"`]/g, '').trim();
                    return `${name}["${cleanKey}"]`;
                }
                // Check if it's a state array element
                if (this.block.state_arrays[name] !== undefined) {
                    return `(state_arrays["${name}"][Math.round(${idx})])`;
                }
                return `0.0`;
            }
            
            // Check if it's a math function
            if (this.peek() === '(') {
                this.get();
                const arg1 = this.parseTernary();
                this.skipWhitespace();
                let arg2 = "";
                if (this.peek() === ',') { this.get(); arg2 = this.parseTernary(); }
                this.skipWhitespace();
                if (this.peek() === ')') this.get();
                
                if (name === "sin") return `Math.sin(${arg1})`;
                if (name === "cos") return `Math.cos(${arg1})`;
                if (name === "tan") return `Math.tan(${arg1})`;
                if (name === "abs") return `Math.abs(${arg1})`;
                if (name === "sqrt") return `Math.sqrt(Math.abs(${arg1}))`;
                if (name === "exp") return `Math.exp(${arg1})`;
                if (name === "log") return `Math.log(Math.abs(${arg1}) + 1e-15)`;
                if (name === "max") return `Math.max(${arg1}, ${arg2})`;
                if (name === "min") return `Math.min(${arg1}, ${arg2})`;
                if (name === "pow") return `Math.pow(${arg1}, ${arg2})`;
            }
            
            if (this.localVars.has(name)) return name;
            if (name in this.block.state) return `state["${name}"]`;
            if (name in this.block.params) return `params["${name}"]`;
            if (name === "time") return `time`;
            if (name === "pi" || name === "PI" || name === "M_PI") return `Math.PI`;
            if (name in this.block.state_arrays) {
                return `state_arrays["${name}"]`;
            }
            this.localVars.add(name);
            return name;
        }
        return "0.0";
    }
    parsePower(): string {
        let val = this.parsePrimary();
        this.skipWhitespace();
        while (this.peek() === '^') {
            this.get();
            val = `Math.pow(${val}, ${this.parsePrimary()})`;
            this.skipWhitespace();
        }
        return val;
    }
    parseFactor(): string {
        let val = this.parsePower();
        this.skipWhitespace();
        while (this.peek() === '*' || this.peek() === '/' || this.peek() === '%') {
            const op = this.get();
            const r = this.parsePower();
            if (op === '*') val = `(${val} * ${r})`;
            else if (op === '/') val = `(Math.abs(${r}) > 1e-30 ? ${val} / ${r} : 0.0)`;
            else if (op === '%') val = `(Math.abs(${r}) > 1e-30 ? ${val} % ${r} : 0.0)`;
            this.skipWhitespace();
        }
        return val;
    }
    parseExpression(): string {
        let val = this.parseFactor();
        this.skipWhitespace();
        while (this.peek() === '+' || this.peek() === '-') {
            const op = this.get();
            const r = this.parseFactor();
            val = `(${val} ${op} ${r})`;
            this.skipWhitespace();
        }
        return val;
    }
    parseComparison(): string {
        let val = this.parseExpression();
        while (true) {
            if (this.matchString(">=")) {
                val = `(${val} >= ${this.parseExpression()} ? 1.0 : 0.0)`;
            } else if (this.matchString("<=")) {
                val = `(${val} <= ${this.parseExpression()} ? 1.0 : 0.0)`;
            } else if (this.matchString(">")) {
                val = `(${val} > ${this.parseExpression()} ? 1.0 : 0.0)`;
            } else if (this.matchString("<")) {
                val = `(${val} < ${this.parseExpression()} ? 1.0 : 0.0)`;
            } else {
                break;
            }
        }
        return val;
    }
    parseEquality(): string {
        let val = this.parseComparison();
        while (true) {
            if (this.matchString("==")) {
                val = `(${val} === ${this.parseComparison()} ? 1.0 : 0.0)`;
            } else if (this.matchString("!=")) {
                val = `(${val} !== ${this.parseComparison()} ? 1.0 : 0.0)`;
            } else {
                break;
            }
        }
        return val;
    }
    parseLogicalAnd(): string {
        let val = this.parseEquality();
        while (this.matchString("&&")) {
            val = `((${val} !== 0.0 && ${this.parseEquality()} !== 0.0) ? 1.0 : 0.0)`;
        }
        return val;
    }
    parseLogicalOr(): string {
        let val = this.parseLogicalAnd();
        while (this.matchString("||")) {
            val = `((${val} !== 0.0 || ${this.parseLogicalAnd()} !== 0.0) ? 1.0 : 0.0)`;
        }
        return val;
    }
    parseTernary(): string {
        const cond = this.parseLogicalOr();
        this.skipWhitespace();
        if (this.peek() === '?') {
            this.get();
            const val1 = this.parseTernary();
            this.skipWhitespace();
            if (this.peek() === ':') {
                this.get();
            }
            const val2 = this.parseTernary();
            return `(${cond} !== 0.0 ? ${val1} : ${val2})`;
        }
        return cond;
    }
    parse() { try { return this.parseTernary(); } catch (_) { return "0.0"; } }
}

function resolve_port_index(key: string, ports: string[]): number {
    const cleanKey = key.replace(/['"`]/g, '').trim();
    let idx = ports.indexOf(cleanKey);
    if (idx !== -1) return idx;
    for (let i = 0; i < ports.length; i++) {
        if (ports[i].endsWith("." + cleanKey)) return i;
    }
    const num = parseInt(cleanKey);
    if (!isNaN(num)) return num;
    return -1;
}

function compile_statement_to_js(s: Statement, block: CustomScriptBlock, localVars: Set<string>): string {
    if (s.type === "for") {
        const start = new JsExpressionCompiler(s.loop_start_expr!, block, localVars).parse();
        const limit = new JsExpressionCompiler(s.loop_limit_expr!, block, localVars).parse();
        const loop_var = s.loop_var!;
        localVars.add(loop_var);
        
        let js = `for (${loop_var} = Math.round(${start}); ${loop_var} < Math.round(${limit}); ${loop_var}++) {\n`;
        for (const child of s.body!) {
            js += compile_statement_to_js(child, block, localVars);
        }
        js += `}\n`;
        return js;
    } else if (s.type === "if") {
        const cond = new JsExpressionCompiler(s.condition_expr!, block, localVars).parse();
        let js = `if (${cond}) {\n`;
        for (const child of s.body!) {
            js += compile_statement_to_js(child, block, localVars);
        }
        js += `}`;
        if (s.else_if_branches) {
            for (const branch of s.else_if_branches) {
                const branchCond = new JsExpressionCompiler(branch.condition_expr, block, localVars).parse();
                js += ` else if (${branchCond}) {\n`;
                for (const child of branch.body) {
                    js += compile_statement_to_js(child, block, localVars);
                }
                js += `}`;
            }
        }
        if (s.else_body && s.else_body.length > 0) {
            js += ` else {\n`;
            for (const child of s.else_body) {
                js += compile_statement_to_js(child, block, localVars);
            }
            js += `}`;
        }
        js += `\n`;
        return js;
    } else {
        const rhs = new JsExpressionCompiler(s.rhs_expr!, block, localVars).parse();
        const cleanLhsKey = s.lhs_key!.replace(/['"`]/g, '').trim();
        if (s.lhs_type === "state") {
            return `state["${cleanLhsKey}"] ${s.op} ${rhs};\n`;
        } else if (s.lhs_type === "state_array") {
            const idx = new JsExpressionCompiler(s.lhs_idx_expr!, block, localVars).parse();
            return `state_arrays["${cleanLhsKey}"][Math.round(${idx})] ${s.op} ${rhs};\n`;
        } else if (s.lhs_type === "outputs") {
            const portIdx = resolve_port_index(s.lhs_key!, block.outputs);
            if (portIdx !== -1) {
                return `outputs[${portIdx}] ${s.op} ${rhs};\n`;
            } else {
                const idx = new JsExpressionCompiler(s.lhs_key!, block, localVars).parse();
                return `outputs[Math.round(${idx})] ${s.op} ${rhs};\n`;
            }
        } else {
            localVars.add(cleanLhsKey);
            return `${cleanLhsKey} ${s.op} ${rhs};\n`;
        }
    }
}

export class CustomScriptBlock {
    code_str: string; params: Record<string, number>;
    state: Record<string, number> = {}; inputs: string[] = []; outputs: string[] = [];
    init_statements: Statement[] = []; step_statements: Statement[] = [];
    state_arrays: Record<string, number> = {};
    last_vars: Record<string, number> = {};
    compiled_step_fn: Function | null = null;
    compiled_step_code: string | null = null;

    constructor(code: string, inputParams: Record<string, number>) {
        this.code_str = code; this.params = inputParams;
        this.discover_ports(); this.compile_code(); this.reset();
    }
    discover_ports() {
        const ports = discoverPortsJS(this.code_str);
        this.inputs = ports.inputs;
        this.outputs = ports.outputs;
    }
    normalize_expression(raw: string): string {
        return raw.replace(/\bstd::/g, '').replace(/\bMath\./g, '').replace(/\bmath\./g, '');
    }
    parse_legacy_statement(line: string, target: Statement[]) {
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
        
        if (lhs.startsWith("state[")) {
            lhs_type = "state";
            lhs_key = lhs.substring(6, lhs.length - 1).trim();
        } else if (lhs.startsWith("state_")) {
            lhs_type = "state";
            lhs_key = lhs.substring(6);
        } else if (lhs.startsWith("outputs[")) {
            lhs_type = "outputs";
            lhs_key = lhs.substring(8, lhs.length - 1).trim();
        } else if (lhs.startsWith("outputs_")) {
            lhs_type = "outputs";
            lhs_key = lhs.substring(8);
        }
        
        if (!lhs_key) return;
        target.push({
            type: "assign",
            lhs_type,
            lhs_key,
            op,
            rhs_expr: this.normalize_expression(rhs)
        });
    }
    parse_block(lines: string[], startIndex: { pos: number; closedByElse?: boolean }): Statement[] {
        const statements: Statement[] = [];
        
        while (startIndex.pos < lines.length) {
            let line = lines[startIndex.pos].trim();
            startIndex.pos++;
            
            if (line.includes("//")) {
                line = line.substring(0, line.indexOf("//")).trim();
            }
            if (!line || line === "{" || line === "pass;") continue;
            
            if (line === "}") {
                startIndex.closedByElse = false;
                break;
            }
            // Handle "} else if (...)" and "} else {" — break and rewind
            // so the parent if-parser's look-ahead picks them up
            if (line.startsWith("}") && /^}\s*else\b/.test(line)) {
                startIndex.pos--;
                startIndex.closedByElse = true;
                break;
            }
            
            const forMatch = line.match(/^for\s*\(\s*(?:int|double|auto)?\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^;]+)\s*;\s*\1\s*<\s*([^;]+)\s*;\s*[^)]+\)/);
            if (forMatch) {
                const loop_var = forMatch[1];
                const loop_start_expr = forMatch[2].trim();
                const loop_limit_expr = forMatch[3].trim();
                
                const body = this.parse_block(lines, startIndex);
                statements.push({
                    type: "for",
                    loop_var,
                    loop_start_expr,
                    loop_limit_expr,
                    body
                });
                continue;
            }
            
            // if / else if / else support
             const ifMatch = line.match(/^if\s*\((.+)\)\s*\{?\s*$/);
             if (ifMatch) {
                 const condition_expr = this.normalize_expression(ifMatch[1].trim());
                 const body = this.parse_block(lines, startIndex);
                 const else_if_branches: { condition_expr: string; body: Statement[] }[] = [];
                 let else_body: Statement[] | undefined;
                 
                 // Look ahead for else if / else
                 while (startIndex.pos < lines.length) {
                     const nextLine = lines[startIndex.pos].trim();
                     // Remove comments
                     const nextClean = nextLine.includes("//") ? nextLine.substring(0, nextLine.indexOf("//")).trim() : nextLine;
                     
                     // If next line starts with '}', it only belongs to us if it was the line that closed this if block's body
                     if (nextClean.startsWith("}")) {
                          if (startIndex.closedByElse === false) {
                              break; // Closes an outer block, stop look-ahead!
                          }
                     }
                     
                     const elseIfMatch = nextClean.match(/^}?\s*else\s+if\s*\((.+)\)\s*\{?\s*$/);
                     if (elseIfMatch) {
                         startIndex.pos++;
                         const branchCond = this.normalize_expression(elseIfMatch[1].trim());
                         const branchBody = this.parse_block(lines, startIndex);
                         else_if_branches.push({ condition_expr: branchCond, body: branchBody });
                         continue;
                     }
                     
                     const elseMatch = nextClean.match(/^}?\s*else\s*\{?\s*$/);
                     if (elseMatch) {
                         startIndex.pos++;
                         else_body = this.parse_block(lines, startIndex);
                         break;
                     }
                     
                     break; // No more else branches
                 }
                
                statements.push({
                    type: "if",
                    condition_expr,
                    body,
                    else_if_branches: else_if_branches.length > 0 ? else_if_branches : undefined,
                    else_body
                });
                continue;
            }
            
            if (line.endsWith(';')) line = line.slice(0, -1).trim();
            const eq = line.indexOf('=');
            if (eq === -1) continue;
            
            let lhs = line.substring(0, eq).trim();
            let rhs = line.substring(eq + 1).trim();
            
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
            
            const outMatch = lhs.match(/^outputs\s*\[\s*([^\]]+)\s*\]/);
            if (outMatch) {
                statements.push({
                    type: "assign",
                    lhs_type: "outputs",
                    lhs_key: outMatch[1].trim(),
                    op,
                    rhs_expr: this.normalize_expression(rhs)
                });
                continue;
            }
            
            const arrayMatch = lhs.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\[\s*([^\]]+)\s*\]/);
            if (arrayMatch && this.state_arrays[arrayMatch[1]]) {
                statements.push({
                    type: "assign",
                    lhs_type: "state_array",
                    lhs_key: arrayMatch[1],
                    lhs_idx_expr: arrayMatch[2].trim(),
                    op,
                    rhs_expr: this.normalize_expression(rhs)
                });
                continue;
            }
            
            const lhs_type = (lhs in this.state) ? "state" : "local";
            statements.push({
                type: "assign",
                lhs_type,
                lhs_key: lhs,
                op,
                rhs_expr: this.normalize_expression(rhs)
            });
        }
        
        return statements;
    }
    compile_code() {
        this.init_statements = []; this.step_statements = []; this.state_arrays = {};
        
        const isStandardC = this.code_str.includes("void step(");
        if (!isStandardC) {
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
                
                if (in_init) this.parse_legacy_statement(clean, this.init_statements);
                else if (in_step) this.parse_legacy_statement(clean, this.step_statements);
            }
            return;
        }
        
        const lines = this.code_str.split('\n');
        for (const line of lines) {
            let clean = line.trim();
            if (clean.includes("//")) clean = clean.substring(0, clean.indexOf("//")).trim();
            if (!clean) continue;
            if (clean.startsWith("void step")) break;
            
            const constMatch = clean.match(/^(?:const\s+double\s+)([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*;/);
            if (constMatch) {
                this.params[constMatch[1]] = parseFloat(constMatch[2]);
                continue;
            }
            const arrayMatch = clean.match(/^(?:double\s+)([a-zA-Z_][a-zA-Z0-9_]*)\s*\[\s*(\d+)\s*\](?:\s*=\s*\{([^}]*)\})?\s*;/);
            if (arrayMatch) {
                const name = arrayMatch[1];
                const size = parseInt(arrayMatch[2]);
                const defaultValsStr = arrayMatch[3];
                const defaultVals = defaultValsStr ? defaultValsStr.split(',').map(s => parseFloat(s.trim())) : [];
                for (let i = 0; i < size; i++) {
                    this.state[`${name}_${i}`] = defaultVals[i] ?? 0.0;
                }
                this.state_arrays[name] = size;
                continue;
            }
            const scalarMatch = clean.match(/^(?:double\s+)([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*;/);
            if (scalarMatch) {
                this.state[scalarMatch[1]] = parseFloat(scalarMatch[2]);
                continue;
            }
            
            const legacyMatch = clean.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*;/);
            if (legacyMatch) {
                const name = legacyMatch[1];
                const val = parseFloat(legacyMatch[2]);
                if (!(name in this.state) && !(name in this.params)) {
                    this.params[name] = val;
                }
            }
        }
        
        let in_step = false;
        const stepLines: string[] = [];
        for (const line of lines) {
            let clean = line.trim();
            if (clean.includes("void step(")) {
                in_step = true;
                continue;
            }
            if (in_step) {
                stepLines.push(line);
            }
        }
        
        const pos = { pos: 0 };
        this.step_statements = this.parse_block(stepLines, pos);
    }
    build_compiled_step() {
        try {
            const localVars = new Set<string>();
            let bodyJs = "";
            for (const s of this.step_statements) {
                bodyJs += compile_statement_to_js(s, this, localVars);
            }
            
            let headerJs = "";
            if (localVars.size > 0) {
                headerJs += `let ${Array.from(localVars).join(', ')};\n`;
            }
            
            headerJs += `const inputs = [];\n`;
            headerJs += `for (let i = 0; i < input_names.length; i++) {\n`;
            headerJs += `  inputs[i] = inputs_dict[input_names[i]] ?? 0.0;\n`;
            headerJs += `}\n`;
            
            headerJs += `const state_arrays = {};\n`;
            for (const [name, size] of Object.entries(this.state_arrays)) {
                headerJs += `state_arrays["${name}"] = [];\n`;
                for (let i = 0; i < size; i++) {
                    headerJs += `state_arrays["${name}"][${i}] = state["${name}_${i}"] ?? 0.0;\n`;
                }
            }
            
            headerJs += `const outputs = [];\n`;
            for (let i = 0; i < this.outputs.length; i++) {
                headerJs += `outputs[${i}] = 0.0;\n`;
            }
            
            let footerJs = "";
            for (const [name, size] of Object.entries(this.state_arrays)) {
                for (let i = 0; i < size; i++) {
                    footerJs += `state["${name}_${i}"] = state_arrays["${name}"][${i}] ?? 0.0;\n`;
                }
            }
            
            footerJs += `const run_outputs = {};\n`;
            footerJs += `for (let i = 0; i < output_names.length; i++) {\n`;
            footerJs += `  run_outputs[output_names[i]] = outputs[i] ?? 0.0;\n`;
            footerJs += `}\n`;
            
            footerJs += `const last_vars = { time };\n`;
            footerJs += `for (const [k, v] of Object.entries(params)) last_vars["params_" + k] = v;\n`;
            footerJs += `for (const [k, v] of Object.entries(state)) last_vars["state_" + k] = v;\n`;
            footerJs += `for (let i = 0; i < input_names.length; i++) last_vars["inputs_" + input_names[i]] = inputs[i] ?? 0.0;\n`;
            footerJs += `for (let i = 0; i < output_names.length; i++) last_vars["outputs_" + output_names[i]] = outputs[i] ?? 0.0;\n`;
            
            for (const v of localVars) {
                footerJs += `last_vars["${v}"] = (typeof ${v} !== 'undefined') ? ${v} : 0.0;\n`;
            }
            
            footerJs += `block.last_vars = last_vars;\n`;
            footerJs += `return run_outputs;\n`;
            
            const fullCode = headerJs + bodyJs + footerJs;
            this.compiled_step_code = fullCode;
            this.compiled_step_fn = new Function("time", "inputs_dict", "state", "params", "input_names", "output_names", "block", fullCode);
        } catch (err) {
            console.error("Failed to precompile CustomScriptBlock step function:", err);
            this.compiled_step_fn = null;
        }
    }
    reset() {
        this.state = {};
        this.compile_code();
        this.build_compiled_step();
        
        const ev = new ExpressionEvaluator();
        const vars: Record<string, number> = {};
        for (const [k, v] of Object.entries(this.params)) vars["params_" + k] = v;
        
        for (const s of this.init_statements) {
            if (s.lhs_type === "state") {
                const val = ev.evaluate(s.rhs_expr!, vars, this);
                const cleanKey = s.lhs_key!.replace(/['"`]/g, '').trim();
                this.state[cleanKey] = val; vars["state_" + cleanKey] = val;
            }
        }
        this.last_vars = { ...vars };
    }
    execute_statements(statements: Statement[], vars: Record<string, number>, run_outputs: Record<string, number>, ev: ExpressionEvaluator) {
        for (const s of statements) {
            if (s.type === "for") {
                const start = Math.round(ev.evaluate(s.loop_start_expr!, vars, this));
                const limit = Math.round(ev.evaluate(s.loop_limit_expr!, vars, this));
                const loop_var = s.loop_var!;
                
                for (let val = start; val < limit; val++) {
                    vars[loop_var] = val;
                    this.execute_statements(s.body!, vars, run_outputs, ev);
                }
            } else if (s.type === "if") {
                const condVal = ev.evaluate(s.condition_expr!, vars, this);
                if (condVal !== 0.0) {
                    this.execute_statements(s.body!, vars, run_outputs, ev);
                } else {
                    let branchTaken = false;
                    if (s.else_if_branches) {
                        for (const branch of s.else_if_branches) {
                            const branchVal = ev.evaluate(branch.condition_expr, vars, this);
                            if (branchVal !== 0.0) {
                                this.execute_statements(branch.body, vars, run_outputs, ev);
                                branchTaken = true;
                                break;
                            }
                        }
                    }
                    if (!branchTaken && s.else_body) {
                        this.execute_statements(s.else_body, vars, run_outputs, ev);
                    }
                }
            } else if (s.type === "assign") {
                const rhs = ev.evaluate(s.rhs_expr!, vars, this);
                if (s.lhs_type === "state") {
                    if (s.op === "=") this.state[s.lhs_key!] = rhs;
                    else if (s.op === "+=") this.state[s.lhs_key!] = (this.state[s.lhs_key!] ?? 0.0) + rhs;
                    else if (s.op === "-=") this.state[s.lhs_key!] = (this.state[s.lhs_key!] ?? 0.0) - rhs;
                    else if (s.op === "*=") this.state[s.lhs_key!] = (this.state[s.lhs_key!] ?? 0.0) * rhs;
                    vars["state_" + s.lhs_key!] = this.state[s.lhs_key!];
                } else if (s.lhs_type === "state_array") {
                    const idx = Math.round(ev.evaluate(s.lhs_idx_expr!, vars, this));
                    const array_name = s.lhs_key!;
                    const state_key = `${array_name}_${idx}`;
                    
                    if (s.op === "=") this.state[state_key] = rhs;
                    else if (s.op === "+=") this.state[state_key] = (this.state[state_key] ?? 0.0) + rhs;
                    else if (s.op === "-=") this.state[state_key] = (this.state[state_key] ?? 0.0) - rhs;
                    else if (s.op === "*=") this.state[state_key] = (this.state[state_key] ?? 0.0) * rhs;
                    vars["state_" + state_key] = this.state[state_key];
                } else if (s.lhs_type === "outputs") {
                    const idx = Math.round(ev.evaluate(s.lhs_key!, vars, this));
                    const port_name = this.outputs[idx];
                    if (port_name) {
                        if (s.op === "=") run_outputs[port_name] = rhs;
                        else if (s.op === "+=") run_outputs[port_name] = (run_outputs[port_name] ?? 0.0) + rhs;
                        else if (s.op === "-=") run_outputs[port_name] = (run_outputs[port_name] ?? 0.0) - rhs;
                        else if (s.op === "*=") run_outputs[port_name] = (run_outputs[port_name] ?? 0.0) * rhs;
                        vars["outputs_" + port_name] = run_outputs[port_name];
                    }
                } else if (s.lhs_type === "local") {
                    if (s.op === "=") vars[s.lhs_key!] = rhs;
                    else if (s.op === "+=") vars[s.lhs_key!] = (vars[s.lhs_key!] ?? 0.0) + rhs;
                    else if (s.op === "-=") vars[s.lhs_key!] = (vars[s.lhs_key!] ?? 0.0) - rhs;
                    else if (s.op === "*=") vars[s.lhs_key!] = (vars[s.lhs_key!] ?? 0.0) * rhs;
                }
            }
        }
    }
    step(time: number, inputs_dict: Record<string, number>): Record<string, number> {
        if (this.compiled_step_fn) {
            try {
                return this.compiled_step_fn(time, inputs_dict, this.state, this.params, this.inputs, this.outputs, this);
            } catch (err) {
                console.error("Compiled step execution failed, falling back to interpreter:", err);
                if (this.compiled_step_code) {
                    console.log("COMPILED JS CODE:\n", this.compiled_step_code);
                }
            }
        }

        const run_outputs: Record<string, number> = {};
        for (const out of this.outputs) run_outputs[out] = 0.0;
        
        const vars: Record<string, number> = { time };
        for (const [k, v] of Object.entries(this.params)) vars["params_" + k] = v;
        for (const [k, v] of Object.entries(this.state)) vars["state_" + k] = v;
        for (const inp of this.inputs) vars["inputs_" + inp] = inputs_dict[inp] ?? 0.0;
        for (const out of this.outputs) vars["outputs_" + out] = 0.0;
        
        const ev = new ExpressionEvaluator();
        this.execute_statements(this.step_statements, vars, run_outputs, ev);
        
        this.last_vars = { ...vars };
        return run_outputs;
    }
}

export class CustomEBlock {
    code_str: string; params: Record<string, number>;
    state: Record<string, number> = {}; inputs: string[] = []; outputs: string[] = [];
    init_statements: Statement[] = []; step_statements: Statement[] = [];
    last_vars: Record<string, number> = {};
    terminalsCount: number;

    constructor(code: string, inputParams: Record<string, number>, terminalsCount: number) {
        let processedCode = code || "";
        processedCode = processedCode.replace(/outputs\.set\(\s*(['"`])(.*?)\1\s*,\s*([^;]*?)\)/g, 'outputs["$2"] = $3');
        this.code_str = processedCode; this.params = inputParams;
        this.terminalsCount = terminalsCount;
        this.discover_ports(); this.compile_code(); this.reset();
    }
    discover_ports() {
        this.inputs = Array.from({ length: this.terminalsCount }, (_, i) => `v${i + 1}`);
        this.outputs = Array.from({ length: this.terminalsCount }, (_, i) => `i${i + 1}`);
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

export const ANALOG_SWITCH_TYPES = ["MOSFET", "vg-FET", "IGBT", "IGBT_DIODE", "IGCT", "GTO", "THYRISTOR", "JFET", "BJT"];

export class CircuitSimulator {
    physical_stage: ComponentTS[] = []; control_loops: ComponentTS[] = [];
    sim_params = { t_end: 0.05, h: 1e-5, solver: "euler", step_type: "fixed" };
    node_to_idx: Record<string, number> = {}; L_to_idx: Record<string, number> = {}; V_to_idx: Record<string, number> = {};
    active_nodes: string[] = []; num_nodes = 0; num_L = 0; num_V = 0; dim = 0;
    M = new Matrix(0, 0); K_static = new Matrix(0, 0); w: number[] = [];
    diff_idx: number[] = []; alg_idx: number[] = []; is_alg_all_zero = false;
    resistors: ComponentTS[] = []; variable_resistors: ComponentTS[] = []; capacitors: ComponentTS[] = []; inductors: ComponentTS[] = [];
    voltage_sources: ComponentTS[] = []; switches: ComponentTS[] = []; voltmeters: ComponentTS[] = [];
    transformers: ComponentTS[] = []; all_windings: any[] = []; num_XFMR_windings = 0;
    sw_states: Record<string, string> = {}; control_states: Record<string, any> = {};
    custom_blocks: Record<string, CustomScriptBlock> = {};
    custom_eblocks: Record<string, CustomEBlock> = {};
    custom_eblocks_state: Record<string, any> = {};
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
                { key: "ammeters", type: "Ammeter" },
                { key: "custom_eblocks", type: "GEN_EBLOCK" }
            ];

            for (const cat of categories) {
                const list = physical[cat.key];
                if (Array.isArray(list)) {
                    for (const item of list) {
                        let compType = item.type || cat.type;
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
                            if (typeof v === "object" && v !== null) {
                                comp.parameters[k] = v;
                            } else {
                                comp.parameters[k] = String(v);
                            }
                        }

                        if (["Switch", "VariableResistor", "ControlledVoltageSource", "ControlledCurrentSource", ...ANALOG_SWITCH_TYPES].includes(compType) || item.control_signal) {
                            const sig = item.control_signal;
                            if (sig) {
                                if (compType === "Switch") comp.channels = { Switch: sig };
                                else if (ANALOG_SWITCH_TYPES.includes(compType)) comp.channels = { G: sig };
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
                { key: "plls", type: "PLL" },
                { key: "probes", type: "PROBE" },
                { key: "pwm_masters", type: "PWM_MASTER" }
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
                                    ? (item.type === "mux" ? "Mux" : item.type === "demux" ? "Demux" : "INTERNAL_VAR")
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
                        } else if (cat.type === "Gain" && (item.output || item.output_mag || item.output_q)) {
                            const chs: Record<string, string> = {};
                            if (item.output) chs.Out = item.output;
                            if (item.output_mag) chs.Mag = item.output_mag;
                            if (item.output_phase) chs.Phase = item.output_phase;
                            if (item.output_q) chs.Q = item.output_q;
                            if (item.output_qbar) chs.Q_bar = item.output_qbar;
                            if (item.input) chs.In = item.input;
                            if (item.input_d) chs.D = item.input_d;
                            if (item.input_j) chs.J = item.input_j;
                            if (item.input_k) chs.K = item.input_k;
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
                        } else if (cat.type === "PWM_MASTER") {
                            const chs: Record<string, string> = {};
                            if (item.input) chs.In = item.input;
                            if (Array.isArray(item.inputs)) {
                                item.inputs.forEach((inp: string, index: number) => {
                                    if (inp) chs[`In${index + 1}`] = inp;
                                });
                            }
                            if (Array.isArray(item.ext_phases)) {
                                item.ext_phases.forEach((ep: string, index: number) => {
                                    if (ep) chs[`ExtPhase${index + 1}`] = ep;
                                });
                            }
                            if (Array.isArray(item.outputs_direct)) {
                                item.outputs_direct.forEach((od: string, index: number) => {
                                    if (od) chs[`OutDirect${index + 1}`] = od;
                                });
                            }
                            if (Array.isArray(item.outputs_compl)) {
                                item.outputs_compl.forEach((oc: string, index: number) => {
                                    if (oc) chs[`OutCompl${index + 1}`] = oc;
                                });
                            }
                            comp.channels = chs;
                        } else if (cat.type === "Triangle_Carrier" && item.output) {
                            const chs: Record<string, string> = { Out: item.output };
                            if (item.input_phase) chs.Phase = item.input_phase;
                            if (item.input_freq) chs.Freq = item.input_freq;
                            comp.channels = chs;
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
                                        if (key) {
                                            const isNum = /^\d+$/.test(key);
                                            const portName = isNum ? (kw === "inputs" ? "In" + (parseInt(key) + 1) : "Out" + (parseInt(key) + 1)) : key;
                                            set.add(portName);
                                        }
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
                        } else if (cat.type === "routing" && item.type === "internal_var") {
                            comp.channels = { Out: item.output };
                            comp.parameters.probe_target = item.probe_target || "";
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
        this.transformers = []; this.all_windings = [];
        const nodes_set = new Set<string>();
        for (const c of this.physical_stage) { 
            for (const n of c.nodes) nodes_set.add(n); 
            if (c.parameters.plus_node) nodes_set.add(c.parameters.plus_node);
            if (c.parameters.minus_node) nodes_set.add(c.parameters.minus_node);
            if (c.type === "XFMR") {
                const prims = c.parameters.primary_windings || [];
                const secs = c.parameters.secondary_windings || [];
                for (const w of prims) {
                    if (w && w.nodes) {
                        for (const n of w.nodes) nodes_set.add(n);
                    }
                }
                for (const w of secs) {
                    if (w && w.nodes) {
                        for (const n of w.nodes) nodes_set.add(n);
                    }
                }
            }
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
            else if (["Switch", "Diode", "MOSFET", "vg-FET", "IGBT", "IGBT_DIODE", "IGCT", "GTO", "THYRISTOR", "JFET", "BJT"].includes(c.type)) this.switches.push(c);
            else if (c.type === "Voltmeter") this.voltmeters.push(c);
            else if (c.type === "XFMR") this.transformers.push(c);
        }

        for (const xfmr of this.transformers) {
            const prims = xfmr.parameters.primary_windings || [];
            const secs = xfmr.parameters.secondary_windings || [];
            
            let w_idx = 0;
            for (const w of prims) {
                this.all_windings.push({
                    transformer_id: xfmr.id,
                    nodes: w.nodes || [],
                    turns: parseScientific(w.turns ?? "100"),
                    type: "primary",
                    winding_index: w_idx++,
                    idx: -1
                });
            }
            for (const w of secs) {
                this.all_windings.push({
                    transformer_id: xfmr.id,
                    nodes: w.nodes || [],
                    turns: parseScientific(w.turns ?? "100"),
                    type: "secondary",
                    winding_index: w_idx++,
                    idx: -1
                });
            }
        }
        this.num_XFMR_windings = this.all_windings.length;

        this.num_L = this.inductors.length; this.num_V = this.voltage_sources.length;
        this.dim = this.num_nodes + this.num_L + this.num_V + this.num_XFMR_windings;
        this.M = new Matrix(this.dim, this.dim, 0.0); this.K_static = new Matrix(this.dim, this.dim, 0.0);
        this.w = new Array(this.dim).fill(0.0);

        for (let i = 0; i < this.num_L; i++) this.L_to_idx[this.inductors[i].id] = this.num_nodes + i;
        for (let i = 0; i < this.num_V; i++) this.V_to_idx[this.voltage_sources[i].id] = this.num_nodes + this.num_L + i;
        for (let i = 0; i < this.num_XFMR_windings; i++) {
            this.all_windings[i].idx = this.num_nodes + this.num_L + this.num_V + i;
        }

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

        // Stamp transformers equations
        for (const xfmr of this.transformers) {
            const txWindings = this.all_windings.filter(w => w.transformer_id === xfmr.id);
            if (txWindings.length === 0) continue;
            
            // 1. Stamp KCL contributions of all windings
            for (const w of txWindings) {
                const n1 = w.nodes[0] ?? "node_0", n2 = w.nodes[1] ?? "node_0";
                const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1;
                const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
                if (i1 >= 0) this.K_static.add(i1, w.idx, 1.0);
                if (i2 >= 0) this.K_static.add(i2, w.idx, -1.0);
            }
            
            const w0 = txWindings[0];
            // 2. Stamp Ampere's Law (MMF balance): Sum(N_k * I_wk) = 0 inside row w0.idx
            for (const w of txWindings) {
                this.K_static.add(w0.idx, w.idx, w.turns);
            }
            
            // 3. Stamp Faraday's Law (Voltage ratio): N_j * V0 - N0 * Vj = 0 inside row w_j.idx (for j > 0)
            const n0_1 = w0.nodes[0] ?? "node_0", n0_2 = w0.nodes[1] ?? "node_0";
            const i0_1 = (n0_1 !== "node_0") ? this.node_to_idx[n0_1] : -1;
            const i0_2 = (n0_2 !== "node_0") ? this.node_to_idx[n0_2] : -1;
            
            for (let j = 1; j < txWindings.length; j++) {
                const wj = txWindings[j];
                const nj_1 = wj.nodes[0] ?? "node_0", nj_2 = wj.nodes[1] ?? "node_0";
                const ij_1 = (nj_1 !== "node_0") ? this.node_to_idx[nj_1] : -1;
                const ij_2 = (nj_2 !== "node_0") ? this.node_to_idx[nj_2] : -1;
                
                // Row wj.idx: wj.turns * (V(w0_1) - V(w0_2)) - w0.turns * (V(wj_1) - V(wj_2)) = 0
                if (i0_1 >= 0) this.K_static.add(wj.idx, i0_1, wj.turns);
                if (i0_2 >= 0) this.K_static.add(wj.idx, i0_2, -wj.turns);
                if (ij_1 >= 0) this.K_static.add(wj.idx, ij_1, -w0.turns);
                if (ij_2 >= 0) this.K_static.add(wj.idx, ij_2, w0.turns);
            }
        }

        this.sw_states = {}; for (const sw of this.switches) this.sw_states[sw.id] = "OFF";
        this.control_states = {}; this.custom_blocks = {};
        for (const b of this.control_loops) {
            if (b.type === "PI_Controller") this.control_states[b.id] = { integral: 0.0 };
            else if (["PWM_Generator", "Triangle_Carrier", "PWM_MASTER"].includes(b.type)) this.control_states[b.id] = { time: 0.0 };
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

        this.custom_eblocks = {};
        for (const c of this.physical_stage) {
            if (c.type === "GEN_EBLOCK") {
                const termCount = parseInt(c.parameters.terminals) || 3;
                const bp: Record<string, number> = {};
                for (const [k, v] of Object.entries(c.parameters)) { 
                    if (!["code", "timestep", "plot_inputs", "plot_outputs", "plot_custom_vars", "terminals"].includes(k)) {
                        bp[k] = parseScientific(v);
                    }
                }
                const inst = new CustomEBlock(c.parameters.code ?? "", bp, termCount);
                this.custom_eblocks[c.id] = inst;

                const dt_block_str = c.parameters.timestep ?? "0";
                const dt_block = parseScientific(dt_block_str);

                this.control_states[c.id] = {
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

        // Add a tiny conductance to ground (gmin shunt) for every node to prevent singular matrices on floating nodes
        for (let i = 0; i < this.num_nodes; i++) {
            this.K_static.add(i, i, 1e-12);
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

    evaluateControls(time: number, w_curr: number[], cs: Record<string, any>, dt: number, ss: Record<string, string>, first = false, integrate = false, is_logging = false): Record<string, number> {
        const signals: Record<string, number> = {};
        for (const b of this.control_loops) {
            const out = b.channels.Out; if (!out && b.type !== "PROBE" && b.type !== "UnifiedProbe") continue;
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
                const extPhase = b.parameters.phase_source === 'external';
                const extFreq = b.parameters.freq_source === 'external';
                
                const phase_deg = extPhase ? (signals[b.channels.Phase] ?? 0.0) : parseScientific(b.parameters.phase ?? "0");
                const freq = extFreq ? (signals[b.channels.Freq] ?? 10000.0) : parseScientific(b.parameters.frequency ?? "10k");
                
                const min = parseScientific(b.parameters.min ?? "0");
                const max = parseScientific(b.parameters.max ?? "1");
                
                let t_norm = (time * freq + phase_deg / 360.0) % 1.0;
                if (t_norm < 0.0) t_norm += 1.0;
                
                signals[out] = (t_norm < 0.5) ? min + (max - min) * (t_norm / 0.5) : max - (max - min) * ((t_norm - 0.5) / 0.5);
            }
        }
        for (let iter = 0; iter < 3; iter++) {
            for (const c of this.physical_stage) {
                const outVM = c.channels.OutV || c.channels.Out;
                const outAM = c.channels.OutI || c.channels.Out;
                if (c.type === "Voltmeter" && outVM) {
                    const n1 = c.nodes[0] ?? "node_0", n2 = c.nodes[1] ?? "node_0";
                    const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
                    signals[outVM] = ((i1 >= 0) ? w_curr[i1] : 0.0) - ((i2 >= 0) ? w_curr[i2] : 0.0);
                } else if (c.type === "Ammeter" && outAM) {
                    const idx = this.V_to_idx[c.id]; signals[outAM] = (idx !== undefined) ? w_curr[idx] : 0.0;
                } else if (c.type === "UnifiedProbe") {
                    const tid = c.parameters.target; let v = 0.0, i = 0.0;
                    if (tid) {
                        const idParts = c.id.split('.');
                        const prefixPath = idParts.slice(0, -1).join('.');
                        const fullTid = prefixPath ? `${prefixPath}.${tid}` : tid;
                        const tc = this.physical_stage.find(x => x.id === fullTid);
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
                            } else if (["Switch", "Diode", "MOSFET", "vg-FET"].includes(tc.type)) {
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
                    if (orig === "OFFSET") {
                        signals[out] = val + parseScientific(b.parameters.offset ?? "0.0");
                    } else if (orig === "SIGNUM") {
                        signals[out] = val > 0.0 ? 1.0 : (val < 0.0 ? -1.0 : 0.0);
                    } else if (orig === "DATATYPE_CONV") {
                        const dt_type = b.parameters.datatype ?? "boolean";
                        if (dt_type === "boolean") {
                            signals[out] = val > 0.5 ? 1.0 : 0.0;
                        } else if (dt_type.startsWith("int") || dt_type.startsWith("uint")) {
                            signals[out] = Math.round(val);
                        } else {
                            signals[out] = val;
                        }
                    } else if (orig === "SATURATION") {
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
                    } else if (orig === "COMPARE_TO_CONSTANT") {
                        const op = b.parameters.operator ?? "==";
                        const cVal = parseScientific(b.parameters.constant ?? "0.0");
                        if (op === "==" || op === "=") signals[out] = (val === cVal) ? 1.0 : 0.0;
                        else if (op === "~=" || op === "!=") signals[out] = (val !== cVal) ? 1.0 : 0.0;
                        else if (op === "<") signals[out] = (val < cVal) ? 1.0 : 0.0;
                        else if (op === "<=") signals[out] = (val <= cVal) ? 1.0 : 0.0;
                        else if (op === ">") signals[out] = (val > cVal) ? 1.0 : 0.0;
                        else if (op === ">=") signals[out] = (val >= cVal) ? 1.0 : 0.0;
                        else signals[out] = 0.0;
                    } else if (orig === "MONOFLOP" || orig === "MONOSTABLE") {
                        const duration = parseScientific(b.parameters.duration ?? "0.1");
                        const edge = b.parameters.trigger_edge ?? "rising";
                        const retriggerable = (b.parameters.retriggerable === "true" || b.parameters.retriggerable === true);
                        if (!cs[b.id]) {
                            cs[b.id] = {
                                triggered: false,
                                trigger_time: -1.0,
                                prev_input: val
                            };
                        }
                        const st = cs[b.id];
                        let active = st.triggered;
                        let trigTime = st.trigger_time;
                        let triggerDetected = false;
                        const prevVal = st.prev_input;
                        if (edge === "rising") {
                            if (prevVal <= 0.5 && val > 0.5) triggerDetected = true;
                        } else if (edge === "falling") {
                            if (prevVal > 0.5 && val <= 0.5) triggerDetected = true;
                        } else {
                            if ((prevVal <= 0.5 && val > 0.5) || (prevVal > 0.5 && val <= 0.5)) triggerDetected = true;
                        }
                        if (triggerDetected) {
                            if (!active || retriggerable) {
                                active = true;
                                trigTime = time;
                            }
                        }
                        if (active && trigTime >= 0.0 && (time - trigTime) >= duration - 1e-11) {
                            active = false;
                        }
                        if (integrate && iter === 2) {
                            st.triggered = active;
                            st.trigger_time = trigTime;
                            st.prev_input = val;
                        }
                        signals[out] = active ? 1.0 : 0.0;
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
                    } else if (orig === "TURN_ON_DELAY") {
                        const delayDuration = parseScientific(b.parameters.delay ?? "0.05");
                        if (!cs[b.id]) {
                            cs[b.id] = { high_start_time: -1.0, prev_input_high: false };
                        }
                        const isHigh = val > 0.5;
                        if (integrate && iter === 2) {
                            if (isHigh) {
                                if (!cs[b.id].prev_input_high) {
                                    cs[b.id].high_start_time = time;
                                }
                            } else {
                                cs[b.id].high_start_time = -1.0;
                            }
                            cs[b.id].prev_input_high = isHigh;
                        }
                        
                        let outVal = 0.0;
                        if (isHigh) {
                            if (cs[b.id].high_start_time >= 0.0 && (time - cs[b.id].high_start_time) >= delayDuration) {
                                outVal = 1.0;
                            }
                        }
                        signals[out] = outVal;
                    } else if (orig === "MEMORY_BLOCK") {
                        const initialVal = parseScientific(b.parameters.initial_value ?? "0.0");
                        if (!cs[b.id]) {
                            cs[b.id] = { prev_val: initialVal, current_val: val, last_time: time };
                        }
                        if (integrate && iter === 2) {
                            if (time > cs[b.id].last_time) {
                                cs[b.id].prev_val = cs[b.id].current_val;
                                cs[b.id].current_val = val;
                                cs[b.id].last_time = time;
                            }
                        }
                        signals[out] = cs[b.id].prev_val;
                    } else if (orig === "QUANTIZER") {
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
                        const offset = parseScientific(b.parameters.offset ?? "0.0");
                        const direction = b.parameters.direction ?? "either";
                        if (!cs[b.id]) {
                            cs[b.id] = { prev_input: val, last_hit: 0.0 };
                        }
                        let hit = 0.0;
                        if (is_logging && cs[b.id].last_hit !== undefined) {
                            hit = cs[b.id].last_hit;
                        } else {
                            const prev = cs[b.id].prev_input;
                            if (direction === "rising" && prev < offset && val >= offset) {
                                hit = 1.0;
                            } else if (direction === "falling" && prev > offset && val <= offset) {
                                hit = 1.0;
                            } else if (direction === "either") {
                                if ((prev < offset && val >= offset) || (prev > offset && val <= offset)) {
                                    hit = 1.0;
                                }
                            }
                        }
                        
                        if (integrate && iter === 2) {
                            cs[b.id].prev_input = val;
                            cs[b.id].last_hit = hit;
                        }
                        signals[out] = hit;
                    } else if (orig === "TRANSFER_FCN") {
                        const numStr = b.parameters.num ?? "[1]";
                        const denStr = b.parameters.den ?? "[1 1]";
                        const parseVector = (s: any) => {
                            if (s === null || s === undefined) return [];
                            let str = String(s).trim();
                            let clean = str.replace(/[\[\]]/g, '');
                            return clean.split(/[\s,;]+/).filter(x => x.trim() !== '').map(x => parseFloat(x) || 0.0);
                        };
                        let num = parseVector(numStr);
                        let den = parseVector(denStr);
                        if (num.length === 0) num = [1.0];
                        if (den.length === 0) den = [1.0];
                        if (den.every(x => x === 0.0)) {
                            den = [1.0];
                        }
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
                                const bi = B[i]?.[0] ?? 0.0;
                                xDot[i] = ax + bi * val;
                            }
                            if (dt > 0.0 && !first && integrate && iter === 2) {
                                for (let i = 0; i < n; i++) {
                                    states[i] += xDot[i] * dt;
                                }
                            }
                            let cx = 0.0;
                            for (let j = 0; j < n; j++) {
                                cx += (C[0]?.[j] ?? 0.0) * states[j];
                            }
                            const d0 = D[0]?.[0] ?? 0.0;
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
                                    cx += (C[0]?.[j] ?? 0.0) * initStates[j];
                                }
                                const d0 = D[0]?.[0] ?? 0.0;
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
                                    const bi = B[i]?.[0] ?? 0.0;
                                    x_temp[i] = ax + bi * u_held;
                                }
                                let cx = 0.0;
                                for (let j = 0; j < n; j++) {
                                    cx += (C[0]?.[j] ?? 0.0) * x_temp[j];
                                }
                                const d0 = D[0]?.[0] ?? 0.0;
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
                    } else if (orig === "DISCRETE_MEAN") {
                        const ts = parseScientific(b.parameters.ts ?? "100u");
                        const period = parseScientific(b.parameters.period ?? "0.02");
                        const initialVal = parseScientific(b.parameters.initial_value ?? "0.0");
                        
                        const k = Math.floor((time + 1e-11) / ts);
                        let N = Math.round(period / ts);
                        if (N < 1) N = 1;
                        
                        if (!cs[b.id]) {
                            cs[b.id] = {
                                history: new Array(N).fill(initialVal),
                                idx: 0,
                                last_sample_k: k,
                                held_out: initialVal
                            };
                        }
                        
                        let hist_temp = [...cs[b.id].history];
                        let idx_temp = cs[b.id].idx;
                        let y_temp = cs[b.id].held_out;
                        
                        if (is_logging && cs[b.id].held_out !== undefined) {
                            y_temp = cs[b.id].held_out;
                        } else {
                            if (k > cs[b.id].last_sample_k) {
                                hist_temp[idx_temp] = val;
                                idx_temp = (idx_temp + 1) % N;
                                const sum = hist_temp.reduce((a, x) => a + x, 0.0);
                                y_temp = sum / N;
                            }
                        }
                        
                        if (integrate && iter === 2) {
                            if (k > cs[b.id].last_sample_k) {
                                cs[b.id].history = hist_temp;
                                cs[b.id].idx = idx_temp;
                                cs[b.id].held_out = y_temp;
                                cs[b.id].last_sample_k = k;
                            }
                        }
                        signals[out] = y_temp;
                    } else if (orig === "DISCRETE_PID") {
                        const Kp = parseScientific(b.parameters.Kp ?? "1.0");
                        const Ki = parseScientific(b.parameters.Ki ?? "10.0");
                        const Kd = parseScientific(b.parameters.Kd ?? "0.0");
                        const Tf = parseScientific(b.parameters.Tf ?? "0.001");
                        const ts = parseScientific(b.parameters.ts ?? "100u");
                        const method = b.parameters.method ?? "Forward Euler";
                        
                        const k = Math.floor((time + 1e-11) / ts);
                        
                        if (!cs[b.id]) {
                            cs[b.id] = {
                                held_out: 0.0,
                                prev_error: 0.0,
                                held_I: 0.0,
                                held_D: 0.0,
                                last_sample_k: k
                            };
                        }
                        
                        let prev_err = cs[b.id].prev_error;
                        let I_prev = cs[b.id].held_I;
                        let D_prev = cs[b.id].held_D;
                        let y_temp = cs[b.id].held_out;
                        
                        let I_new = I_prev;
                        let D_new = D_prev;
                        
                        if (is_logging && cs[b.id].held_out !== undefined) {
                            y_temp = cs[b.id].held_out;
                        } else {
                            if (k > cs[b.id].last_sample_k) {
                                const e = val;
                                const P = Kp * e;
                                
                                if (method === "Forward Euler") {
                                    I_new = I_prev + Ki * ts * prev_err;
                                } else if (method === "Backward Euler") {
                                    I_new = I_prev + Ki * ts * e;
                                } else if (method === "Trapezoidal") {
                                    I_new = I_prev + 0.5 * Ki * ts * (e + prev_err);
                                }
                                
                                D_new = (Tf / (Tf + ts)) * D_prev + (Kd / (Tf + ts)) * (e - prev_err);
                                
                                y_temp = P + I_new + D_new;
                            }
                        }
                        
                        if (integrate && iter === 2) {
                            if (k > cs[b.id].last_sample_k) {
                                cs[b.id].prev_error = val;
                                cs[b.id].held_I = I_new;
                                cs[b.id].held_D = D_new;
                                cs[b.id].held_out = y_temp;
                                cs[b.id].last_sample_k = k;
                            }
                        }
                        signals[out] = y_temp;
                    } else if (orig === "PERIODIC_IMP_AVG") {
                        const trig = signals[b.channels.Ctrl] ?? 0.0;
                        const initialVal = parseScientific(b.parameters.initial_value ?? "0.0");
                        if (!cs[b.id]) {
                            cs[b.id] = { prev_trig: 0.0, integral: 0.0, period_time: 0.0, held_out: initialVal, prev_u: val, last_t: time };
                        }
                        const st = cs[b.id];
                        let y_temp = st.held_out;
                        if (is_logging) {
                            y_temp = st.held_out;
                        } else {
                            const is_rising = (st.prev_trig < 0.5 && trig >= 0.5);
                            if (is_rising && st.period_time > 0.0) {
                                // Complete one period: output = integral / period_time
                                y_temp = st.integral / st.period_time;
                            } else {
                                y_temp = st.held_out;
                            }
                            if (integrate && iter === 2) {
                                const dt_step = (dt > 0.0) ? dt : 0.0;
                                if (is_rising && st.period_time > 0.0) {
                                    st.integral = 0.0;
                                    st.period_time = 0.0;
                                    st.held_out = y_temp;
                                } else {
                                    // Trapezoidal integration
                                    st.integral += 0.5 * (val + st.prev_u) * dt_step;
                                    st.period_time += dt_step;
                                }
                                st.prev_trig = trig;
                                st.prev_u = val;
                                st.last_t = time;
                            }
                        }
                        signals[out] = y_temp;
                    } else {
                        signals[out] = parseScientific(b.parameters.K ?? "1") * val;
                    }
                } else if (b.type === "Gain" && !out && b.parameters.original_type === "FOURIER_TRANS") {
                    // FOURIER_TRANS: multi-output Gain with Mag and Phase channels
                    const outMag = b.channels.Mag;
                    const outPhase = b.channels.Phase;
                    const uVal = signals[b.channels.In] ?? 0.0;
                    const f = parseScientific(b.parameters.f ?? "50.0");
                    const harmonic = parseInt(b.parameters.harmonic ?? "1") || 1;
                    const ts = parseScientific(b.parameters.ts ?? "100u");
                    const k = Math.floor((time + 1e-11) / ts);
                    let N = Math.round(1.0 / (f * ts));
                    if (N < 2) N = 2;
                    if (!cs[b.id]) {
                        cs[b.id] = {
                            history: new Array(N).fill(0.0),
                            idx: 0,
                            last_sample_k: k,
                            held_mag: 0.0,
                            held_phase: 0.0
                        };
                    }
                    const st = cs[b.id];
                    let mag_temp = st.held_mag;
                    let phase_temp = st.held_phase;
                    if (is_logging) {
                        mag_temp = st.held_mag;
                        phase_temp = st.held_phase;
                    } else {
                        if (k > st.last_sample_k) {
                            // Update circular buffer
                            st.history[st.idx] = uVal;
                            st.idx = (st.idx + 1) % N;
                            // Running DFT at harmonic frequency
                            const omega = 2.0 * Math.PI * harmonic / N;
                            let Re = 0.0, Im = 0.0;
                            for (let i = 0; i < N; i++) {
                                const sample = st.history[i];
                                Re += sample * Math.cos(omega * i);
                                Im += sample * Math.sin(omega * i);
                            }
                            Re = (2.0 / N) * Re;
                            Im = (2.0 / N) * Im;
                            mag_temp = Math.sqrt(Re * Re + Im * Im);
                            phase_temp = Math.atan2(-Im, Re) * (180.0 / Math.PI);
                        }
                        if (integrate && iter === 2) {
                            if (k > st.last_sample_k) {
                                st.held_mag = mag_temp;
                                st.held_phase = phase_temp;
                                st.last_sample_k = k;
                            }
                        }
                    }
                    if (outMag) signals[outMag] = mag_temp;
                    if (outPhase) signals[outPhase] = phase_temp;
                } else if (b.type === "Gain" && !out && (b.parameters.original_type === "D_FLIP_FLOP" || b.parameters.original_type === "JK_FLIP_FLOP")) {
                    const orig = b.parameters.original_type;
                    const clkVal = signals[b.channels.Ctrl] ?? 0.0;
                    if (!cs[b.id]) {
                        const initVal = parseScientific(b.parameters.initial_state ?? "0.0") > 0.5 ? 1.0 : 0.0;
                        cs[b.id] = {
                            q_state: initVal,
                            prev_clk: clkVal
                        };
                    }
                    const st = cs[b.id];
                    let q = st.q_state;
                    const prevClk = st.prev_clk;
                    const edge = b.parameters.trigger_edge ?? "rising";
                    let edgeDetected = false;
                    if (edge === "rising") {
                        if (prevClk <= 0.5 && clkVal > 0.5) edgeDetected = true;
                    } else {
                        if (prevClk > 0.5 && clkVal <= 0.5) edgeDetected = true;
                    }
                    if (edgeDetected) {
                        if (orig === "D_FLIP_FLOP") {
                            const dVal = signals[b.channels.D] ?? 0.0;
                            q = dVal > 0.5 ? 1.0 : 0.0;
                        } else if (orig === "JK_FLIP_FLOP") {
                            const jVal = signals[b.channels.J] ?? 0.0;
                            const kVal = signals[b.channels.K] ?? 0.0;
                            const J = jVal > 0.5;
                            const K = kVal > 0.5;
                            if (J && K) {
                                q = q > 0.5 ? 0.0 : 1.0;
                            } else if (J) {
                                q = 1.0;
                            } else if (K) {
                                q = 0.0;
                            }
                        }
                    }
                    if (integrate && iter === 2) {
                        st.q_state = q;
                        st.prev_clk = clkVal;
                    }
                    if (b.channels.Q) signals[b.channels.Q] = q;
                    if (b.channels.Q_bar) signals[b.channels.Q_bar] = q > 0.5 ? 0.0 : 1.0;
                } else if (b.type === "SummingJunction" && out) {
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
                } else if (b.type === "PI_Controller" && out) {
                    const error = signals[b.channels.In] ?? 0.0;
                    if (!cs[b.id]) {
                        cs[b.id] = { integral: 0.0, prev_error: error, prev_deriv: 0.0 };
                    }
                    const Kp = parseScientific(b.parameters.Kp ?? "2.5");
                    const Ki = parseScientific(b.parameters.Ki ?? "50.0");
                    const Kd = parseScientific(b.parameters.Kd ?? "0.0");
                    const Tf = 0.01;
                    
                    let deriv = cs[b.id].prev_deriv;
                    if (Kd > 0.0 && dt > 0.0 && !first && integrate && iter === 2) {
                        deriv = (Tf / (dt + Tf)) * cs[b.id].prev_deriv + (Kd / (dt + Tf)) * (error - cs[b.id].prev_error);
                    }
                    
                    const u_unsat = Kp * error + Ki * cs[b.id].integral + deriv;
                    
                    const limit_output = b.parameters.limit_output === 'true';
                    const upper_limit = parseScientific(b.parameters.upper_limit ?? "1.0");
                    const lower_limit = parseScientific(b.parameters.lower_limit ?? "-1.0");
                    const anti_windup = b.parameters.anti_windup === 'true';
                    
                    let u = u_unsat;
                    if (limit_output) {
                        if (u > upper_limit) u = upper_limit;
                        else if (u < lower_limit) u = lower_limit;
                    }
                    
                    if (dt > 0.0 && !first && integrate && iter === 2) {
                        let integrate_ok = true;
                        if (limit_output && anti_windup) {
                            if (u_unsat > upper_limit && error > 0) {
                                integrate_ok = false;
                            } else if (u_unsat < lower_limit && error < 0) {
                                integrate_ok = false;
                            }
                        }
                        if (integrate_ok) {
                            cs[b.id].integral += error * dt;
                        }
                        if (Kd > 0.0) {
                            cs[b.id].prev_deriv = deriv;
                        }
                        cs[b.id].prev_error = error;
                    }
                    signals[out] = u;
                } else if (b.type === "ContinuousPID" && out) {
                    const error = signals[b.channels.In] ?? 0.0;
                    if (!cs[b.id]) {
                        cs[b.id] = { integral: 0.0, prev_error: error, prev_deriv: 0.0 };
                    }
                    const Kp = parseScientific(b.parameters.Kp ?? "1.0");
                    const Ki = parseScientific(b.parameters.Ki ?? "0.0");
                    const Kd = parseScientific(b.parameters.Kd ?? "0.0");
                    const Tf = parseScientific(b.parameters.Tf ?? "0.01");
                    
                    let deriv = cs[b.id].prev_deriv;
                    if (Kd > 0.0 && dt > 0.0 && !first && integrate && iter === 2) {
                        deriv = (Tf / (dt + Tf)) * cs[b.id].prev_deriv + (Kd / (dt + Tf)) * (error - cs[b.id].prev_error);
                    }
                    
                    const u_unsat = Kp * error + Ki * cs[b.id].integral + deriv;
                    
                    const limit_output = b.parameters.limit_output === 'true';
                    const upper_limit = parseScientific(b.parameters.upper_limit ?? "1.0");
                    const lower_limit = parseScientific(b.parameters.lower_limit ?? "-1.0");
                    const anti_windup = b.parameters.anti_windup === 'true';
                    
                    let u = u_unsat;
                    if (limit_output) {
                        if (u > upper_limit) u = upper_limit;
                        else if (u < lower_limit) u = lower_limit;
                    }
                    
                    if (dt > 0.0 && !first && integrate && iter === 2) {
                        let integrate_ok = true;
                        if (limit_output && anti_windup) {
                            if (u_unsat > upper_limit && error > 0) {
                                integrate_ok = false;
                            } else if (u_unsat < lower_limit && error < 0) {
                                integrate_ok = false;
                            }
                        }
                        if (integrate_ok) {
                            cs[b.id].integral += error * dt;
                        }
                        if (Kd > 0.0) {
                            cs[b.id].prev_deriv = deriv;
                        }
                        cs[b.id].prev_error = error;
                    }
                    signals[out] = u;
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
                    
                    if (dt > 0.0 && !first && integrate && iter === 2) {
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
                } else if (b.type === "PWM_MASTER") {
                    const N = parseInt(b.parameters.num_carriers) || 3;
                    const fc = parseScientific(b.parameters.fc ?? "10k");
                    const deadTime = parseScientific(b.parameters.dead_time ?? "1u");
                    
                    let config: any[] = [];
                    try {
                        config = JSON.parse(b.parameters.config || '[]');
                    } catch (_) {}

                    if (!cs[b.id] || !cs[b.id].last_target_direct) {
                        cs[b.id] = {
                            time: 0.0,
                            last_target_direct: Array(N + 1).fill(0),
                            last_target_compl: Array(N + 1).fill(0),
                            last_transition_time_direct: Array(N + 1).fill(0.0),
                            last_transition_time_compl: Array(N + 1).fill(0.0),
                            direct_out: Array(N + 1).fill(0),
                            compl_out: Array(N + 1).fill(0)
                        };
                    }

                    const stateObj = cs[b.id];
                    const isCommon = b.parameters.common_modulation === 'true';
                    const Tc = 1.0 / fc;

                    for (let idx = 1; idx <= N; idx++) {
                        const vMod = isCommon 
                            ? (signals[b.channels.In] ?? 0.0) 
                            : (signals[b.channels[`In${idx}`]] ?? 0.0);

                        const cConf = config.find((c: any) => c.id === idx);
                        let phaseDeg = 0.0;
                        let lOffset = 0.0;
                        
                        if (cConf) {
                            if (idx > 1 && cConf.phase_source === 'external') {
                                const extPhaseChan = b.channels[`ExtPhase${idx}`];
                                phaseDeg = (extPhaseChan && signals[extPhaseChan] !== undefined) ? signals[extPhaseChan] : 0.0;
                            } else {
                                phaseDeg = parseFloat(cConf.phase) || 0.0;
                            }
                            lOffset = cConf.level_shift ? (parseFloat(cConf.level_offset) || 0.0) : 0.0;
                        }

                        const tOffset = (phaseDeg / 360.0) * Tc;
                        let tLocal = (time - tOffset) % Tc;
                        if (tLocal < 0) tLocal += Tc;

                        const triVal = (tLocal < Tc / 2.0) 
                            ? (tLocal / (Tc / 2.0)) 
                            : (1.0 - (tLocal - Tc / 2.0) / (Tc / 2.0));
                            
                        const vCarrier = triVal + lOffset;
                        
                        const targetDirect = (vMod >= vCarrier) ? 1 : 0;
                        const targetCompl = (targetDirect === 0) ? 1 : 0;

                        if (integrate && iter === 2) {
                            if (targetDirect === 1 && stateObj.last_target_direct[idx] === 0) {
                                stateObj.last_transition_time_direct[idx] = time;
                            }
                            if (targetCompl === 1 && stateObj.last_target_compl[idx] === 0) {
                                stateObj.last_transition_time_compl[idx] = time;
                            }

                            stateObj.last_target_direct[idx] = targetDirect;
                            stateObj.last_target_compl[idx] = targetCompl;

                            stateObj.direct_out[idx] = (targetDirect === 1 && (time - stateObj.last_transition_time_direct[idx] >= deadTime)) ? 1 : 0;
                            stateObj.compl_out[idx] = (targetCompl === 1 && (time - stateObj.last_transition_time_compl[idx] >= deadTime)) ? 1 : 0;
                        } else {
                            let transTimeDirect = stateObj.last_transition_time_direct[idx];
                            if (targetDirect === 1 && stateObj.last_target_direct[idx] === 0) {
                                transTimeDirect = time;
                            }
                            let transTimeCompl = stateObj.last_transition_time_compl[idx];
                            if (targetCompl === 1 && stateObj.last_target_compl[idx] === 0) {
                                transTimeCompl = time;
                            }

                            stateObj.direct_out[idx] = (targetDirect === 1 && (time - transTimeDirect >= deadTime)) ? 1 : 0;
                            stateObj.compl_out[idx] = (targetCompl === 1 && (time - transTimeCompl >= deadTime)) ? 1 : 0;
                        }

                        const outDirectChan = b.channels[`OutDirect${idx}`];
                        const outComplChan = b.channels[`OutCompl${idx}`];
                        if (outDirectChan) signals[outDirectChan] = stateObj.direct_out[idx];
                        if (outComplChan) signals[outComplChan] = stateObj.compl_out[idx];
                    }
                } else if (b.type === "Comparator" && out) {
                    signals[out] = ((signals[b.channels.Plus] ?? 0) >= (signals[b.channels.Minus] ?? 0)) ? 1 : 0;
                } else if (b.type === "AND_Gate" && out) {
                    signals[out] = ((signals[b.channels.A] ?? 0) > 0.5 && (signals[b.channels.B] ?? 0) > 0.5) ? 1 : 0;
                } else if (b.type === "OR_Gate" && out) {
                    signals[out] = ((signals[b.channels.A] ?? 0) > 0.5 || (signals[b.channels.B] ?? 0) > 0.5) ? 1 : 0;
                } else if (b.type === "NOT_Gate" && out) {
                    signals[out] = ((signals[b.channels.In] ?? 0) < 0.5) ? 1 : 0;
                } else if (b.type === "Product" && out) {
                    const ctrlSig = b.channels.Ctrl;
                    if (ctrlSig && (signals[ctrlSig] ?? 0.0) <= 0.5) {
                        signals[out] = 0.0;
                    } else {
                        const orig = b.parameters.original_type;
                        const val1 = signals[b.channels.In1] ?? 0;
                        const val2 = signals[b.channels.In2] ?? 0;
                        if (orig === "DIVIDE") {
                            signals[out] = val1 / (val2 || 1e-15);
                        } else if (orig === "MIN_MAX") {
                            const f = b.parameters.function ?? "max";
                            signals[out] = (f === "max") ? Math.max(val1, val2) : Math.min(val1, val2);
                        } else if (orig === "LOGIC_OP") {
                            const op = b.parameters.operator ?? "AND";
                            if (op === "AND") signals[out] = (val1 > 0.5 && val2 > 0.5) ? 1.0 : 0.0;
                            else if (op === "OR") signals[out] = (val1 > 0.5 || val2 > 0.5) ? 1.0 : 0.0;
                            else if (op === "XOR") signals[out] = ((val1 > 0.5) !== (val2 > 0.5)) ? 1.0 : 0.0;
                            else signals[out] = 0.0;
                        } else if (orig === "RELATIONAL_OPERATOR") {
                            const op = b.parameters.operator ?? "==";
                            if (op === "==" || op === "=") signals[out] = (val1 === val2) ? 1.0 : 0.0;
                            else if (op === "~=" || op === "!=") signals[out] = (val1 !== val2) ? 1.0 : 0.0;
                            else if (op === "<") signals[out] = (val1 < val2) ? 1.0 : 0.0;
                            else if (op === "<=") signals[out] = (val1 <= val2) ? 1.0 : 0.0;
                            else if (op === ">") signals[out] = (val1 > val2) ? 1.0 : 0.0;
                            else if (op === ">=") signals[out] = (val1 >= val2) ? 1.0 : 0.0;
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
                } else if (b.type === "CustomFunction" && out) {
                    signals[out] = new ExpressionEvaluator().evaluate(b.parameters.expr ?? "u * 2", { u: signals[b.channels.In] ?? 0 });
                } else if (b.type === "Mux" && out) {
                    signals[out] = signals[b.channels.In1] ?? 0;
                } else if (b.type === "Demux") {
                    const iv = signals[b.channels.In] ?? 0;
                    if (b.channels.Out1) signals[b.channels.Out1] = iv;
                    if (b.channels.Out2) signals[b.channels.Out2] = 0.0;
                } else if (b.type === "INTERNAL_VAR" && out) {
                    const target = b.parameters.probe_target;
                    let val = 0.0;
                    if (target) {
                        if (target.startsWith("V_") || target.startsWith("I_") || target.startsWith("Ctrl_") || target.startsWith("Power_") || target.startsWith("Conducting_")) {
                            const parts = target.split("_");
                            const prefix = parts[0];
                            const compId = parts.slice(1).join("_");
                            
                            const tc = this.physical_stage.find(x => x.id === compId);
                            if (tc) {
                                const n1 = tc.nodes[0] ?? "node_0", n2 = tc.nodes[1] ?? "node_0";
                                const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1;
                                const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
                                const v = ((i1 >= 0) ? w_curr[i1] : 0.0) - ((i2 >= 0) ? w_curr[i2] : 0.0);
                                
                                let i = 0.0;
                                if (tc.type === "Resistor" || tc.type === "R") {
                                    let rv = parseScientific(tc.parameters.value ?? "10");
                                    if (rv < 1e-6) rv = 1e-6;
                                    i = v / rv;
                                } else if (tc.type === "VariableResistor") {
                                    const ctrlSig = tc.channels.Ctrl;
                                    const baseVal = parseScientific(tc.parameters.value ?? "10");
                                    const ctrlVal = (ctrlSig && signals[ctrlSig] !== undefined) ? signals[ctrlSig] : baseVal;
                                    let r_val = ctrlVal;
                                    if (r_val < 1e-6) r_val = 1e-6;
                                    i = v / r_val;
                                } else if (tc.type === "Inductor" || tc.type === "L") {
                                    const idxL = this.L_to_idx[tc.id];
                                    i = (idxL !== undefined) ? w_curr[idxL] : 0.0;
                                } else if (tc.type === "Capacitor" || tc.type === "C") {
                                    const cv = parseScientific(tc.parameters.C ?? "100u");
                                    if (!first && this.cap_history[tc.id]) {
                                        i = cv / this.cap_history[tc.id].dt_prev * (v - this.cap_history[tc.id].v_prev);
                                    }
                                } else if (["VoltageSource", "ACVoltageSource", "Ammeter", "V", "AC_V", "AM", "ControlledVoltageSource", "OPAMP", "E_COMP"].includes(tc.type)) {
                                    const idxV = this.V_to_idx[tc.id];
                                    i = (idxV !== undefined) ? w_curr[idxV] : 0.0;
                                } else if (["Switch", "Diode", "MOSFET", "vg-FET", "S", "D", "IGBT", "IGBT_DIODE", "IGCT", "GTO", "THYRISTOR", "JFET", "BJT"].some(t => tc.type.includes(t))) {
                                    const ron = parseScientific(tc.parameters.Ron ?? "1e-3"), roff = parseScientific(tc.parameters.Roff ?? "1e6");
                                    const state = ss[tc.id] ?? "OFF";
                                    if (tc.type === "Diode" && state === "ON") {
                                        const vd_drop = parseScientific(tc.parameters.Vd ?? "0.7");
                                        i = (v - vd_drop) / ron;
                                    } else {
                                        i = v / (state === "ON" ? ron : roff);
                                    }
                                } else if (tc.type === "CurrentSource" || tc.type === "I" || tc.type === "ControlledCurrentSource" || tc.type === "ACCurrentSource") {
                                    const srcType = tc.parameters.src_type;
                                    if (tc.type === "ControlledCurrentSource" || srcType === "controlled") {
                                        const gain = parseScientific(tc.parameters.value ?? "1.0");
                                        const ctrlSig = tc.channels.Ctrl;
                                        const ctrlVal = (ctrlSig && signals[ctrlSig] !== undefined) ? signals[ctrlSig] : 0.0;
                                        i = ctrlVal * gain;
                                    } else if (tc.type === "ACCurrentSource" || srcType === "ac") {
                                        const amp = parseScientific(tc.parameters.amplitude ?? "1.0");
                                        const freq = parseScientific(tc.parameters.frequency ?? "50.0");
                                        const phase = parseScientific(tc.parameters.phase ?? "0.0");
                                        i = amp * Math.sin(2.0 * Math.PI * freq * time + phase * Math.PI / 180.0);
                                    } else {
                                        i = parseScientific(tc.parameters.value ?? "1.0");
                                    }
                                }
                                
                                if (prefix === "V") val = v;
                                else if (prefix === "I") val = i;
                                else if (prefix === "Ctrl") {
                                    const ctrlChan = tc.channels.Ctrl || tc.channels.Switch || tc.channels.G;
                                    if (ctrlChan !== undefined) {
                                        val = signals[ctrlChan] !== undefined ? signals[ctrlChan] : 0.0;
                                    }
                                } else if (prefix === "Power") val = v * i;
                                else if (prefix === "Conducting") val = (ss[tc.id] ?? "OFF") === "ON" ? 1.0 : 0.0;
                            }
                        } else {
                            val = signals[target] ?? 0.0;
                        }
                    }
                    signals[out] = val;
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
                            
                            const is_state_update_step = (integrate && iter === 2);
                            if (is_state_update_step) {
                                // Update states from execution
                                for (const [sk, sv] of Object.entries(inst.state)) {
                                    stateObj[sk] = sv;
                                }
                                
                                // Update next trigger time
                                if (dt_block > 0.0) {
                                    stateObj.next_trigger_time = Math.floor(time / dt_block) * dt_block + dt_block;
                                    if (stateObj.next_trigger_time <= time + 1e-15) {
                                        stateObj.next_trigger_time += dt_block;
                                    }
                                }
                            } else if (first && iter === 2) {
                                if (dt_block > 0.0 && stateObj.next_trigger_time === undefined) {
                                    stateObj.next_trigger_time = dt_block;
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
                } else if (b.type === "PROBE" || b.type === "UnifiedProbe") {
                    const target = b.parameters.target;
                    const selected = (b.parameters.selected_signals || "").split(",").filter(Boolean);
                    const idParts = b.id.split('.');
                    const prefixPath = idParts.slice(0, -1).join('.');

                    selected.forEach((sig: string) => {
                        let val = 0.0;
                        if (sig.startsWith("V_") || sig.startsWith("I_") || sig.startsWith("Ctrl_") || sig.startsWith("Power_") || sig.startsWith("Conducting_")) {
                            // Physical component lookup
                            const parts = sig.split("_");
                            const prefix = parts[0];
                            const compId = parts.slice(1).join("_");
                            const fullCompId = prefixPath ? `${prefixPath}.${compId}` : compId;
                            const tc = this.physical_stage.find(x => x.id === fullCompId);
                            if (tc) {
                                const n1 = tc.nodes[0] ?? "node_0", n2 = tc.nodes[1] ?? "node_0";
                                const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1;
                                const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
                                const v = ((i1 >= 0) ? w_curr[i1] : 0.0) - ((i2 >= 0) ? w_curr[i2] : 0.0);
                                
                                // Calculate current i
                                let i = 0.0;
                                if (tc.type === "Resistor" || tc.type === "R") {
                                    let rv = parseScientific(tc.parameters.value ?? "10");
                                    if (rv < 1e-6) rv = 1e-6;
                                    i = v / rv;
                                } else if (tc.type === "VariableResistor") {
                                    const ctrlSig = tc.channels.Ctrl;
                                    const baseVal = parseScientific(tc.parameters.value ?? "10");
                                    const ctrlVal = (ctrlSig && signals[ctrlSig] !== undefined) ? signals[ctrlSig] : baseVal;
                                    let r_val = ctrlVal;
                                    if (r_val < 1e-6) r_val = 1e-6;
                                    i = v / r_val;
                                } else if (tc.type === "Inductor" || tc.type === "L") {
                                    const idxL = this.L_to_idx[tc.id];
                                    i = (idxL !== undefined) ? w_curr[idxL] : 0.0;
                                } else if (tc.type === "Capacitor" || tc.type === "C") {
                                    const cv = parseScientific(tc.parameters.C ?? "100u");
                                    if (!first && this.cap_history[tc.id]) {
                                        i = cv / this.cap_history[tc.id].dt_prev * (v - this.cap_history[tc.id].v_prev);
                                    }
                                } else if (["VoltageSource", "ACVoltageSource", "Ammeter", "V", "AC_V", "AM", "ControlledVoltageSource", "OPAMP", "E_COMP"].includes(tc.type)) {
                                    const idxV = this.V_to_idx[tc.id];
                                    i = (idxV !== undefined) ? w_curr[idxV] : 0.0;
                                } else if (["Switch", "Diode", "MOSFET", "vg-FET", "S", "D", "IGBT", "IGBT_DIODE", "IGCT", "GTO", "THYRISTOR", "JFET", "BJT"].some(t => tc.type.includes(t))) {
                                    const ron = parseScientific(tc.parameters.Ron ?? "1e-3"), roff = parseScientific(tc.parameters.Roff ?? "1e6");
                                    const state = ss[tc.id] ?? "OFF";
                                    if (tc.type === "Diode" && state === "ON") {
                                        const vd_drop = parseScientific(tc.parameters.Vd ?? "0.7");
                                        i = (v - vd_drop) / ron;
                                    } else {
                                        i = v / (state === "ON" ? ron : roff);
                                    }
                                } else if (tc.type === "CurrentSource" || tc.type === "I" || tc.type === "ControlledCurrentSource" || tc.type === "ACCurrentSource") {
                                    const srcType = tc.parameters.src_type;
                                    if (tc.type === "ControlledCurrentSource" || srcType === "controlled") {
                                        const gain = parseScientific(tc.parameters.value ?? "1.0");
                                        const ctrlSig = tc.channels.Ctrl;
                                        const ctrlVal = (ctrlSig && signals[ctrlSig] !== undefined) ? signals[ctrlSig] : 0.0;
                                        i = ctrlVal * gain;
                                    } else if (tc.type === "ACCurrentSource" || srcType === "ac") {
                                        const amp = parseScientific(tc.parameters.amplitude ?? "1.0");
                                        const freq = parseScientific(tc.parameters.frequency ?? "50.0");
                                        const phase = parseScientific(tc.parameters.phase ?? "0.0");
                                        i = amp * Math.sin(2.0 * Math.PI * freq * time + phase * Math.PI / 180.0);
                                    } else {
                                        i = parseScientific(tc.parameters.value ?? "1.0");
                                    }
                                }
 
                                if (prefix === "V") {
                                    val = v;
                                } else if (prefix === "I") {
                                    val = i;
                                } else if (prefix === "Ctrl") {
                                    const ctrlChan = tc.channels.Ctrl || tc.channels.Switch || tc.channels.G;
                                    if (ctrlChan !== undefined) {
                                        val = signals[ctrlChan] !== undefined ? signals[ctrlChan] : 0.0;
                                    }
                                } else if (prefix === "Power") {
                                    val = v * i;
                                } else if (prefix === "Conducting") {
                                    val = (ss[tc.id] ?? "OFF") === "ON" ? 1.0 : 0.0;
                                }
                            }
                        } else {
                            // Control signal lookup
                            const fullSigId = prefixPath ? `${prefixPath}.${sig}` : sig;
                            val = signals[fullSigId] ?? 0.0;
                        }
                        signals[`${b.id}.${sig}`] = val;
                    });
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

        // Evaluate custom eblocks
        for (const [ebId, inst] of Object.entries(this.custom_eblocks)) {
            const stateObj = cs[ebId] ?? {};
            const dt_block = stateObj.dt_block ?? 0.0;
            const next_t = stateObj.next_trigger_time ?? 0.0;

            const ind: Record<string, number> = {};
            const comp = this.physical_stage.find(p => p.id === ebId);
            if (comp) {
                const termCount = inst.terminalsCount;
                for (let i = 1; i <= termCount; i++) {
                    const nodeName = comp.nodes[i - 1] ?? "node_0";
                    const nodeIdx = (nodeName !== "node_0") ? this.node_to_idx[nodeName] : -1;
                    const v_k = (nodeIdx >= 0) ? w_curr[nodeIdx] : 0.0;
                    ind[`v${i}`] = v_k;
                }
            }

            let outputs_to_use = stateObj.last_outputs ?? {};
            if (!is_logging && (dt_block <= 0.0 || time >= next_t - 1e-15 || first)) {
                inst.state = { ...stateObj };
                delete inst.state.next_trigger_time;
                delete inst.state.dt_block;
                delete inst.state.last_outputs;

                const od = inst.step(time, ind);

                if (integrate || first) {
                    stateObj.last_outputs = { ...od };

                    for (const [sk, sv] of Object.entries(inst.state)) {
                        stateObj[sk] = sv;
                    }

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
                    outputs_to_use = stateObj.last_outputs;
                } else {
                    outputs_to_use = { ...od };
                }
            }

            // Output terminal currents and voltages
            for (let i = 1; i <= inst.terminalsCount; i++) {
                const outKey = `i${i}`;
                const val = outputs_to_use[outKey] ?? 0.0;
                signals[`${ebId}.${outKey}`] = val;
                signals[`${ebId}.v${i}`] = ind[`v${i}`] ?? 0.0;
            }

            // Store internal states and local variables in the signals dictionary
            if (inst.last_vars) {
                for (const [varKey, varVal] of Object.entries(inst.last_vars)) {
                    if (varKey.startsWith("state_")) {
                        signals[`${ebId}.${varKey.substring(6)}`] = varVal;
                    } else if (varKey.startsWith("outputs_")) {
                        signals[`${ebId}.${varKey.substring(8)}`] = varVal;
                    } else if (varKey.startsWith("inputs_")) {
                        signals[`${ebId}.${varKey.substring(7)}`] = varVal;
                    } else if (varKey.startsWith("params_")) {
                        // omit params
                    } else if (varKey !== "time") {
                        signals[`${ebId}.${varKey}`] = varVal;
                    }
                }
            }
            cs[ebId] = stateObj;
        }

        return signals;
    }

    buildRHS(t_stage: number, w_stage: number[], sigs: Record<string, number>, ss?: Record<string, string>): number[] {
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
        for (const c of this.physical_stage) {
            if (c.type === "GEN_EBLOCK") {
                const termCount = parseInt(c.parameters.terminals) || 3;
                for (let i = 1; i <= termCount; i++) {
                    const nodeName = c.nodes[i - 1] ?? "node_0";
                    const nodeIdx = (nodeName !== "node_0") ? this.node_to_idx[nodeName] : -1;
                    if (nodeIdx >= 0) {
                        const currVal = sigs[`${c.id}.i${i}`] ?? 0.0;
                        b[nodeIdx] += currVal;
                    }
                }
            }
        }
        const current_sw_states = ss || this.sw_states || {};
        for (const sw of this.switches) {
            if (sw.type === "Diode" && current_sw_states[sw.id] === "ON") {
                const ron = parseScientific(sw.parameters.Ron ?? "1e-3");
                const vd_drop = parseScientific(sw.parameters.Vd ?? "0.7");
                const Ieq = vd_drop / ron;
                const n1 = sw.nodes[0] ?? "node_0", n2 = sw.nodes[1] ?? "node_0";
                const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1;
                const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
                if (i1 >= 0) b[i1] += Ieq;
                if (i2 >= 0) b[i2] -= Ieq;
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
        const sigs_start = { ...sigs };
        const K = new Matrix(this.dim, this.dim); K.data = [...this.K_static.data];
        for (const sw of this.switches) this.stampSwitch(K, sw, ss[sw.id] ?? "OFF");
        this.stampVariableResistors(K, sigs);
        let b = this.buildRHS(t_stage, wl, sigs, ss);

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
                if (ANALOG_SWITCH_TYPES.includes(sw.type)) {
                    const gate_on = (sigs_start[sw.channels.G] ?? 0) > 0.5;
                    const vd_drop = parseScientific(sw.parameters.Vd ?? "0.7");
                    const diode_on = -vd > vd_drop;
                    swn = (gate_on || diode_on) ? "ON" : "OFF";
                }
                else if (sw.type === "Diode") {
                    const vd_drop = parseScientific(sw.parameters.Vd ?? "0.7");
                    swn = vd > vd_drop ? "ON" : "OFF";
                }
                else if (sw.type === "Switch") {
                    const swCtrl = sw.channels.Switch || sw.channels.Ctrl;
                    if (swCtrl && sigs_start[swCtrl] !== undefined) {
                        swn = sigs_start[swCtrl] > 0.5 ? "ON" : "OFF";
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
                b = this.buildRHS(t_stage, wl, sigs, ss);
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
        b = this.buildRHS(t_stage, wl, sigs, ss);
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
            const sigs_start = { ...sigs };
            let wn_prev = new Array(this.dim).fill(0.0);
            while (s_ch && loop < 10) {
                s_ch = false; loop++;
                wn_prev = [...wn];
                const K = new Matrix(this.dim, this.dim); K.data = [...this.K_static.data];
                for (const sw of this.switches) this.stampSwitch(K, sw, s_stage[sw.id]);
                this.stampVariableResistors(K, sigs);
                const b = this.buildRHS(time + dt, wn, sigs, s_stage);
                if (time === 0 && loop === 1) {
                    console.log("DEBUG MNA:", {
                        node_to_idx: this.node_to_idx,
                        V_to_idx: this.V_to_idx,
                        K_static: this.K_static.data,
                        K: K.data,
                        b: b
                    });
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
                sigs = this.evaluateControls(time + dt, wn, cs, dt, s_stage, false, false);
                let any_ch = false; const next_sw: Record<string, string> = {};
                for (const sw of this.switches) {
                    const n1 = sw.nodes[0] ?? "node_0", n2 = sw.nodes[1] ?? "node_0";
                    const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
                    const vd = ((i1 >= 0) ? wn[i1] : 0.0) - ((i2 >= 0) ? wn[i2] : 0.0);
                    const old = s_stage[sw.id] ?? "OFF"; 
                    let swn = "OFF";
                    if (ANALOG_SWITCH_TYPES.includes(sw.type)) {
                        const gate_on = (sigs_start[sw.channels.G] ?? 0) > 0.5;
                        const vd_drop = parseScientific(sw.parameters.Vd ?? "0.7");
                        const diode_on = -vd > vd_drop;
                        swn = (gate_on || diode_on) ? "ON" : "OFF";
                    }
                    else if (sw.type === "Diode") {
                        const vd_drop = parseScientific(sw.parameters.Vd ?? "0.7");
                        swn = vd > vd_drop ? "ON" : "OFF";
                    }
                    else if (sw.type === "Switch") {
                        const swCtrl = sw.channels.Switch || sw.channels.Ctrl;
                        if (swCtrl && sigs_start[swCtrl] !== undefined) {
                            swn = sigs_start[swCtrl] > 0.5 ? "ON" : "OFF";
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
                    if (ANALOG_SWITCH_TYPES.includes(sw.type)) {
                        const gate_on = (sigs[sw.channels.G] ?? 0) > 0.5;
                        const vd_drop = parseScientific(sw.parameters.Vd ?? "0.7");
                        const diode_on = -vd > vd_drop;
                        swn = (gate_on || diode_on) ? "ON" : "OFF";
                    }
                    else if (sw.type === "Diode") {
                        const vd_drop = parseScientific(sw.parameters.Vd ?? "0.7");
                        swn = vd > vd_drop ? "ON" : "OFF";
                    }
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
                    const b = this.buildRHS(time + dt, w_con, sigs, s_stage);
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
                    const bj = this.buildRHS(Tj, W[j], sigs, s_stage);
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
                    if (ANALOG_SWITCH_TYPES.includes(sw.type)) {
                        const gate_on = (sigs[sw.channels.G] ?? 0) > 0.5;
                        const vd_drop = parseScientific(sw.parameters.Vd ?? "0.7");
                        const diode_on = -vd > vd_drop;
                        swn = (gate_on || diode_on) ? "ON" : "OFF";
                    }
                    else if (sw.type === "Diode") {
                        const vd_drop = parseScientific(sw.parameters.Vd ?? "0.7");
                        swn = vd > vd_drop ? "ON" : "OFF";
                    }
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
        for (const [k, v] of Object.entries(sigs)) {
            if (!this.signals_log[k]) this.signals_log[k] = [];
            this.signals_log[k].push(v);
        }

        for (const comp of this.physical_stage) {
            const kv = "V_" + comp.id; 
            const ki = "I_" + comp.id; 
            const kc = "Ctrl_" + comp.id;
            
            const logV = true; // Log unconditionally for current flow animations
            const logI = true; // Log unconditionally for current flow animations
            const logC = true; // Log unconditionally for control signals
            
            const ctrlChan = comp.channels.Ctrl || comp.channels.Switch || comp.channels.G;
            if (logC && ctrlChan !== undefined) {
                const ctrlVal = sigs[ctrlChan] !== undefined ? sigs[ctrlChan] : 0.0;
                if (!this.custom_plots_log[kc]) this.custom_plots_log[kc] = [];
                this.custom_plots_log[kc].push(ctrlVal);
            }

            if (comp.type === "XFMR") {
                const txWindings = this.all_windings.filter(w => w.transformer_id === comp.id);
                
                // Log overall/first winding as default for V_comp.id / I_comp.id
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
                
                // Log individual winding voltages and currents
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
                else if (["Switch", "Diode", "MOSFET", "vg-FET", "S", "D", "IGBT", "IGBT_DIODE", "IGCT", "GTO", "THYRISTOR", "JFET", "BJT"].includes(comp.type)) {
                    const ron = parseScientific(comp.parameters.Ron ?? "1e-3"), roff = parseScientific(comp.parameters.Roff ?? "1e6");
                    const state = ss[comp.id] ?? "OFF";
                    if (comp.type === "Diode" && state === "ON") {
                        const vd_drop = parseScientific(comp.parameters.Vd ?? "0.7");
                        curr = (v - vd_drop) / ron;
                    } else {
                        curr = v / (state === "ON" ? ron : roff);
                    }
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

        // Update capacitor history at the end of logged accepted states
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
        const init_sigs = this.evaluateControls(0.0, this.w, this.control_states, h, this.sw_states, true, false);
        this.logAcceptedState(0.0, this.w, init_sigs, this.sw_states, h);
        const atol = 1e-4, rtol = 1e-3;
        const h_min = Math.max(this.sim_params.h * 1e-4, 1e-12), h_max = this.sim_params.h * 10.0;
        let rejects = 0;
        let iterations = 0;
        const max_iterations = 200000;
        while (t < t_end) {
            iterations++;
            if (iterations > max_iterations) {
                console.warn(`Simulation terminated early: exceeded max iterations (${max_iterations})`);
                break;
            }
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
                        const sig_half1 = this.evaluateControls(t + h_half, half1.w_new, this.control_states, h_half, half1.sw_new, false, false, true);
                        this.logAcceptedState(t + h_half, half1.w_new, sig_half1, half1.sw_new, h_half);
                        for (const ev of half2.out_trans) this.logAcceptedState(ev.time, ev.w, ev.signals, ev.sw_states, ev.dt);

                        this.control_states = half2.ctrl_new; this.sw_states = half2.sw_new;
                        for (const k of Object.keys(this.custom_blocks)) { if (half2.ctrl_new[k]) this.custom_blocks[k].state = half2.ctrl_new[k]; }
                        const final_sigs = this.evaluateControls(t_new, this.w, this.control_states, h_half, this.sw_states, false, false, true);
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
                    const final_sigs = this.evaluateControls(t_new, this.w, this.control_states, h, this.sw_states, false, false, true);
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

    async runAsync(shouldCancel: () => boolean, shouldPause: () => boolean) {
        this.initializeNetwork();
        this.time_log = []; this.voltages_log = {}; this.inductors_log = {}; this.voltmeters_log = {}; this.ammeters_log = {}; this.signals_log = {}; this.custom_plots_log = {};
        let t = 0.0; let h = this.sim_params.h; const t_end = this.sim_params.t_end;
        const init_sigs = this.evaluateControls(0.0, this.w, this.control_states, h, this.sw_states, true, false);
        this.logAcceptedState(0.0, this.w, init_sigs, this.sw_states, h);
        const atol = 1e-4, rtol = 1e-3;
        const h_min = Math.max(this.sim_params.h * 1e-4, 1e-12), h_max = this.sim_params.h * 10.0;
        let rejects = 0;
        let iterations = 0;
        const max_iterations = 200000;
        while (t < t_end) {
            iterations++;
            if (iterations > max_iterations) {
                console.warn(`Simulation terminated early in runAsync: exceeded max iterations (${max_iterations})`);
                break;
            }

            if (iterations % 200 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
                if (shouldCancel()) {
                    console.log("runAsync simulation cancelled.");
                    break;
                }
                while (shouldPause()) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                    if (shouldCancel()) break;
                }
            }

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
                        const sig_half1 = this.evaluateControls(t + h_half, half1.w_new, this.control_states, h_half, half1.sw_new, false, false, true);
                        this.logAcceptedState(t + h_half, half1.w_new, sig_half1, half1.sw_new, h_half);
                        for (const ev of half2.out_trans) this.logAcceptedState(ev.time, ev.w, ev.signals, ev.sw_states, ev.dt);

                        this.control_states = half2.ctrl_new; this.sw_states = half2.sw_new;
                        for (const k of Object.keys(this.custom_blocks)) { if (half2.ctrl_new[k]) this.custom_blocks[k].state = half2.ctrl_new[k]; }
                        const final_sigs = this.evaluateControls(t_new, this.w, this.control_states, h_half, this.sw_states, false, false, true);
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
                    const final_sigs = this.evaluateControls(t_new, this.w, this.control_states, h, this.sw_states, false, false, true);
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
