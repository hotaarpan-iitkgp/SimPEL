import { getComponentPins } from '../schematic/config';

// --- Symbolic Algebra Types & Helpers ---

export interface SymbolicTerm {
  coeff: string; // e.g. "1", "-1", "1/R1", "C1", "L1", "Np", "Ns"
  variable: string; // e.g. "v_{node_1}", "v_{C1}", "i_{L1}", or "" (constant)
}

export type SymbolicExpr = SymbolicTerm[];

// Helper to multiply two symbolic coefficient strings
function multCoeffStr(c1: string, c2: string): string {
  if (c1 === "0" || c2 === "0") return "0";
  if (c1 === "1") return c2;
  if (c2 === "1") return c1;
  if (c1 === "-1") return c2.startsWith("-") ? c2.substring(1) : "-" + c2;
  if (c2 === "-1") return c1.startsWith("-") ? c1.substring(1) : "-" + c1;

  // Handle double negation
  if (c1.startsWith("-") && c2.startsWith("-")) {
    return multCoeffStr(c1.substring(1), c2.substring(1));
  }

  // Prepend sign if one is negative
  if (c1.startsWith("-")) {
    return "-" + multCoeffStr(c1.substring(1), c2);
  }
  if (c2.startsWith("-")) {
    return "-" + multCoeffStr(c1, c2.substring(1));
  }

  // Fractions notation: e.g. "1/R1" * "v" -> "v/R1"
  if (c1.startsWith("1/")) {
    const r = c1.substring(2);
    return `\\frac{${c2}}{${r}}`;
  }
  if (c2.startsWith("1/")) {
    const r = c2.substring(2);
    return `\\frac{${c1}}{${r}}`;
  }

  return `${c1} \\cdot ${c2}`;
}

export function simplifyExpr(expr: SymbolicExpr): SymbolicExpr {
  const grouped: Record<string, string[]> = {};
  expr.forEach(t => {
    if (!grouped[t.variable]) grouped[t.variable] = [];
    grouped[t.variable].push(t.coeff);
  });

  const res: SymbolicExpr = [];
  for (const [v, coeffs] of Object.entries(grouped)) {
    let numericSum = 0;
    const symTerms: string[] = [];

    coeffs.forEach(c => {
      const val = parseFloat(c);
      if (!isNaN(val)) {
        numericSum += val;
      } else {
        symTerms.push(c);
      }
    });

    if (numericSum !== 0) {
      symTerms.push(numericSum.toString());
    }

    if (symTerms.length > 0) {
      const activeTerms = symTerms.filter(t => t !== "0");
      if (activeTerms.length === 0) continue;

      let finalCoeff = activeTerms.join(" + ").replace(/\+ -/g, "- ");
      if (activeTerms.length > 1) {
        finalCoeff = `(${finalCoeff})`;
      }
      res.push({ coeff: finalCoeff, variable: v });
    }
  }
  return res.filter(t => t.coeff !== "0");
}

export function addExpr(e1: SymbolicExpr, e2: SymbolicExpr): SymbolicExpr {
  return simplifyExpr([...e1, ...e2]);
}

export function subExpr(e1: SymbolicExpr, e2: SymbolicExpr): SymbolicExpr {
  const negated = e2.map(t => {
    let negCoeff = t.coeff;
    if (negCoeff.startsWith("-")) {
      negCoeff = negCoeff.substring(1);
    } else {
      negCoeff = "-" + negCoeff;
    }
    return { coeff: negCoeff, variable: t.variable };
  });
  return simplifyExpr([...e1, ...negated]);
}

export function multiplyExprByVar(expr: SymbolicExpr, varName: string): SymbolicExpr {
  return expr.map(t => {
    const newVar = t.variable === "" ? varName : `${t.variable} * ${varName}`;
    return {
      coeff: t.coeff,
      variable: newVar
    };
  });
}

export function multiplyExprByCoeff(expr: SymbolicExpr, coeff: string): SymbolicExpr {
  return expr.map(t => {
    return {
      coeff: multCoeffStr(t.coeff, coeff),
      variable: t.variable
    };
  });
}

export function substituteVar(
  expr: SymbolicExpr,
  varName: string,
  replacement: SymbolicExpr
): SymbolicExpr {
  let res: SymbolicExpr = [];
  expr.forEach(t => {
    if (t.variable === varName) {
      if (replacement.length === 0) {
        return;
      }
      replacement.forEach(rt => {
        const newCoeff = multCoeffStr(t.coeff, rt.coeff);
        res.push({ coeff: newCoeff, variable: rt.variable });
      });
    } else {
      res.push(t);
    }
  });
  return simplifyExpr(res);
}

// Convert a symbolic expression to LaTeX string format
export function formatExprLaTeX(expr: SymbolicExpr): string {
  if (expr.length === 0) return "0";
  const parts: string[] = [];
  expr.forEach((t, idx) => {
    const isFirst = idx === 0;
    const coeff = t.coeff;
    const isNeg = coeff.startsWith("-");
    const cleanCoeff = isNeg ? coeff.substring(1) : coeff;
    
    let signStr = "";
    if (isFirst) {
      if (isNeg) signStr = "-";
    } else {
      signStr = isNeg ? " - " : " + ";
    }

    if (t.variable === "") {
      parts.push(`${signStr}${cleanCoeff}`);
    } else {
      let formattedVar = t.variable;
      if (formattedVar.includes("_") && !formattedVar.includes("{")) {
        const parts = formattedVar.split("_");
        formattedVar = `${parts[0]}_{${parts.slice(1).join("_")}}`;
      }

      if (cleanCoeff === "1") {
        parts.push(`${signStr}${formattedVar}`);
      } else {
        if (cleanCoeff.includes("\\frac")) {
          const filledFrac = cleanCoeff.replace("{v}", `{${formattedVar}}`);
          parts.push(`${signStr}${filledFrac}`);
        } else {
          parts.push(`${signStr}${cleanCoeff} \\cdot ${formattedVar}`);
        }
      }
    }
  });
  return parts.join("").replace(/\+ -/g, "- ");
}

// --- Topology Path-Tracing Validation ---

export interface Component {
  type: string;
  id: string;
  n1: string;
  n2: string;
  p1?: string;
  p2?: string;
  s1?: string;
  s2?: string;
  sym?: string;
  val?: string;
  esr?: string;
}

