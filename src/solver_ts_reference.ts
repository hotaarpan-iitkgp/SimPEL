import { discoverPortsJS } from "./schematic/config";

export function parseScientific(str: any): number {
    if (typeof str === 'number') return str;
    if (str === undefined || str === null || str === '') return 0.0;
    let s = String(str).trim();
    if (!s) return 0.0;

    // Strip trailing units like ohm, v, a, hz, f, h, w, etc. case-insensitively
    s = s.replace(/\s*(?:ohms?|ohm|Ω|hz|hertz|v(?:olts?)?|a(?:mps?)?|f(?:arads?)?|h(?:enrys?)?|w(?:atts?))\s*$/i, '');
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
            
            if (name in this.block.state) return `state["${name}"]`;
            if (name in this.block.params) return `params["${name}"]`;
            if (name === "time") return `time`;
            if (name === "pi" || name === "M_PI") return `Math.PI`;
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
        while (this.peek() === '*' || this.peek() === '/') {
            const op = this.get();
            const r = this.parsePower();
            val = (op === '*') ? `(${val} * ${r})` : `(Math.abs(${r}) > 1e-30 ? ${val} / ${r} : 0.0)`;
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
    parse_block(lines: string[], startIndex: { pos: number }): Statement[] {
        const statements: Statement[] = [];
        
        while (startIndex.pos < lines.length) {
            let line = lines[startIndex.pos].trim();
            startIndex.pos++;
            
            if (line.includes("//")) {
                line = line.substring(0, line.indexOf("//")).trim();
            }
            if (!line || line === "{" || line === "pass;") continue;
            
            if (line === "}") {
                break;
            }
            // Handle "} else if (...)" and "} else {" — break and rewind
            // so the parent if-parser's look-ahead picks them up
            if (line.startsWith("}") && /^}\s*else\b/.test(line)) {
                startIndex.pos--;
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
                
                if (clean.includes("def initialize")) { in_init = true; in_step = false; continue; }
                if (clean.includes("def step")) { in_init = false; in_step = true; continue; }
                
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
                { key: "plls", type: "PLL" },
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
                                                } else if (cat.type === "Gain" && (item.output || item.output_mag)) {
                            const chs: Record<string, string> = {};
                            if (item.output) chs.Out = item.output;
                            if (item.output_mag) chs.Mag = item.output_mag;
                            if (item.output_phase) chs.Phase = item.output_phase;
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
            else if (["Switch", "Diode", "MOSFET", "vg-FET"].includes(c.type)) this.switches.push(c);
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
            else if (["PWM_Generator", "Triangle_Carrier", "PWM_MASTER"].includes(b.type)) this.control_states[b.id] = { time: 0.0 };
            else if (b.type === "CustomScript") {
                const bp: Record<string, number> = {};
                for (const [k, v] of Object.entries(b.parameters)) {
                    if (!["code", "timestep", "plot_inputs", "plot_outputs", "plot_custom_vars"].includes(k)) {
                        bp[k] = parseScientific(v);
                    }
                }
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
                            } else if (["Switch", "Diode", "MOSFET", "vg-FET"].includes(tc.type)) {
                                const ron = parseScientific(tc.parameters.Ron ?? "1e-3"), roff = parseScientific(tc.parameters.Roff ?? "1e6");
                                const state = ss[tc.id] ?? "OFF";
                                if (tc.type === "Diode" && state === "ON") {
                                    const vd_drop = parseScientific(tc.parameters.Vd ?? "0.7");
                                    i = (v - vd_drop) / ron;
                                } else {
                                    i = v / (state === "ON" ? ron : roff);
                                }
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
                // Allow FOURIER_TRANS through even without Out channel (it uses Mag/Phase channels)
                if (!out && !(b.type === "Gain" && b.parameters.original_type === "FOURIER_TRANS")) continue;
                if (b.type === "Gain" && out) {
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
                    } else if (orig === "PERIODIC_IMP_AVG") {
                        const val = signals[b.channels.In] ?? 0.0;
                        const trig = signals[b.channels.Ctrl] ?? 0.0;
                        const initialVal = parseScientific(b.parameters.initial_value ?? "0.0");
                        if (!cs[b.id]) {
                            (cs as any)[b.id] = { prev_trig: 0.0, integral: 0.0, period_time: 0.0, held_out: initialVal, prev_u: val, last_t: time };
                        }
                        const st = cs[b.id];
                        const is_rising = (st.prev_trig < 0.5 && trig >= 0.5);
                        let y_temp = st.held_out;
                        if (is_rising && st.period_time > 0.0) {
                            y_temp = st.integral / st.period_time;
                        }
                        if (dt > 0.0 && !first) {
                            const dt_step = dt;
                            if (is_rising && st.period_time > 0.0) {
                                st.integral = 0.0;
                                st.period_time = 0.0;
                                st.held_out = y_temp;
                            } else {
                                st.integral += 0.5 * (val + st.prev_u) * dt_step;
                                st.period_time += dt_step;
                            }
                            st.prev_trig = trig;
                            st.prev_u = val;
                            st.last_t = time;
                        }
                        signals[out] = y_temp;
                    } else {
                        signals[out] = parseScientific(b.parameters.K ?? "1") * (signals[b.channels.In] ?? 0);
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
                        (cs as any)[b.id] = {
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
                    if (k > st.last_sample_k) {
                        st.history[st.idx] = uVal;
                        st.idx = (st.idx + 1) % N;
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
                        if (dt > 0.0 && !first) {
                            st.held_mag = mag_temp;
                            st.held_phase = phase_temp;
                            st.last_sample_k = k;
                        }
                    }
                    if (outMag) signals[outMag] = mag_temp;
                    if (outPhase) signals[outPhase] = phase_temp;
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
                } else if (b.type === "PWM_MASTER") {
                    const N = parseInt(b.parameters.num_carriers) || 3;
                    const fc = parseScientific(b.parameters.fc ?? "10k");
                    const deadTime = parseScientific(b.parameters.dead_time ?? "1u");
                    
                    let config: any[] = [];
                    try {
                        config = JSON.parse(b.parameters.config || '[]');
                    } catch (_) {}

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

                        const k_ltd = `last_target_direct_${idx}`;
                        const k_ltc = `last_target_compl_${idx}`;
                        const k_lttd = `last_transition_time_direct_${idx}`;
                        const k_lttc = `last_transition_time_compl_${idx}`;

                        if (stateObj[k_ltd] === undefined) {
                            stateObj[k_ltd] = 0;
                            stateObj[k_ltc] = 0;
                            stateObj[k_lttd] = 0.0;
                            stateObj[k_lttc] = 0.0;
                        }

                        let transTimeDirect = stateObj[k_lttd];
                        if (targetDirect === 1 && stateObj[k_ltd] === 0) {
                            transTimeDirect = time;
                        }
                        let transTimeCompl = stateObj[k_lttc];
                        if (targetCompl === 1 && stateObj[k_ltc] === 0) {
                            transTimeCompl = time;
                        }

                        stateObj[k_ltd] = targetDirect;
                        stateObj[k_ltc] = targetCompl;
                        stateObj[k_lttd] = transTimeDirect;
                        stateObj[k_lttc] = transTimeCompl;

                        const outD = (targetDirect === 1 && (time - transTimeDirect >= deadTime)) ? 1 : 0;
                        const outC = (targetCompl === 1 && (time - transTimeCompl >= deadTime)) ? 1 : 0;

                        const outDirectChan = b.channels[`OutDirect${idx}`];
                        const outComplChan = b.channels[`OutCompl${idx}`];
                        if (outDirectChan) signals[outDirectChan] = outD;
                        if (outComplChan) signals[outComplChan] = outC;
                    }
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
                        const stateObj = (cs[b.id] as any) ?? {};
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
                            
                            const is_state_update_step = (!first && iter === 2);
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
                                    signals[`${b.id}.${varKey.substring(6)}`] = varVal as number;
                                } else if (varKey.startsWith("outputs_")) {
                                    signals[`${b.id}.${varKey.substring(8)}`] = varVal as number;
                                } else if (varKey.startsWith("inputs_")) {
                                    signals[`${b.id}.${varKey.substring(7)}`] = varVal as number;
                                } else if (varKey.startsWith("params_")) {
                                    // omit params
                                } else if (varKey !== "time") {
                                    signals[`${b.id}.${varKey}`] = varVal as number;
                                }
                            }
                        }
                        cs[b.id] = stateObj;
                    }
                }
            }
        }
        return signals;
    }

    buildRHS(t_stage: number, ss: Record<string, string>): number[] {
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
        for (const sw of this.switches) {
            if (sw.type === "Diode" && ss[sw.id] === "ON") {
                const ron = parseScientific(sw.parameters.Ron ?? "1e-3");
                const vd_drop = parseScientific(sw.parameters.Vd ?? "0.7");
                const Ieq = vd_drop / ron;
                const n1 = sw.nodes[0] ?? "node_0", n2 = sw.nodes[1] ?? "node_0";
                const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
                if (i1 >= 0) b[i1] += Ieq;
                if (i2 >= 0) b[i2] -= Ieq;
            }
        }
        return b;
    }

    compute_k(t_stage: number, w_stage: number[], cs: Record<string, Record<string, number>>, dt: number, ss: Record<string, string>): number[] {
        const wl = [...w_stage]; 
        const sc_start = JSON.parse(JSON.stringify(cs));
        const sigs_start = this.evaluateControls(t_stage, wl, sc_start, dt, ss);
        const K = new Matrix(this.dim, this.dim); K.data = [...this.K_static.data];
        for (const sw of this.switches) this.stampSwitch(K, sw, ss[sw.id] ?? "OFF");
        let b = this.buildRHS(t_stage, ss);
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
                if (sw.type === "MOSFET" || sw.type === "vg-FET") {
                    const gate_on = (sigs_start[sw.channels.G] ?? 0) > 0.5;
                    const vd_drop = parseScientific(sw.parameters.Vd ?? "0.7");
                    const diode_on = -vd > (old === "ON" ? vd_drop - 0.1 : vd_drop);
                    swn = (gate_on || diode_on) ? "ON" : "OFF";
                }
                else if (sw.type === "Diode") {
                    const vd_drop = parseScientific(sw.parameters.Vd ?? "0.7");
                    swn = vd > (old === "ON" ? vd_drop - 0.1 : vd_drop) ? "ON" : "OFF";
                }
                else if (sw.type === "Switch") swn = parseScientific(sw.parameters.state ?? "0") > 0.5 ? "ON" : "OFF";
                if (swn !== old) { ss[sw.id] = swn; any_ch = true; }
            }
            if (any_ch) {                const K_new = new Matrix(this.dim, this.dim); K_new.data = [...this.K_static.data];
                for (const sw of this.switches) this.stampSwitch(K_new, sw, ss[sw.id] ?? "OFF");
                b = this.buildRHS(t_stage, ss); if (this.alg_idx.length > 0 && this.diff_idx.length > 0) {
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
        b = this.buildRHS(t_stage, ss); let rhs = b.map((v, idx) => v - fK.multiply(wl)[idx]); const dw = new Array(this.dim).fill(0.0);
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
            const t_cs_start = JSON.parse(JSON.stringify(cs));
            const sigs_start = this.evaluateControls(time + dt, w_curr, t_cs_start, dt, s_stage);
            while (s_ch && loop < 10) {
                s_ch = false; loop++;
                const K = new Matrix(this.dim, this.dim); K.data = [...this.K_static.data];
                for (const sw of this.switches) this.stampSwitch(K, sw, s_stage[sw.id]);
                const b = this.buildRHS(time + dt, s_stage);
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
                    if (sw.type === "MOSFET" || sw.type === "vg-FET") {
                        const gate_on = (sigs_start[sw.channels.G] ?? 0) > 0.5;
                        const vd_drop = parseScientific(sw.parameters.Vd ?? "0.7");
                        const diode_on = -vd > (old === "ON" ? vd_drop - 0.1 : vd_drop);
                        swn = (gate_on || diode_on) ? "ON" : "OFF";
                    }
                    else if (sw.type === "Diode") {
                        const vd_drop = parseScientific(sw.parameters.Vd ?? "0.7");
                        swn = vd > (old === "ON" ? vd_drop - 0.1 : vd_drop) ? "ON" : "OFF";
                    }
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
            const t_cs_start = JSON.parse(JSON.stringify(cs));
            const sigs_start = this.evaluateControls(time + dt, w_con, t_cs_start, dt, s_stage);
            for (let iter = 0; iter < 3; iter++) {
                const t_cs = JSON.parse(JSON.stringify(cs)); const sigs = this.evaluateControls(time + dt, w_con, t_cs, dt, s_stage);
                let any_ch = false; const next_sw = { ...s_stage };
                for (const sw of this.switches) {
                    const n1 = sw.nodes[0] ?? "node_0", n2 = sw.nodes[1] ?? "node_0";
                    const i1 = (n1 !== "node_0") ? this.node_to_idx[n1] : -1; const i2 = (n2 !== "node_0") ? this.node_to_idx[n2] : -1;
                    const vd = ((i1 >= 0) ? w_con[i1] : 0.0) - ((i2 >= 0) ? w_con[i2] : 0.0);
                    const old = s_stage[sw.id] ?? "OFF"; let swn = "OFF";
                    if (sw.type === "MOSFET" || sw.type === "vg-FET") {
                        const gate_on = (sigs[sw.channels.G] ?? 0) > 0.5;
                        const vd_drop = parseScientific(sw.parameters.Vd ?? "0.7");
                        const diode_on = -vd > (old === "ON" ? vd_drop - 0.1 : vd_drop);
                        swn = (gate_on || diode_on) ? "ON" : "OFF";
                    }
                    else if (sw.type === "Diode") {
                        const vd_drop = parseScientific(sw.parameters.Vd ?? "0.7");
                        swn = vd > (old === "ON" ? vd_drop - 0.1 : vd_drop) ? "ON" : "OFF";
                    }
                    else if (sw.type === "Switch") swn = parseScientific(sw.parameters.state ?? "0") > 0.5 ? "ON" : "OFF";
                    next_sw[sw.id] = swn; if (swn !== old) any_ch = true;
                }
                if (any_ch) {
                    // Re-iterate with new switch state to find continuous convergence
                    s_stage = next_sw;
                    const K = new Matrix(this.dim, this.dim); K.data = [...this.K_static.data];
                    for (const sw of this.switches) this.stampSwitch(K, sw, s_stage[sw.id]);
                    const b = this.buildRHS(time + dt, s_stage);
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
                    Klist.push(Kj); blist.push(this.buildRHS(Tj, s_stage));
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
                    if (sw.type === "MOSFET" || sw.type === "vg-FET") {
                        const gate_on = (sigs[sw.channels.G] ?? 0) > 0.5;
                        const vd_drop = parseScientific(sw.parameters.Vd ?? "0.7");
                        const diode_on = -vd > (old === "ON" ? vd_drop - 0.1 : vd_drop);
                        swn = (gate_on || diode_on) ? "ON" : "OFF";
                    }
                    else if (sw.type === "Diode") {
                        const vd_drop = parseScientific(sw.parameters.Vd ?? "0.7");
                        swn = vd > (old === "ON" ? vd_drop - 0.1 : vd_drop) ? "ON" : "OFF";
                    }
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
            else if (["Switch", "Diode", "MOSFET", "vg-FET", "S", "D"].includes(comp.type)) {
                const ron = parseScientific(comp.parameters.Ron ?? "1e-3"), roff = parseScientific(comp.parameters.Roff ?? "1e6");
                const state = ss[comp.id] ?? "OFF";
                if (comp.type === "Diode" && state === "ON") {
                    const vd_drop = parseScientific(comp.parameters.Vd ?? "0.7");
                    curr = (v - vd_drop) / ron;
                } else {
                    curr = v / (state === "ON" ? ron : roff);
                }
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