export function isValidTopology(fixedComps: Component[], activeSwitches: Component[]): boolean {
  function buildAdj(comps: Component[]) {
    const adj: Record<string, string[]> = {};
    const addEdge = (u: string, v: string) => {
      if (!adj[u]) adj[u] = [];
      adj[u].push(v);
      if (!adj[v]) adj[v] = [];
      adj[v].push(u);
    };

    comps.forEach(c => {
      if (c.type === 'X') {
        if (c.p1 && c.p2) addEdge(c.p1, c.p2);
        if (c.s1 && c.s2) addEdge(c.s1, c.s2);
      } else {
        addEdge(c.n1, c.n2);
      }
    });
    return adj;
  }

  function hasPath(adj: Record<string, string[]>, start: string, end: string): boolean {
    if (!adj[start] || !adj[end]) return false;
    if (start === end) return true;
    const visited = new Set<string>([start]);
    const queue = [start];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (curr === end) return true;
      const neighbors = adj[curr] || [];
      for (const nxt of neighbors) {
        if (!visited.has(nxt)) {
          visited.add(nxt);
          queue.push(nxt);
        }
      }
    }
    return false;
  }

  const swAdj = buildAdj(activeSwitches);
  
  const vSources = fixedComps.filter(c => c.type === 'V');
  for (const v of vSources) {
    if (hasPath(swAdj, v.n1, v.n2)) {
      return false;
    }
  }

  const iSources = fixedComps.filter(c => c.type === 'I');
  for (const iSrc of iSources) {
    const otherComps = [...fixedComps.filter(c => c.id !== iSrc.id), ...activeSwitches];
    const fullAdj = buildAdj(otherComps);
    if (!hasPath(fullAdj, iSrc.n1, iSrc.n2)) {
      return false;
    }
  }

  return true;
}

// --- Symbolic MNA State Space Extractor ---

interface MNAResult {
  latexMatrix: string;
  latexSeparatedRaw: string;
  latexSeparatedSimp: string;
  edgeEqs: Record<string, { v: string; i: string }>;
}

export function buildMNALatex(
  fixedComps: Component[],
  activeSwitches: Component[] = [],
  allSwitches: Component[] = [],
  refNode: string = 'node_0',
  isIdealMode: boolean = false
): MNAResult {
  
  let workingFixedComps = [...fixedComps];
  
  // ESR (parasitics) is completely ignored in MNA equations. All equations are simple/ideal.
  
  const nodes = new Set<string>();
  workingFixedComps.forEach(c => {
    if (c.type === 'X') {
      if (c.p1) nodes.add(c.p1);
      if (c.p2) nodes.add(c.p2);
      if (c.s1) nodes.add(c.s1);
      if (c.s2) nodes.add(c.s2);
    } else {
      nodes.add(c.n1);
      nodes.add(c.n2);
    }
  });
  allSwitches.forEach(sw => {
    nodes.add(sw.n1);
    nodes.add(sw.n2);
  });

  const parent: Record<string, string> = {};
  nodes.forEach(n => { parent[n] = n; });

  function find(i: string): string {
    if (parent[i] === i) return i;
    parent[i] = find(parent[i]);
    return parent[i];
  }

  function union(i: string, j: string) {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) {
      if (ri === refNode) parent[rj] = ri;
      else if (rj === refNode) parent[ri] = rj;
      else if (ri < rj) parent[rj] = ri;
      else parent[ri] = rj;
    }
  }

  activeSwitches.forEach(sw => {
    if (nodes.has(sw.n1) && nodes.has(sw.n2)) {
      union(sw.n1, sw.n2);
    }
  });

  const uniqueNodes = new Set<string>();
  nodes.forEach(n => {
    uniqueNodes.add(find(n));
  });
  if (uniqueNodes.has(refNode)) {
    uniqueNodes.delete(refNode);
  }
  const nodeList = Array.from(uniqueNodes).sort();
  const nodeMap: Record<string, number> = {};
  nodeList.forEach((n, idx) => { nodeMap[n] = idx; });
  nodeMap[refNode] = -1;

  const N_v = nodeList.length;

  const auxBranches: { id: string; comp: Component; type: string }[] = [];
  workingFixedComps.forEach(c => {
    if (c.type === 'V') {
      auxBranches.push({ id: c.id, comp: c, type: 'V' });
    } else if (c.type === 'L') {
      auxBranches.push({ id: c.id, comp: c, type: 'L' });
    } else if (c.type === 'X') {
      auxBranches.push({ id: `${c.id}_pri`, comp: c, type: 'X_PRI' });
      auxBranches.push({ id: `${c.id}_sec`, comp: c, type: 'X_SEC' });
    }
  });

  const N_i = auxBranches.length;
  const N_tot = N_v + N_i;

  const E: SymbolicExpr[][] = Array.from({ length: N_tot }, () => Array.from({ length: N_tot }, () => []));
  const G: SymbolicExpr[][] = Array.from({ length: N_tot }, () => Array.from({ length: N_tot }, () => []));
  const U: SymbolicExpr[] = Array.from({ length: N_tot }, () => []);
  
  const X_names: string[] = [];
  const X_dot_names: string[] = [];
  
  nodeList.forEach(n => {
    X_names.push(`v_{${n}}`);
    X_dot_names.push(`\\dot{v}_{${n}}`);
  });
  auxBranches.forEach(b => {
    X_names.push(`i_{${b.id}}`);
    X_dot_names.push(`\\dot{i}_{${b.id}}`);
  });

  let branchCount = N_v;

  workingFixedComps.forEach(comp => {
    if (comp.type !== 'X') {
      const n1_m = find(comp.n1);
      const n2_m = find(comp.n2);
      const n1 = nodeMap[n1_m] ?? -1;
      const n2 = nodeMap[n2_m] ?? -1;
      const symVal = comp.sym || comp.id;

      if (n1 === n2 && ['R', 'C', 'I'].includes(comp.type)) return;

      if (comp.type === 'R') {
        const gCoeff = `1/${symVal}`;
        if (n1 !== -1) G[n1][n1] = addExpr(G[n1][n1], [{ coeff: gCoeff, variable: "" }]);
        if (n2 !== -1) G[n2][n2] = addExpr(G[n2][n2], [{ coeff: gCoeff, variable: "" }]);
        if (n1 !== -1 && n2 !== -1) {
          G[n1][n2] = subExpr(G[n1][n2], [{ coeff: gCoeff, variable: "" }]);
          G[n2][n1] = subExpr(G[n2][n1], [{ coeff: gCoeff, variable: "" }]);
        }
      } else if (comp.type === 'C') {
        if (n1 !== -1) E[n1][n1] = addExpr(E[n1][n1], [{ coeff: symVal, variable: "" }]);
        if (n2 !== -1) E[n2][n2] = addExpr(E[n2][n2], [{ coeff: symVal, variable: "" }]);
        if (n1 !== -1 && n2 !== -1) {
          E[n1][n2] = subExpr(E[n1][n2], [{ coeff: symVal, variable: "" }]);
          E[n2][n1] = subExpr(E[n2][n1], [{ coeff: symVal, variable: "" }]);
        }
      } else if (comp.type === 'L') {
        const idx = branchCount++;
        E[idx][idx] = addExpr(E[idx][idx], [{ coeff: symVal, variable: "" }]);
        if (n1 !== -1) {
          G[n1][idx] = addExpr(G[n1][idx], [{ coeff: "1", variable: "" }]);
          G[idx][n1] = subExpr(G[idx][n1], [{ coeff: "1", variable: "" }]);
        }
        if (n2 !== -1) {
          G[n2][idx] = subExpr(G[n2][idx], [{ coeff: "1", variable: "" }]);
          G[idx][n2] = addExpr(G[idx][n2], [{ coeff: "1", variable: "" }]);
        }
      } else if (comp.type === 'V') {
        const idx = branchCount++;
        if (n1 !== -1) {
          G[n1][idx] = addExpr(G[n1][idx], [{ coeff: "1", variable: "" }]);
          G[idx][n1] = addExpr(G[idx][n1], [{ coeff: "1", variable: "" }]);
        }
        if (n2 !== -1) {
          G[n2][idx] = subExpr(G[n2][idx], [{ coeff: "1", variable: "" }]);
          G[idx][n2] = subExpr(G[idx][n2], [{ coeff: "1", variable: "" }]);
        }
        U[idx] = addExpr(U[idx], [{ coeff: "1", variable: `V_{${symVal}}` }]);
      } else if (comp.type === 'I') {
        if (n1 !== -1) U[n1] = subExpr(U[n1], [{ coeff: "1", variable: `I_{${symVal}}` }]);
        if (n2 !== -1) U[n2] = addExpr(U[n2], [{ coeff: "1", variable: `I_{${symVal}}` }]);
      }
    } else {
      if (!comp.p1 || !comp.p2 || !comp.s1 || !comp.s2) return;
      const p1_m = find(comp.p1);
      const p2_m = find(comp.p2);
      const s1_m = find(comp.s1);
      const s2_m = find(comp.s2);
      const p1 = nodeMap[p1_m] ?? -1;
      const p2 = nodeMap[p2_m] ?? -1;
      const s1 = nodeMap[s1_m] ?? -1;
      const s2 = nodeMap[s2_m] ?? -1;
      
      const idx_p = branchCount++;
      const idx_s = branchCount++;

      const Np = `N_{${comp.id}_p}`;
      const Ns = `N_{${comp.id}_s}`;

      if (p1 !== -1) G[p1][idx_p] = addExpr(G[p1][idx_p], [{ coeff: "1", variable: "" }]);
      if (p2 !== -1) G[p2][idx_p] = subExpr(G[p2][idx_p], [{ coeff: "1", variable: "" }]);
      if (s1 !== -1) G[s1][idx_s] = addExpr(G[s1][idx_s], [{ coeff: "1", variable: "" }]);
      if (s2 !== -1) G[s2][idx_s] = subExpr(G[s2][idx_s], [{ coeff: "1", variable: "" }]);
      
      if (p1 !== -1) G[idx_p][p1] = addExpr(G[idx_p][p1], [{ coeff: Ns, variable: "" }]);
      if (p2 !== -1) G[idx_p][p2] = subExpr(G[idx_p][p2], [{ coeff: Ns, variable: "" }]);
      if (s1 !== -1) G[idx_p][s1] = subExpr(G[idx_p][s1], [{ coeff: Np, variable: "" }]);
      if (s2 !== -1) G[idx_p][s2] = addExpr(G[idx_p][s2], [{ coeff: Np, variable: "" }]);

      G[idx_s][idx_p] = addExpr(G[idx_s][idx_p], [{ coeff: Np, variable: "" }]);
      G[idx_s][idx_s] = addExpr(G[idx_s][idx_s], [{ coeff: Ns, variable: "" }]);
    }
  });

  const E_latex_rows = E.map(row => row.map(cell => formatExprLaTeX(cell)).join(" & ")).join(" \\\\ ");
  const G_latex_rows = G.map(row => row.map(cell => formatExprLaTeX(cell)).join(" & ")).join(" \\\\ ");
  const X_latex_rows = X_names.join(" \\\\ ");
  const X_dot_latex_rows = X_dot_names.join(" \\\\ ");
  const U_latex_rows = U.map(cell => formatExprLaTeX(cell)).join(" \\\\ ");

  const latexMatrix = `\\begin{bmatrix} ${E_latex_rows} \\end{bmatrix} \\cdot \\begin{bmatrix} ${X_dot_latex_rows} \\end{bmatrix} + \\begin{bmatrix} ${G_latex_rows} \\end{bmatrix} \\cdot \\begin{bmatrix} ${X_latex_rows} \\end{bmatrix} = \\begin{bmatrix} ${U_latex_rows} \\end{bmatrix}`;

  const subsRules: Record<string, SymbolicExpr> = {};

  workingFixedComps.forEach(comp => {
    if (!['V', 'C'].includes(comp.type)) return;
    const n1_m = find(comp.n1);
    const n2_m = find(comp.n2);
    if (n1_m === n2_m) return;

    const n1_idx = nodeMap[n1_m] ?? -1;
    const n2_idx = nodeMap[n2_m] ?? -1;
    const symN1 = n1_idx !== -1 ? X_names[n1_idx] : "0";
    const symN2 = n2_idx !== -1 ? X_names[n2_idx] : "0";
    const symN1_dot = n1_idx !== -1 ? X_dot_names[n1_idx] : "0";
    const symN2_dot = n2_idx !== -1 ? X_dot_names[n2_idx] : "0";

    const vVal: SymbolicExpr = [{ coeff: "1", variable: comp.type === 'V' ? `V_{${comp.sym || comp.id}}` : `v_{${comp.sym || comp.id}}` }];
    const vDot: SymbolicExpr = comp.type === 'V' ? [] : [{ coeff: "1", variable: `\\dot{v}_{${comp.sym || comp.id}}` }];

    if (symN1 !== "0" && !subsRules[symN1]) {
      subsRules[symN1] = addExpr(symN2 === "0" ? [] : [{ coeff: "1", variable: symN2 }], vVal);
      subsRules[symN1_dot] = addExpr(symN2_dot === "0" ? [] : [{ coeff: "1", variable: symN2_dot }], vDot);
    } else if (symN2 !== "0" && !subsRules[symN2]) {
      subsRules[symN2] = subExpr(symN1 === "0" ? [] : [{ coeff: "1", variable: symN1 }], vVal);
      subsRules[symN2_dot] = subExpr(symN1_dot === "0" ? [] : [{ coeff: "1", variable: symN1_dot }], vDot);
    }
  });

  for (let k = 0; k < 5; k++) {
    for (const [vName, targetExpr] of Object.entries(subsRules)) {
      let substitutedExpr = targetExpr;
      for (const [vNameSub, replacement] of Object.entries(subsRules)) {
        substitutedExpr = substituteVar(substitutedExpr, vNameSub, replacement);
      }
      subsRules[vName] = substitutedExpr;
    }
  }

  const rawEqsList: string[] = [];
  const simpEqsList: string[] = [];

  for (let i = 0; i < N_tot; i++) {
    let lhsExpr: SymbolicExpr = [];
    for (let j = 0; j < N_tot; j++) {
      if (E[i][j].length > 0) {
        lhsExpr = addExpr(lhsExpr, multiplyExprByVar(E[i][j], X_dot_names[j]));
      }
      if (G[i][j].length > 0) {
        lhsExpr = addExpr(lhsExpr, multiplyExprByVar(G[i][j], X_names[j]));
      }
    }

    const rhsExpr = U[i];
    const eqRawLaTeX = `${formatExprLaTeX(lhsExpr)} = ${formatExprLaTeX(rhsExpr)}`;
    
    let label = "";
    if (i < N_v) {
      label = `\\text{KCL at ${nodeList[i].replace("_", " ")}:}`;
    } else {
      const bIdx = i - N_v;
      label = `\\text{Branch Eq for ${auxBranches[bIdx].id.replace("_", " ")}:}`;
    }

    rawEqsList.push(`${label} &\\quad ${eqRawLaTeX}`);

    let lhsSimp = lhsExpr;
    let rhsSimp = rhsExpr;
    for (const [vName, replacement] of Object.entries(subsRules)) {
      lhsSimp = substituteVar(lhsSimp, vName, replacement);
      rhsSimp = substituteVar(rhsSimp, vName, replacement);
    }
    const eqSimpLaTeX = `${formatExprLaTeX(lhsSimp)} = ${formatExprLaTeX(rhsSimp)}`;
    simpEqsList.push(`${label} &\\quad ${eqSimpLaTeX}`);
  }

  const latexSeparatedRaw = `\\begin{aligned} ${rawEqsList.join(" \\\\ ")} \\end{aligned}`;
  const latexSeparatedSimp = `\\begin{aligned} ${simpEqsList.join(" \\\\ ")} \\end{aligned}`;

  const edgeEqs: Record<string, { v: string; i: string }> = {};

  function getVIEquations(c: Component, cType: string, n1: string, n2: string, auxId?: string) {
    const n1_m = find(n1);
    const n2_m = find(n2);
    const idx1 = nodeMap[n1_m] ?? -1;
    const idx2 = nodeMap[n2_m] ?? -1;

    const v1: SymbolicExpr = idx1 !== -1 ? [{ coeff: "1", variable: X_names[idx1] }] : [];
    const v2: SymbolicExpr = idx2 !== -1 ? [{ coeff: "1", variable: X_names[idx2] }] : [];
    const v1_dot: SymbolicExpr = idx1 !== -1 ? [{ coeff: "1", variable: X_dot_names[idx1] }] : [];
    const v2_dot: SymbolicExpr = idx2 !== -1 ? [{ coeff: "1", variable: X_dot_names[idx2] }] : [];

    const vRaw = subExpr(v1, v2);
    let vSimp = vRaw;
    for (const [vName, replacement] of Object.entries(subsRules)) {
      vSimp = substituteVar(vSimp, vName, replacement);
    }

    let iSimp: SymbolicExpr = [];
    const symLabel = c.sym || c.id;

    if (cType === 'R') {
      iSimp = multiplyExprByCoeff(vSimp, `1/${symLabel}`);
    } else if (cType === 'C') {
      const vDiffDot = subExpr(v1_dot, v2_dot);
      let vDiffDotSimp = vDiffDot;
      for (const [vName, replacement] of Object.entries(subsRules)) {
        vDiffDotSimp = substituteVar(vDiffDotSimp, vName, replacement);
      }
      iSimp = multiplyExprByCoeff(vDiffDotSimp, symLabel);
    } else if (['L', 'V'].includes(cType)) {
      iSimp = [{ coeff: "1", variable: `i_{${auxId || c.id}}` }];
    } else if (cType === 'I') {
      iSimp = [{ coeff: "1", variable: `I_{${symLabel}}` }];
    } else if (cType === 'SW_ON') {
      vSimp = [];
      iSimp = [{ coeff: "1", variable: `i_{${c.id}}` }];
    } else if (cType === 'SW_OFF') {
      iSimp = [];
    } else if (['X_PRI', 'X_SEC'].includes(cType)) {
      iSimp = [{ coeff: "1", variable: `i_{${auxId || c.id}}` }];
    }

    return {
      v: formatExprLaTeX(vSimp),
      i: formatExprLaTeX(iSimp)
    };
  }

  workingFixedComps.forEach(c => {
    if (c.type === 'X') {
      if (!c.p1 || !c.p2 || !c.s1 || !c.s2) return;
      const ep = getVIEquations(c, 'X_PRI', c.p1, c.p2, `${c.id}_pri`);
      const es = getVIEquations(c, 'X_SEC', c.s1, c.s2, `${c.id}_sec`);
      edgeEqs[`${c.id}_pri`] = ep;
      edgeEqs[`${c.id}_sec`] = es;
    } else {
      edgeEqs[c.id] = getVIEquations(c, c.type, c.n1, c.n2, c.id);
    }
  });

  activeSwitches.forEach(sw => {
    if (!edgeEqs[sw.id]) {
      edgeEqs[sw.id] = getVIEquations(sw, 'SW_ON', sw.n1, sw.n2);
    }
  });

  allSwitches.forEach(sw => {
    if (!edgeEqs[sw.id]) {
      edgeEqs[sw.id] = getVIEquations(sw, 'SW_OFF', sw.n1, sw.n2);
    }
  });

  return {
    latexMatrix,
    latexSeparatedRaw,
    latexSeparatedSimp,
    edgeEqs
  };
}

// --- HTML Exporter & Visual Generator ---

export function generateMNASpaceHTML(
  netlistJson: string,
  customActiveSwitchStates?: boolean[][]
): string {
  const data = JSON.parse(netlistJson);
  const stage = data.physical_stage || {};
  const isIdealMode = true;

  const fixedComps: Component[] = [];
  const switches: Component[] = [];

  // Extract component structures
  (stage.resistors || []).forEach((c: any) => {
    fixedComps.push({ type: 'R', id: c.id, n1: c.nodes[0], n2: c.nodes[1], sym: c.id });
  });
  (stage.capacitors || []).forEach((c: any) => {
    fixedComps.push({ type: 'C', id: c.id, n1: c.nodes[0], n2: c.nodes[1], sym: c.id, esr: c.parameters?.esr });
  });
  (stage.inductors || []).forEach((c: any) => {
    fixedComps.push({ type: 'L', id: c.id, n1: c.nodes[0], n2: c.nodes[1], sym: c.id, esr: c.parameters?.esr });
  });
  (stage.voltage_sources || []).forEach((c: any) => {
    fixedComps.push({ type: 'V', id: c.id, n1: c.nodes[0], n2: c.nodes[1], sym: c.id });
  });
  (stage.current_sources || []).forEach((c: any) => {
    fixedComps.push({ type: 'I', id: c.id, n1: c.nodes[0], n2: c.nodes[1], sym: c.id });
  });
  (stage.transformers || []).forEach((c: any) => {
    const pWind = c.primary_windings[0];
    const sWind = c.secondary_windings[0];
    fixedComps.push({
      type: 'X', id: c.id, n1: "", n2: "",
      p1: pWind.nodes[0], p2: pWind.nodes[1],
      s1: sWind.nodes[0], s2: sWind.nodes[1]
    });
  });
  (stage.diodes || []).forEach((c: any) => {
    switches.push({ type: 'SW', id: c.id, n1: c.nodes[0], n2: c.nodes[1] });
  });
  (stage.analog_switches || []).forEach((c: any) => {
    switches.push({ type: 'SW', id: c.id, n1: c.nodes[0], n2: c.nodes[1] });
  });

  // Nodes list
  const allNodes = new Set<string>();
  fixedComps.forEach(c => {
    if (c.type === 'X') {
      if (c.p1) allNodes.add(c.p1);
      if (c.p2) allNodes.add(c.p2);
      if (c.s1) allNodes.add(c.s1);
      if (c.s2) allNodes.add(c.s2);
    } else {
      allNodes.add(c.n1);
      allNodes.add(c.n2);
    }
  });
  switches.forEach(sw => {
    allNodes.add(sw.n1);
    allNodes.add(sw.n2);
  });

  const jsNodes = Array.from(allNodes).map(n => {
    if (n === 'node_0') {
      return `{ id: '${n}', label: 'GND (0)', color: '#ff6b6b', shape: 'box', font: {color: 'white'} }`;
    }
    return `{ id: '${n}', label: '${n.replace('_', ' ')}', color: '#a0c4ff' }`;
  });
  const jsNodesStr = jsNodes.join(",\n");

  // 1. GENERATE COMPLETE CIRCUIT MODEL
  const completeMnaComps = [...fixedComps];
  switches.forEach(sw => {
    completeMnaComps.push({ type: 'R', id: sw.id, n1: sw.n1, n2: sw.n2, sym: `R_{${sw.id}}` });
  });
  const completeMna = buildMNALatex(completeMnaComps, [], switches, 'node_0', isIdealMode);

  const completeJsEdges: string[] = [];
  const completePairCounts: Record<string, number> = {};
  const getCompleteEdgeSmooth = (n1: string, n2: string): string => {
    if (!n1 || !n2) return "smooth: false";
    const key = [n1, n2].sort().join("---");
    const count = completePairCounts[key] || 0;
    completePairCounts[key] = count + 1;
    if (count === 0) return "smooth: false";
    const roundness = 0.18 + (Math.floor((count - 1) / 2) * 0.08);
    const type = count % 2 === 1 ? 'curvedCW' : 'curvedCCW';
    return `smooth: { enabled: true, type: '${type}', roundness: ${roundness} }`;
  };

  fixedComps.forEach(c => {
    if (c.type === 'X') {
      completeJsEdges.push(`{ id: '${c.id}_pri', from: '${c.p1}', to: '${c.p2}', baseLabel: '${c.id} (Pri)', label: '${c.id} (Pri)', color: '#8b4513', font: {align: 'horizontal'}, ${getCompleteEdgeSmooth(c.p1, c.p2)} }`);
      completeJsEdges.push(`{ id: '${c.id}_sec', from: '${c.s1}', to: '${c.s2}', baseLabel: '${c.id} (Sec)', label: '${c.id} (Sec)', color: '#8b4513', font: {align: 'horizontal'}, ${getCompleteEdgeSmooth(c.s1, c.s2)} }`);
      completeJsEdges.push(`{ from: '${c.p1}', to: '${c.s1}', label: 'magnetic', color: '#cccccc', dashes: true, width: 1, smooth: false }`);
    } else {
      completeJsEdges.push(`{ id: '${c.id}', from: '${c.n1}', to: '${c.n2}', baseLabel: '${c.id}', label: '${c.id}', color: '#555555', font: {align: 'horizontal'}, ${getCompleteEdgeSmooth(c.n1, c.n2)} }`);
    }
  });
  switches.forEach(sw => {
    completeJsEdges.push(`{ id: '${sw.id}', from: '${sw.n1}', to: '${sw.n2}', baseLabel: '${sw.id} (Static)', label: '${sw.id} (Static)', color: '#17a2b8', width: 2, font: {color: '#17a2b8', align: 'horizontal'}, ${getCompleteEdgeSmooth(sw.n1, sw.n2)} }`);
  });

  const completeModeSection = `
  <div class="mode-card">
      <div class="mode-header">Complete Circuit Model (All Semiconductors as Static R)</div>
      
      <div class="flex-container">
          <!-- LEFT SIDE: Graph -->
          <div class="graph-pane" style="position: relative;">
              <div id="mynetwork_complete" class="network-canvas"></div>
              <div id="popup_complete" class="branch-popup" style="display: none;">
                  <h4 style="margin-top:0; color:#0056b3; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Branch: <span id="popup_title_complete"></span></h4>
                  <div id="popup_v_complete" class="popup-math"></div>
                  <div id="popup_i_complete" class="popup-math"></div>
              </div>
          </div>
          
          <!-- RIGHT SIDE: Equations -->
          <div class="equations-pane">
              <div class="eq-matrix">
                  <h3>State-Space Matrix</h3>
                  <div class="math-box">\\[ ${completeMna.latexMatrix} \\]</div>
              </div>
              
              <div class="eq-raw">
                  <h3>Separated Equations (Raw Node Voltages)</h3>
                  <div class="math-box">\\[ ${completeMna.latexSeparatedRaw} \\]</div>
              </div>
              
              <div class="eq-simp">
                  <h3 style="color: #28a745;">Separated Equations (Simplified)</h3>
                  <div class="math-box" style="border-left: 4px solid #28a745;">\\[ ${completeMna.latexSeparatedSimp} \\]</div>
              </div>
          </div>
      </div>
  </div>
  `;

  // 2. GENERATE COMBINATION OPERATING MODES
  const validModes: any[] = [];
  const swCount = switches.length;

  if (customActiveSwitchStates && customActiveSwitchStates.length > 0) {
    customActiveSwitchStates.forEach((swStates, mIdx) => {
      const activeSwitches: Component[] = [];
      for (let i = 0; i < swCount; i++) {
        if (swStates[i]) {
          activeSwitches.push(switches[i]);
        }
      }
      const stateDescList = switches.map((sw, idx) => {
        return `${sw.id}: <b>${swStates[idx] ? 'ON' : 'OFF'}</b>`;
      });
      const stateDesc = stateDescList.join(" | ") || "Static Circuit (No Switches)";

      const mna = buildMNALatex(fixedComps, activeSwitches, switches, 'node_0', isIdealMode);

      const jsEdges: string[] = [];
      const modePairCounts: Record<string, number> = {};
      const getModeEdgeSmooth = (n1: string, n2: string): string => {
        if (!n1 || !n2) return "smooth: false";
        const key = [n1, n2].sort().join("---");
        const count = modePairCounts[key] || 0;
        modePairCounts[key] = count + 1;
        if (count === 0) return "smooth: false";
        const roundness = 0.18 + (Math.floor((count - 1) / 2) * 0.08);
        const type = count % 2 === 1 ? 'curvedCW' : 'curvedCCW';
        return `smooth: { enabled: true, type: '${type}', roundness: ${roundness} }`;
      };

      fixedComps.forEach(c => {
        if (c.type === 'X') {
          jsEdges.push(`{ id: '${c.id}_pri', from: '${c.p1}', to: '${c.p2}', baseLabel: '${c.id} (Pri)', label: '${c.id} (Pri)', color: '#8b4513', font: {align: 'horizontal'}, ${getModeEdgeSmooth(c.p1, c.p2)} }`);
          jsEdges.push(`{ id: '${c.id}_sec', from: '${c.s1}', to: '${c.s2}', baseLabel: '${c.id} (Sec)', label: '${c.id} (Sec)', color: '#8b4513', font: {align: 'horizontal'}, ${getModeEdgeSmooth(c.s1, c.s2)} }`);
          jsEdges.push(`{ from: '${c.p1}', to: '${c.s1}', label: 'magnetic', color: '#cccccc', dashes: true, width: 1, smooth: false }`);
        } else {
          jsEdges.push(`{ id: '${c.id}', from: '${c.n1}', to: '${c.n2}', baseLabel: '${c.id}', label: '${c.id}', color: '#555555', font: {align: 'horizontal'}, ${getModeEdgeSmooth(c.n1, c.n2)} }`);
        }
      });

      switches.forEach((sw, idx) => {
        if (swStates[idx]) {
          jsEdges.push(`{ id: '${sw.id}', from: '${sw.n1}', to: '${sw.n2}', baseLabel: '${sw.id} (ON)', label: '${sw.id} (ON)', color: '#28a745', width: 3, font: {color: '#28a745', align: 'horizontal'}, ${getModeEdgeSmooth(sw.n1, sw.n2)} }`);
        } else {
          jsEdges.push(`{ id: '${sw.id}', from: '${sw.n1}', to: '${sw.n2}', baseLabel: '${sw.id} (OFF)', label: '${sw.id} (OFF)', color: '#dc3545', dashes: true, font: {color: '#dc3545', align: 'horizontal'}, ${getModeEdgeSmooth(sw.n1, sw.n2)} }`);
        }
      });

      validModes.push({
        name: stateDesc,
        latexMatrix: mna.latexMatrix,
        latexSeparatedRaw: mna.latexSeparatedRaw,
        latexSeparatedSimp: mna.latexSeparatedSimp,
        jsEdgesStr: jsEdges.join(",\n"),
        edgeEqs: mna.edgeEqs
      });
    });
  } else {
    const totalStates = 1 << swCount;

    for (let stateIdx = 0; stateIdx < totalStates; stateIdx++) {
      const activeSwitches: Component[] = [];
      const swStates: boolean[] = [];

      for (let i = 0; i < swCount; i++) {
        const isOn = ((stateIdx >> i) & 1) === 1;
        swStates.push(isOn);
        if (isOn) {
          activeSwitches.push(switches[i]);
        }
      }

      if (isValidTopology(fixedComps, activeSwitches)) {
        const stateDescList = switches.map((sw, idx) => {
          return `${sw.id}: <b>${swStates[idx] ? 'ON' : 'OFF'}</b>`;
        });
        const stateDesc = stateDescList.join(" | ") || "Static Circuit (No Switches)";

        const mna = buildMNALatex(fixedComps, activeSwitches, switches, 'node_0', isIdealMode);

        const jsEdges: string[] = [];
        const modePairCounts: Record<string, number> = {};
        const getModeEdgeSmooth = (n1: string, n2: string): string => {
          if (!n1 || !n2) return "smooth: false";
          const key = [n1, n2].sort().join("---");
          const count = modePairCounts[key] || 0;
          modePairCounts[key] = count + 1;
          if (count === 0) return "smooth: false";
          const roundness = 0.18 + (Math.floor((count - 1) / 2) * 0.08);
          const type = count % 2 === 1 ? 'curvedCW' : 'curvedCCW';
          return `smooth: { enabled: true, type: '${type}', roundness: ${roundness} }`;
        };

        fixedComps.forEach(c => {
          if (c.type === 'X') {
            jsEdges.push(`{ id: '${c.id}_pri', from: '${c.p1}', to: '${c.p2}', baseLabel: '${c.id} (Pri)', label: '${c.id} (Pri)', color: '#8b4513', font: {align: 'horizontal'}, ${getModeEdgeSmooth(c.p1, c.p2)} }`);
            jsEdges.push(`{ id: '${c.id}_sec', from: '${c.s1}', to: '${c.s2}', baseLabel: '${c.id} (Sec)', label: '${c.id} (Sec)', color: '#8b4513', font: {align: 'horizontal'}, ${getModeEdgeSmooth(c.s1, c.s2)} }`);
            jsEdges.push(`{ from: '${c.p1}', to: '${c.s1}', label: 'magnetic', color: '#cccccc', dashes: true, width: 1, smooth: false }`);
          } else {
            jsEdges.push(`{ id: '${c.id}', from: '${c.n1}', to: '${c.n2}', baseLabel: '${c.id}', label: '${c.id}', color: '#555555', font: {align: 'horizontal'}, ${getModeEdgeSmooth(c.n1, c.n2)} }`);
          }
        });

        switches.forEach((sw, idx) => {
          if (swStates[idx]) {
            jsEdges.push(`{ id: '${sw.id}', from: '${sw.n1}', to: '${sw.n2}', baseLabel: '${sw.id} (ON)', label: '${sw.id} (ON)', color: '#28a745', width: 3, font: {color: '#28a745', align: 'horizontal'}, ${getModeEdgeSmooth(sw.n1, sw.n2)} }`);
          } else {
            jsEdges.push(`{ id: '${sw.id}', from: '${sw.n1}', to: '${sw.n2}', baseLabel: '${sw.id} (OFF)', label: '${sw.id} (OFF)', color: '#dc3545', dashes: true, font: {color: '#dc3545', align: 'horizontal'}, ${getModeEdgeSmooth(sw.n1, sw.n2)} }`);
          }
        });

        validModes.push({
          name: stateDesc,
          latexMatrix: mna.latexMatrix,
          latexSeparatedRaw: mna.latexSeparatedRaw,
          latexSeparatedSimp: mna.latexSeparatedSimp,
          jsEdgesStr: jsEdges.join(",\n"),
          edgeEqs: mna.edgeEqs
        });
      }
    }
  }

  const combinationModesSections: string[] = [];
  const combinationJsScripts: string[] = [];

  if (validModes.length === 0) {
    combinationModesSections.push("<h2 style='color:red;'>No valid operating modes found! Every state causes a topological violation.</h2>");
  } else {
    validModes.forEach((mode, idx) => {
      const section = `
      <div class="mode-card">
          <div class="mode-header">Mode ${idx + 1}: ${mode.name}</div>
          
          <div class="flex-container">
              <!-- LEFT SIDE: Graph -->
              <div class="graph-pane" style="position: relative;">
                  <div id="mynetwork_${idx}" class="network-canvas"></div>
                  <div id="popup_${idx}" class="branch-popup" style="display: none;">
                      <h4 style="margin-top:0; color:#0056b3; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Branch: <span id="popup_title_${idx}"></span></h4>
                      <div id="popup_v_${idx}" class="popup-math"></div>
                      <div id="popup_i_${idx}" class="popup-math"></div>
                  </div>
              </div>
              
              <!-- RIGHT SIDE: Equations -->
              <div class="equations-pane">
                  <div class="eq-matrix">
                      <h3>State-Space Matrix</h3>
                      <div class="math-box">\\[ ${mode.latexMatrix} \\]</div>
                  </div>
                  
                  <div class="eq-raw">
                      <h3>Separated Equations (Raw Node Voltages)</h3>
                      <div class="math-box">\\[ ${mode.latexSeparatedRaw} \\]</div>
                  </div>
                  
                  <div class="eq-simp">
                      <h3 style="color: #28a745;">Separated Equations (Simplified)</h3>
                      <div class="math-box" style="border-left: 4px solid #28a745;">\\[ ${mode.latexSeparatedSimp} \\]</div>
                  </div>
              </div>
          </div>
      </div>
      `;
      combinationModesSections.push(section);

      const eqJsonStr = JSON.stringify(mode.edgeEqs).replace(/\\/g, '\\\\');

      const js = `
      var nodes_${idx} = new vis.DataSet([${jsNodesStr}]);
      var edges_${idx} = new vis.DataSet([${mode.jsEdgesStr}]);
      var container_${idx} = document.getElementById('mynetwork_${idx}');
      var network_${idx} = new vis.Network(container_${idx}, { nodes: nodes_${idx}, edges: edges_${idx} }, options);
      window['network_' + ${idx}] = network_${idx};
      
      var edgeEqs_${idx} = JSON.parse('${eqJsonStr}');
      var edgeStates_${idx} = {};

      network_${idx}.on("click", function(params) {
          var popup = document.getElementById("popup_${idx}");
          if (params.edges.length > 0) {
              var edgeId = params.edges[0];
              var edge = edges_${idx}.get(edgeId);
              if(!edge || !edge.baseLabel) return;
              
              var state = (edgeStates_${idx}[edgeId] || 0);
              state = (state + 1) % 3;
              edgeStates_${idx}[edgeId] = state;
              
              edges_${idx}.get().forEach(function(e) {
                  if(e.id !== edgeId && e.baseLabel) {
                      edgeStates_${idx}[e.id] = 0;
                      e.label = e.baseLabel;
                      e.arrows = undefined;
                      edges_${idx}.update(e);
                  }
              });

              if (state === 0) {
                  edge.label = edge.baseLabel;
                  edge.arrows = undefined;
                  popup.style.display = "none";
              } else if (state === 1) {
                  edge.label = "(+) " + edge.baseLabel + " (-)";
                  edge.arrows = undefined;
                  popup.style.display = "block";
              } else if (state === 2) {
                  edge.label = edge.baseLabel;
                  edge.arrows = 'to';
                  popup.style.display = "block";
              }
              edges_${idx}.update(edge);
              
              if(state > 0 && edgeEqs_${idx}[edgeId]) {
                  document.getElementById("popup_title_${idx}").innerText = edge.baseLabel;
                  document.getElementById("popup_v_${idx}").innerHTML = "$$ v_{" + edgeId.replace('_', '\\\\_') + "} = " + edgeEqs_${idx}[edgeId].v + " $$";
                  document.getElementById("popup_i_${idx}").innerHTML = "$$ i_{" + edgeId.replace('_', '\\\\_') + "} = " + edgeEqs_${idx}[edgeId].i + " $$";
                  MathJax.typesetPromise([popup]).catch(function (err) { console.log(err.message); });
              }

          } else {
              popup.style.display = "none";
              edges_${idx}.get().forEach(function(e) {
                  if(e.baseLabel) {
                      edgeStates_${idx}[e.id] = 0;
                      e.label = e.baseLabel;
                      e.arrows = undefined;
                      edges_${idx}.update(e);
                  }
              });
          }
      });
      `;
      combinationJsScripts.push(js);
    });
  }

  const completeEqJsonStr = JSON.stringify(completeMna.edgeEqs).replace(/\\/g, '\\\\');

  const htmlContent = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <title>Interactive MNA Extractor</title>
      <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
      <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
      <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #eef2f5; padding: 20px; color: #333; }
          .container { max-width: 1400px; margin: auto; }
          
          /* Tab Panel Styling */
          .tab-panel {
              background: #fff;
              padding: 15px;
              border-radius: 8px;
              box-shadow: 0 4px 10px rgba(0,0,0,0.05);
              margin-bottom: 20px;
              text-align: center;
              border: 1px solid #ddd;
              position: sticky;
              top: 10px;
              z-index: 1000;
              display: flex;
              justify-content: center;
              gap: 15px;
              align-items: center;
          }
          .tab-btn {
              background-color: #f1f3f5;
              border: 1px solid #ced4da;
              color: #495057;
              padding: 10px 22px;
              font-size: 105%;
              font-weight: bold;
              border-radius: 6px;
              cursor: pointer;
              transition: all 0.2s ease-in-out;
          }
          .tab-btn:hover {
              background-color: #e9ecef;
          }
          .tab-btn.active {
              background-color: #0056b3;
              color: white;
              border-color: #0056b3;
              box-shadow: 0 4px 10px rgba(0,86,179,0.25);
          }
          
          .control-panel { background: #fff; padding: 12px; border-radius: 8px; border: 1px solid #eee; margin-top: 10px; text-align: center; }
          .control-panel label { margin: 0 15px; font-weight: bold; cursor: pointer; color: #0056b3; }
          .control-panel input { margin-right: 5px; transform: scale(1.1); cursor: pointer; }
          
          .mode-card { background: white; padding: 20px; margin-bottom: 40px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.08); border-left: 6px solid #0056b3; }
          .mode-header { font-size: 150%; color: #0056b3; font-weight: bold; margin-bottom: 15px; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px; }
          .flex-container { display: flex; flex-wrap: wrap; gap: 2%; align-items: stretch; }
          .graph-pane { flex: 1; min-width: 400px; display: flex; flex-direction: column; }
          .equations-pane { flex: 1.5; min-width: 500px; max-height: 600px; overflow-y: auto; padding-right: 10px; }
          .math-box { overflow-x: auto; font-size: 110%; padding: 15px; background-color: #fdfdfd; border: 1px solid #eee; margin-bottom: 20px; border-radius: 5px; }
          .network-canvas { width: 100%; height: 500px; border: 1px solid #ccc; background-color: #fafafa; border-radius: 5px; box-shadow: inset 0 0 10px rgba(0,0,0,0.05); }
          h3 { margin-top: 0; color: #444; }
          .equations-pane::-webkit-scrollbar { width: 8px; }
          .equations-pane::-webkit-scrollbar-thumb { background-color: #bbb; border-radius: 4px; }
          
          .branch-popup {
              position: absolute;
              top: 15px;
              right: 15px;
              background: rgba(255, 255, 255, 0.95);
              border: 2px solid #17a2b8;
              border-radius: 8px;
              padding: 15px;
              box-shadow: 0 4px 15px rgba(0,0,0,0.15);
              z-index: 10;
              pointer-events: none;
              min-width: 250px;
          }
          .popup-math { font-size: 115%; margin: 10px 0; }
      </style>
  </head>
  <body>
      <div class="container">
          <h1 style="text-align: center; color: #333; margin-top: 0;">Extracted MNA State-Space</h1>
          
          <div class="tab-panel">
              <button id="btn_tab_complete" class="tab-btn active" onclick="switchMainTab('complete')">Complete Circuit Model</button>
              <button id="btn_tab_modes" class="tab-btn" onclick="switchMainTab('modes')">Ideal Operating Modes</button>
          </div>

          <div class="control-panel">
              <span style="color: #666; margin-right: 20px;">Toggle Right-Pane Views:</span>
              <label><input type="checkbox" id="chk_matrix" checked onchange="toggleEquations()"> State-Space Matrix</label>
              <label><input type="checkbox" id="chk_raw" checked onchange="toggleEquations()"> Raw Node Eqns</label>
              <label><input type="checkbox" id="chk_simp" checked onchange="toggleEquations()"> Simplified Eqns (V/C)</label>
          </div>

          <!-- TAB 1: COMPLETE MODEL -->
          <div id="tab_complete" class="tab-content" style="margin-top: 20px;">
              ${completeModeSection}
          </div>

          <!-- TAB 2: OPERATING SWITCH MODES -->
          <div id="tab_modes" class="tab-content" style="display: none; margin-top: 20px;">
              ${combinationModesSections.join("")}
          </div>
      </div>

      <script type="text/javascript">
          function toggleEquations() {
              const showMatrix = document.getElementById('chk_matrix').checked;
              const showRaw = document.getElementById('chk_raw').checked;
              const showSimp = document.getElementById('chk_simp').checked;
              
              document.querySelectorAll('.eq-matrix').forEach(el => el.style.display = showMatrix ? 'block' : 'none');
              document.querySelectorAll('.eq-raw').forEach(el => el.style.display = showRaw ? 'block' : 'none');
              document.querySelectorAll('.eq-simp').forEach(el => el.style.display = showSimp ? 'block' : 'none');
          }

          function switchMainTab(tab) {
              document.getElementById('tab_complete').style.display = tab === 'complete' ? 'block' : 'none';
              document.getElementById('tab_modes').style.display = tab === 'modes' ? 'block' : 'none';
              
              document.getElementById('btn_tab_complete').classList.toggle('active', tab === 'complete');
              document.getElementById('btn_tab_modes').classList.toggle('active', tab === 'modes');
              
              // Redraw the graph network to solve container size issues in hidden containers
              if (tab === 'complete') {
                  if (window.network_complete) {
                      window.network_complete.redraw();
                      window.network_complete.fit();
                  }
              } else {
                  for (var i = 0; i < ${validModes.length}; i++) {
                      if (window['network_' + i]) {
                          window['network_' + i].redraw();
                          window['network_' + i].fit();
                      }
                  }
              }
          }
          
          var options = {
              physics: { solver: 'forceAtlas2Based', forceAtlas2Based: { gravitationalConstant: -50, centralGravity: 0.01, springLength: 100, springConstant: 0.08 } },
              edges: { smooth: { type: 'smooth' }, width: 2 },
              nodes: { borderWidth: 2, font: { size: 16, bold: true } }
          };

          // COMPLETE GRAPH RENDERER
          var nodes_complete = new vis.DataSet([${jsNodesStr}]);
          var edges_complete = new vis.DataSet([${completeJsEdges.join(",\n")}]);
          var container_complete = document.getElementById('mynetwork_complete');
          var network_complete = new vis.Network(container_complete, { nodes: nodes_complete, edges: edges_complete }, options);
          window.network_complete = network_complete;
          
          var edgeEqs_complete = JSON.parse('${completeEqJsonStr}');
          var edgeStates_complete = {};

          network_complete.on("click", function(params) {
              var popup = document.getElementById("popup_complete");
              if (params.edges.length > 0) {
                  var edgeId = params.edges[0];
                  var edge = edges_complete.get(edgeId);
                  if(!edge || !edge.baseLabel) return;
                  
                  var state = (edgeStates_complete[edgeId] || 0);
                  state = (state + 1) % 3;
                  edgeStates_complete[edgeId] = state;
                  
                  edges_complete.get().forEach(function(e) {
                      if(e.id !== edgeId && e.baseLabel) {
                          edgeStates_complete[e.id] = 0;
                          e.label = e.baseLabel;
                          e.arrows = undefined;
                          edges_complete.update(e);
                      }
                  });

                  if (state === 0) {
                      edge.label = edge.baseLabel;
                      edge.arrows = undefined;
                      popup.style.display = "none";
                  } else if (state === 1) {
                      edge.label = "(+) " + edge.baseLabel + " (-)";
                      edge.arrows = undefined;
                      popup.style.display = "block";
                  } else if (state === 2) {
                      edge.label = edge.baseLabel;
                      edge.arrows = 'to';
                      popup.style.display = "block";
                  }
                  edges_complete.update(edge);
                  
                  if(state > 0 && edgeEqs_complete[edgeId]) {
                      document.getElementById("popup_title_complete").innerText = edge.baseLabel;
                      document.getElementById("popup_v_complete").innerHTML = "$$ v_{" + edgeId.replace('_', '\\\\_') + "} = " + edgeEqs_complete[edgeId].v + " $$";
                      document.getElementById("popup_i_complete").innerHTML = "$$ i_{" + edgeId.replace('_', '\\\\_') + "} = " + edgeEqs_complete[edgeId].i + " $$";
                      MathJax.typesetPromise([popup]).catch(function (err) { console.log(err.message); });
                  }

              } else {
                  popup.style.display = "none";
                  edges_complete.get().forEach(function(e) {
                      if(e.baseLabel) {
                          edgeStates_complete[e.id] = 0;
                          e.label = e.baseLabel;
                          e.arrows = undefined;
                          edges_complete.update(e);
                      }
                  });
              }
          });

          // COMBINATION OPERATING MODES GRAPHS
          ${combinationJsScripts.join("\n")}
      </script>
  </body>
  </html>
  `;

  return htmlContent;
}
