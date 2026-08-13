import json
import sympy as sp
import tkinter as tk
from tkinter import messagebox
import webbrowser
import os
import tempfile
import itertools

def is_valid_topology(fixed_comps, active_switches):
    def build_adj(comps):
        adj = {}
        for c in comps:
            if c.get('type') == 'X':
                edges = [(c['p1'], c['p2']), (c['s1'], c['s2'])]
            else:
                edges = [(c['n1'], c['n2'])]
                
            for n1, n2 in edges:
                if n1 not in adj: adj[n1] = []
                adj[n1].append(n2)
                if n2 not in adj: adj[n2] = []
                adj[n2].append(n1)
        return adj
        
    def has_path(adj, start, end):
        if start not in adj or end not in adj: return False
        if start == end: return True
        visited = set([start])
        q = [start]
        while q:
            curr = q.pop(0)
            if curr == end: return True
            for nxt in adj.get(curr, []):
                if nxt not in visited:
                    visited.add(nxt)
                    q.append(nxt)
        return False

    sw_adj = build_adj(active_switches)
    for v in [c for c in fixed_comps if c['type'] == 'V']:
        if has_path(sw_adj, v['n1'], v['n2']): return False 

    i_sources = [c for c in fixed_comps if c['type'] in ['I', 'L']]
    for i_src in i_sources:
        other_comps = [c for c in fixed_comps if c != i_src] + active_switches
        full_adj = build_adj(other_comps)
        if not has_path(full_adj, i_src['n1'], i_src['n2']): return False 

    return True

def build_mna_latex(mna_components, active_switches=[], all_switches=[]):
    
    def format_sym(name):
        if '_' in name:
            base, sub = name.split('_', 1)
            safe_sub = sub.replace('_', r'\_')
            return f"{base}_{{{safe_sub}}}"
        return name

    nodes = set()
    for c in mna_components:
        if c.get('type') == 'X':
            nodes.update([c['p1'], c['p2'], c['s1'], c['s2']])
        else:
            nodes.update([c['n1'], c['n2']])
    
    for sw in active_switches:
        nodes.update([sw['n1'], sw['n2']])
            
    parent = {n: n for n in nodes}
    
    def find(i):
        if parent[i] == i: return i
        parent[i] = find(parent[i])
        return parent[i]
        
    def union(i, j):
        ri, rj = find(i), find(j)
        if ri != rj:
            if ri == 'node_0': parent[rj] = ri
            elif rj == 'node_0': parent[ri] = rj
            elif ri < rj: parent[rj] = ri
            else: parent[ri] = rj

    for sw in active_switches:
        if sw['n1'] in nodes and sw['n2'] in nodes:
            union(sw['n1'], sw['n2'])

    unique_nodes = set(find(n) for n in nodes)
    if 'node_0' in unique_nodes: unique_nodes.remove('node_0')
    node_list = sorted(list(unique_nodes))
    node_map = {node: i for i, node in enumerate(node_list)}
    node_map['node_0'] = -1

    N_v = len(node_list)
    
    aux_branches = []
    for c in mna_components:
        if c['type'] in ['V', 'L']:
            aux_branches.append({'id': c['id'], 'comp': c})
        elif c['type'] == 'X':
            aux_branches.append({'id': f"{c['id']}_pri", 'comp': c})
            aux_branches.append({'id': f"{c['id']}_sec", 'comp': c})
            
    N_i = len(aux_branches)
    N_tot = N_v + N_i

    E = sp.zeros(N_tot, N_tot)
    G = sp.zeros(N_tot, N_tot)
    U = sp.zeros(N_tot, 1)
    X = sp.zeros(N_tot, 1)

    for i, node in enumerate(node_list):
        safe_node = node.replace('_', r'\_')
        X[i, 0] = sp.Symbol(f"v_{{{safe_node}}}")

    for idx, aux in enumerate(aux_branches):
        sym_str = format_sym(aux['id'])
        branch_idx = N_v + idx
        X[branch_idx, 0] = sp.Symbol(f"i_{{{sym_str}}}")

    branch_count = N_v

    for comp in mna_components:
        if comp['type'] != 'X':
            n1_m, n2_m = find(comp['n1']), find(comp['n2'])
            n1, n2 = node_map.get(n1_m, -1), node_map.get(n2_m, -1)
            sym_val = sp.Symbol(format_sym(comp['sym']))
            if n1 == n2 and comp['type'] in ['R', 'C', 'I']: continue

        if comp['type'] == 'R':
            g = 1 / sym_val
            if n1 != -1: G[n1, n1] += g
            if n2 != -1: G[n2, n2] += g
            if n1 != -1 and n2 != -1:
                G[n1, n2] -= g; G[n2, n1] -= g
        elif comp['type'] == 'C':
            c = sym_val
            if n1 != -1: E[n1, n1] += c
            if n2 != -1: E[n2, n2] += c
            if n1 != -1 and n2 != -1:
                E[n1, n2] -= c; E[n2, n1] -= c
        elif comp['type'] == 'L':
            idx = branch_count; branch_count += 1
            E[idx, idx] = sym_val
            if n1 != -1: G[n1, idx] += 1; G[idx, n1] -= 1
            if n2 != -1: G[n2, idx] -= 1; G[idx, n2] += 1
        elif comp['type'] == 'V':
            idx = branch_count; branch_count += 1
            if n1 != -1: G[n1, idx] += 1; G[idx, n1] += 1
            if n2 != -1: G[n2, idx] -= 1; G[idx, n2] -= 1
            U[idx, 0] = sym_val
        elif comp['type'] == 'I':
            if n1 != -1: U[n1, 0] -= sym_val
            if n2 != -1: U[n2, 0] += sym_val
        elif comp['type'] == 'X':
            p1_m, p2_m = find(comp['p1']), find(comp['p2'])
            s1_m, s2_m = find(comp['s1']), find(comp['s2'])
            p1, p2 = node_map.get(p1_m, -1), node_map.get(p2_m, -1)
            s1, s2 = node_map.get(s1_m, -1), node_map.get(s2_m, -1)
            idx_p = branch_count; branch_count += 1
            idx_s = branch_count; branch_count += 1
            
            Np = sp.Symbol(f"N_{{{format_sym(comp['id'] + '_p')}}}")
            Ns = sp.Symbol(f"N_{{{format_sym(comp['id'] + '_s')}}}")
            
            if p1 != -1: G[p1, idx_p] += 1
            if p2 != -1: G[p2, idx_p] -= 1
            if s1 != -1: G[s1, idx_s] += 1
            if s2 != -1: G[s2, idx_s] -= 1
            if p1 != -1: G[idx_p, p1] += Ns
            if p2 != -1: G[idx_p, p2] -= Ns
            if s1 != -1: G[idx_p, s1] -= Np
            if s2 != -1: G[idx_p, s2] += Np
            G[idx_s, idx_p] += Np
            G[idx_s, idx_s] += Ns

    X_dot = sp.Matrix([sp.Symbol(r"\dot{" + str(x.name) + "}") for x in X])
    matrix_eq = sp.Eq(sp.MatAdd(sp.MatMul(E, X_dot), sp.MatMul(G, X)), U)
    latex_matrix = sp.latex(matrix_eq)
    LHS = E * X_dot + G * X

    # SUBSTITUTION ENGINE
    subs_rules = {}
    for comp in mna_components:
        if comp['type'] not in ['V', 'C']: continue
        n1_m, n2_m = find(comp['n1']), find(comp['n2'])
        if n1_m == n2_m: continue
        
        n1_idx, n2_idx = node_map.get(n1_m, -1), node_map.get(n2_m, -1)
        sym_n1 = X[n1_idx, 0] if n1_idx != -1 else 0
        sym_n2 = X[n2_idx, 0] if n2_idx != -1 else 0
        sym_n1_dot = X_dot[n1_idx, 0] if n1_idx != -1 else 0
        sym_n2_dot = X_dot[n2_idx, 0] if n2_idx != -1 else 0
        
        if comp['type'] == 'V':
            v_val = sp.Symbol(format_sym(comp['sym']))
            v_dot = 0  
        else:
            v_val = sp.Symbol(f"v_{{{format_sym(comp['sym'])}}}")
            v_dot = sp.Symbol(rf"\dot{{v_{{{format_sym(comp['sym'])}}}}}")
            
        if sym_n1 != 0 and sym_n1 not in subs_rules:
            subs_rules[sym_n1] = sym_n2 + v_val
            subs_rules[sym_n1_dot] = sym_n2_dot + v_dot
        elif sym_n2 != 0 and sym_n2 not in subs_rules:
            subs_rules[sym_n2] = sym_n1 - v_val
            subs_rules[sym_n2_dot] = sym_n1_dot - v_dot

    for _ in range(5):
        for k in subs_rules:
            if hasattr(subs_rules[k], 'subs'):
                subs_rules[k] = subs_rules[k].subs(subs_rules)

    individual_equations_latex_raw = []
    individual_equations_latex_simp = []
    
    for i in range(E.shape[0]):
        eq = sp.Eq(LHS[i, 0], U[i, 0])
        if i < len(node_list):
            clean_node_name = node_list[i].replace('_', ' ')
            label = rf"\text{{KCL at {clean_node_name}:}}"
        else:
            branch_idx = i - len(node_list)
            clean_comp_name = aux_branches[branch_idx]['id'].replace('_', ' ')
            label = rf"\text{{Branch Eq for {clean_comp_name}:}}"
            
        individual_equations_latex_raw.append(label + r" &\quad " + sp.latex(eq))
        eq_simp = eq.subs(subs_rules)
        eq_simp = sp.simplify(sp.expand(eq_simp)) 
        individual_equations_latex_simp.append(label + r" &\quad " + sp.latex(eq_simp))
    
    latex_separated_raw = r"\begin{aligned} " + r" \\ ".join(individual_equations_latex_raw) + r" \end{aligned}"
    latex_separated_simp = r"\begin{aligned} " + r" \\ ".join(individual_equations_latex_simp) + r" \end{aligned}"

    # ---------------------------------------------------------
    # CALCULATE BRANCH EQUATIONS FOR POPUP
    # ---------------------------------------------------------
    edge_eqs = {}
    
    def get_v_i_simp(c, c_type, n1, n2, aux_id=None):
        n1_m, n2_m = find(n1), find(n2)
        idx1, idx2 = node_map.get(n1_m, -1), node_map.get(n2_m, -1)
        
        V1 = X[idx1, 0] if idx1 != -1 else sp.sympify(0)
        V2 = X[idx2, 0] if idx2 != -1 else sp.sympify(0)
        V1_dot = X_dot[idx1, 0] if idx1 != -1 else sp.sympify(0)
        V2_dot = X_dot[idx2, 0] if idx2 != -1 else sp.sympify(0)
        
        V_raw = V1 - V2
        V_simp = sp.simplify(sp.expand(V_raw.subs(subs_rules)))
        
        if c_type == 'R':
            val = sp.Symbol(format_sym(c.get('sym', c['id'])))
            I_simp = sp.simplify(sp.expand((V_raw / val).subs(subs_rules)))
        elif c_type == 'C':
            val = sp.Symbol(format_sym(c.get('sym', c['id'])))
            I_simp = sp.simplify(sp.expand((val * (V1_dot - V2_dot)).subs(subs_rules)))
        elif c_type in ['L', 'V']:
            I_simp = sp.Symbol(f"i_{{{format_sym(aux_id)}}}")
        elif c_type == 'I':
            I_simp = sp.Symbol(format_sym(c.get('sym', c['id'])))
        elif c_type == 'SW_ON':
            V_simp = sp.sympify(0)
            I_simp = sp.Symbol(r"\text{(Defined by Circuit KCL)}")
        elif c_type == 'SW_OFF':
            I_simp = sp.sympify(0)
        elif c_type in ['X_PRI', 'X_SEC']:
            I_simp = sp.Symbol(f"i_{{{format_sym(aux_id)}}}")
        else:
            I_simp = sp.Symbol("?")
            
        return V_simp, I_simp

    for c in mna_components:
        if c['type'] == 'X':
            vp, ip = get_v_i_simp(c, 'X_PRI', c['p1'], c['p2'], f"{c['id']}_pri")
            vs, is_ = get_v_i_simp(c, 'X_SEC', c['s1'], c['s2'], f"{c['id']}_sec")
            edge_eqs[f"{c['id']}_pri"] = {'v': sp.latex(vp), 'i': sp.latex(ip)}
            edge_eqs[f"{c['id']}_sec"] = {'v': sp.latex(vs), 'i': sp.latex(is_)}
        else:
            v, i = get_v_i_simp(c, c['type'], c['n1'], c['n2'], c['id'])
            edge_eqs[c['id']] = {'v': sp.latex(v), 'i': sp.latex(i)}
            
    for sw in active_switches:
        if sw['id'] not in edge_eqs:
            v, i = get_v_i_simp(sw, 'SW_ON', sw['n1'], sw['n2'])
            edge_eqs[sw['id']] = {'v': sp.latex(v), 'i': sp.latex(i)}
            
    if all_switches:
        for sw in all_switches:
            if sw['id'] not in edge_eqs:
                v, i = get_v_i_simp(sw, 'SW_OFF', sw['n1'], sw['n2'])
                edge_eqs[sw['id']] = {'v': sp.latex(v), 'i': sp.latex(i)}

    return latex_matrix, latex_separated_raw, latex_separated_simp, node_list, edge_eqs

def parse_and_generate_html(json_data, run_mode="complete"):
    data = json.loads(json_data)
    stage = data.get('physical_stage', {})

    fixed_comps = []
    switches = []

    for comp in stage.get('resistors', []):
        fixed_comps.append({'type': 'R', 'id': comp['id'], 'n1': comp['nodes'][0], 'n2': comp['nodes'][1], 'sym': comp['id']})
    for comp in stage.get('capacitors', []):
        fixed_comps.append({'type': 'C', 'id': comp['id'], 'n1': comp['nodes'][0], 'n2': comp['nodes'][1], 'sym': comp['id']})
    for comp in stage.get('inductors', []):
        fixed_comps.append({'type': 'L', 'id': comp['id'], 'n1': comp['nodes'][0], 'n2': comp['nodes'][1], 'sym': comp['id']})
    for comp in stage.get('voltage_sources', []):
        fixed_comps.append({'type': 'V', 'id': comp['id'], 'n1': comp['nodes'][0], 'n2': comp['nodes'][1], 'sym': comp['id']})
    for comp in stage.get('current_sources', []):
        fixed_comps.append({'type': 'I', 'id': comp['id'], 'n1': comp['nodes'][0], 'n2': comp['nodes'][1], 'sym': comp['id']})
    
    for comp in stage.get('transformers', []):
        p_wind = comp['primary_windings'][0]
        s_wind = comp['secondary_windings'][0]
        fixed_comps.append({
            'type': 'X', 'id': comp['id'],
            'p1': p_wind['nodes'][0], 'p2': p_wind['nodes'][1],
            's1': s_wind['nodes'][0], 's2': s_wind['nodes'][1]
        })
        
    for comp in stage.get('diodes', []):
        switches.append({'type': 'SW', 'id': comp['id'], 'n1': comp['nodes'][0], 'n2': comp['nodes'][1]})
    for comp in stage.get('analog_switches', []):
        switches.append({'type': 'SW', 'id': comp['id'], 'n1': comp['nodes'][0], 'n2': comp['nodes'][1]})

    all_nodes = set()
    for c in fixed_comps:
        if c.get('type') == 'X':
            all_nodes.update([c['p1'], c['p2'], c['s1'], c['s2']])
        else:
            all_nodes.update([c['n1'], c['n2']])
    for sw in switches:
        all_nodes.update([sw['n1'], sw['n2']])

    js_nodes = []
    for n in all_nodes:
        if n == 'node_0':
            js_nodes.append(f"{{ id: '{n}', label: 'GND (0)', color: '#ff6b6b', shape: 'box', font: {{color: 'white'}} }}")
        else:
            js_nodes.append(f"{{ id: '{n}', label: '{n.replace('_', ' ')}', color: '#a0c4ff' }}")
    js_nodes_str = ",\n".join(js_nodes)

    valid_modes = []
    
    if run_mode == "complete":
        mna_components = list(fixed_comps)
        for sw in switches:
            mna_components.append({'type': 'R', 'id': sw['id'], 'n1': sw['n1'], 'n2': sw['n2'], 'sym': f"R_{sw['id']}"})
            
        lat_mat, lat_sep_raw, lat_sep_simp, _, edge_eqs = build_mna_latex(mna_components, active_switches=[], all_switches=switches)
        
        js_edges = []
        for c in fixed_comps:
            if c['type'] == 'X':
                js_edges.append(f"{{ id: '{c['id']}_pri', from: '{c['p1']}', to: '{c['p2']}', baseLabel: '{c['id']} (Pri)', label: '{c['id']} (Pri)', color: '#8b4513', font: {{align: 'horizontal'}} }}")
                js_edges.append(f"{{ id: '{c['id']}_sec', from: '{c['s1']}', to: '{c['s2']}', baseLabel: '{c['id']} (Sec)', label: '{c['id']} (Sec)', color: '#8b4513', font: {{align: 'horizontal'}} }}")
                js_edges.append(f"{{ from: '{c['p1']}', to: '{c['s1']}', label: 'magnetic', color: '#cccccc', dashes: true, width: 1 }}")
            else:
                js_edges.append(f"{{ id: '{c['id']}', from: '{c['n1']}', to: '{c['n2']}', baseLabel: '{c['id']}', label: '{c['id']}', color: '#555555', font: {{align: 'horizontal'}} }}")
        for sw in switches:
            js_edges.append(f"{{ id: '{sw['id']}', from: '{sw['n1']}', to: '{sw['n2']}', baseLabel: '{sw['id']} (Static)', label: '{sw['id']} (Static)', color: '#17a2b8', width: 2, font: {{color: '#17a2b8', align: 'horizontal'}} }}")
            
        valid_modes.append({
            'name': 'Complete Circuit Model (All Semiconductors as Static R)',
            'latex_matrix': lat_mat, 'latex_separated_raw': lat_sep_raw, 'latex_separated_simp': lat_sep_simp,
            'js_edges_str': ",\n".join(js_edges), 'edge_eqs': edge_eqs
        })

    elif run_mode == "modes":
        for state in itertools.product([False, True], repeat=len(switches)):
            active_switches = [sw for sw, is_on in zip(switches, state) if is_on]
            
            if is_valid_topology(fixed_comps, active_switches):
                mna_components = list(fixed_comps)
                state_desc = " | ".join([f"{sw['id']}: <b>{'ON' if is_on else 'OFF'}</b>" for sw, is_on in zip(switches, state)])
                if not switches: state_desc = "Static Circuit (No Switches)"
    
                lat_mat, lat_sep_raw, lat_sep_simp, _, edge_eqs = build_mna_latex(mna_components, active_switches=active_switches, all_switches=switches)
    
                js_edges = []
                for c in fixed_comps:
                    if c['type'] == 'X':
                        js_edges.append(f"{{ id: '{c['id']}_pri', from: '{c['p1']}', to: '{c['p2']}', baseLabel: '{c['id']} (Pri)', label: '{c['id']} (Pri)', color: '#8b4513', font: {{align: 'horizontal'}} }}")
                        js_edges.append(f"{{ id: '{c['id']}_sec', from: '{c['s1']}', to: '{c['s2']}', baseLabel: '{c['id']} (Sec)', label: '{c['id']} (Sec)', color: '#8b4513', font: {{align: 'horizontal'}} }}")
                        js_edges.append(f"{{ from: '{c['p1']}', to: '{c['s1']}', label: 'magnetic', color: '#cccccc', dashes: true, width: 1 }}")
                    else:
                        js_edges.append(f"{{ id: '{c['id']}', from: '{c['n1']}', to: '{c['n2']}', baseLabel: '{c['id']}', label: '{c['id']}', color: '#555555', font: {{align: 'horizontal'}} }}")
                
                for sw, is_on in zip(switches, state):
                    if is_on:
                        js_edges.append(f"{{ id: '{sw['id']}', from: '{sw['n1']}', to: '{sw['n2']}', baseLabel: '{sw['id']} (ON)', label: '{sw['id']} (ON)', color: '#28a745', width: 3, font: {{color: '#28a745', align: 'horizontal'}} }}")
                    else:
                        js_edges.append(f"{{ id: '{sw['id']}', from: '{sw['n1']}', to: '{sw['n2']}', baseLabel: '{sw['id']} (OFF)', label: '{sw['id']} (OFF)', color: '#dc3545', dashes: true, font: {{color: '#dc3545', align: 'horizontal'}} }}")
                
                valid_modes.append({
                    'name': state_desc,
                    'latex_matrix': lat_mat, 'latex_separated_raw': lat_sep_raw, 'latex_separated_simp': lat_sep_simp,
                    'js_edges_str': ",\n".join(js_edges), 'edge_eqs': edge_eqs
                })

    html_sections = []
    js_scripts = []

    if not valid_modes:
        html_sections.append("<h2 style='color:red;'>No valid operating modes found! Every state causes a topological violation.</h2>")
    else:
        for idx, mode in enumerate(valid_modes):
            section = f"""
            <div class="mode-card">
                <div class="mode-header">Mode {idx+1}: {mode['name']}</div>
                
                <div class="flex-container">
                    <!-- LEFT SIDE: Graph -->
                    <div class="graph-pane" style="position: relative;">
                        <div id="mynetwork_{idx}" class="network-canvas"></div>
                        <div id="popup_{idx}" class="branch-popup" style="display: none;">
                            <h4 style="margin-top:0; color:#0056b3; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Branch: <span id="popup_title_{idx}"></span></h4>
                            <div id="popup_v_{idx}" class="popup-math"></div>
                            <div id="popup_i_{idx}" class="popup-math"></div>
                        </div>
                    </div>
                    
                    <!-- RIGHT SIDE: Equations (Scrollable) -->
                    <div class="equations-pane">
                        <div class="eq-matrix">
                            <h3>State-Space Matrix</h3>
                            <div class="math-box">\\[ {mode['latex_matrix']} \\]</div>
                        </div>
                        
                        <div class="eq-raw">
                            <h3>Separated Equations (Raw Node Voltages)</h3>
                            <div class="math-box">\\[ {mode['latex_separated_raw']} \\]</div>
                        </div>
                        
                        <div class="eq-simp">
                            <h3 style="color: #28a745;">Separated Equations (Simplified)</h3>
                            <div class="math-box" style="border-left: 4px solid #28a745;">\\[ {mode['latex_separated_simp']} \\]</div>
                        </div>
                    </div>
                </div>
            </div>
            """
            html_sections.append(section)
            
            eq_json_str = json.dumps(mode['edge_eqs']).replace('\\', '\\\\')

            js = f"""
            var nodes_{idx} = new vis.DataSet([{js_nodes_str}]);
            var edges_{idx} = new vis.DataSet([{mode['js_edges_str']}]);
            var container_{idx} = document.getElementById('mynetwork_{idx}');
            var network_{idx} = new vis.Network(container_{idx}, {{ nodes: nodes_{idx}, edges: edges_{idx} }}, options);
            
            var edgeEqs_{idx} = JSON.parse('{eq_json_str}');
            var edgeStates_{idx} = {{}};

            network_{idx}.on("click", function(params) {{
                var popup = document.getElementById("popup_{idx}");
                if (params.edges.length > 0) {{
                    var edgeId = params.edges[0];
                    var edge = edges_{idx}.get(edgeId);
                    if(!edge || !edge.baseLabel) return;
                    
                    var state = (edgeStates_{idx}[edgeId] || 0);
                    state = (state + 1) % 3;
                    edgeStates_{idx}[edgeId] = state;
                    
                    // Reset others
                    edges_{idx}.get().forEach(function(e) {{
                        if(e.id !== edgeId && e.baseLabel) {{
                            edgeStates_{idx}[e.id] = 0;
                            e.label = e.baseLabel;
                            e.arrows = undefined;
                            edges_{idx}.update(e);
                        }}
                    }});

                    if (state === 0) {{
                        edge.label = edge.baseLabel;
                        edge.arrows = undefined;
                        popup.style.display = "none";
                    }} else if (state === 1) {{
                        edge.label = "(+) " + edge.baseLabel + " (-)";
                        edge.arrows = undefined;
                        popup.style.display = "block";
                    }} else if (state === 2) {{
                        edge.label = edge.baseLabel;
                        edge.arrows = 'to';
                        popup.style.display = "block";
                    }}
                    edges_{idx}.update(edge);
                    
                    if(state > 0 && edgeEqs_{idx}[edgeId]) {{
                        document.getElementById("popup_title_{idx}").innerText = edge.baseLabel;
                        document.getElementById("popup_v_{idx}").innerHTML = "$$ v_{{" + edgeId.replace('_', '\\\\_') + "}} = " + edgeEqs_{idx}[edgeId].v + " $$";
                        document.getElementById("popup_i_{idx}").innerHTML = "$$ i_{{" + edgeId.replace('_', '\\\\_') + "}} = " + edgeEqs_{idx}[edgeId].i + " $$";
                        MathJax.typesetPromise([popup]).catch(function (err) {{ console.log(err.message); }});
                    }}

                }} else {{
                    popup.style.display = "none";
                    edges_{idx}.get().forEach(function(e) {{
                        if(e.baseLabel) {{
                            edgeStates_{idx}[e.id] = 0;
                            e.label = e.baseLabel;
                            e.arrows = undefined;
                            edges_{idx}.update(e);
                        }}
                    }});
                }}
            }});
            """
            js_scripts.append(js)

    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Interactive MNA Extractor</title>
        <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
        <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
        <style>
            body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #eef2f5; padding: 20px; color: #333; }}
            .container {{ max-width: 1400px; margin: auto; }}
            .control-panel {{ background: #fff; padding: 15px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); margin-bottom: 20px; text-align: center; border: 1px solid #ddd; position: sticky; top: 10px; z-index: 1000; }}
            .control-panel label {{ margin: 0 15px; font-weight: bold; cursor: pointer; color: #0056b3; font-size: 110%; }}
            .control-panel input {{ margin-right: 5px; transform: scale(1.2); cursor: pointer; }}
            .mode-card {{ background: white; padding: 20px; margin-bottom: 40px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.08); border-left: 6px solid #0056b3; }}
            .mode-header {{ font-size: 150%; color: #0056b3; font-weight: bold; margin-bottom: 15px; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px; }}
            .flex-container {{ display: flex; flex-wrap: wrap; gap: 2%; align-items: stretch; }}
            .graph-pane {{ flex: 1; min-width: 400px; display: flex; flex-direction: column; }}
            .equations-pane {{ flex: 1.5; min-width: 500px; max-height: 600px; overflow-y: auto; padding-right: 10px; }}
            .math-box {{ overflow-x: auto; font-size: 110%; padding: 15px; background-color: #fdfdfd; border: 1px solid #eee; margin-bottom: 20px; border-radius: 5px; }}
            .network-canvas {{ width: 100%; height: 500px; border: 1px solid #ccc; background-color: #fafafa; border-radius: 5px; box-shadow: inset 0 0 10px rgba(0,0,0,0.05); }}
            h3 {{ margin-top: 0; color: #444; }}
            .equations-pane::-webkit-scrollbar {{ width: 8px; }}
            .equations-pane::-webkit-scrollbar-thumb {{ background-color: #bbb; border-radius: 4px; }}
            
            /* Branch Equations Popup Box */
            .branch-popup {{
                position: absolute;
                top: 15px;
                right: 15px;
                background: rgba(255, 255, 255, 0.95);
                border: 2px solid #17a2b8;
                border-radius: 8px;
                padding: 15px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.15);
                z-index: 10;
                pointer-events: none; /* Let map clicks pass through */
                min-width: 250px;
            }}
            .popup-math {{ font-size: 115%; margin: 10px 0; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1 style="text-align: center; color: #333; margin-top: 0;">Extracted MNA State-Space</h1>
            
            <div class="control-panel">
                <span style="color: #666; margin-right: 20px;">Toggle Right-Pane Views:</span>
                <label><input type="checkbox" id="chk_matrix" checked onchange="toggleEquations()"> State-Space Matrix</label>
                <label><input type="checkbox" id="chk_raw" checked onchange="toggleEquations()"> Raw Node Eqns</label>
                <label><input type="checkbox" id="chk_simp" checked onchange="toggleEquations()"> Simplified Eqns (V/C)</label>
            </div>
            
            {"".join(html_sections)}
        </div>
        <script type="text/javascript">
            function toggleEquations() {{
                const showMatrix = document.getElementById('chk_matrix').checked;
                const showRaw = document.getElementById('chk_raw').checked;
                const showSimp = document.getElementById('chk_simp').checked;
                
                document.querySelectorAll('.eq-matrix').forEach(el => el.style.display = showMatrix ? 'block' : 'none');
                document.querySelectorAll('.eq-raw').forEach(el => el.style.display = showRaw ? 'block' : 'none');
                document.querySelectorAll('.eq-simp').forEach(el => el.style.display = showSimp ? 'block' : 'none');
            }}
            
            var options = {{
                physics: {{ solver: 'forceAtlas2Based', forceAtlas2Based: {{ gravitationalConstant: -50, centralGravity: 0.01, springLength: 100, springConstant: 0.08 }} }},
                edges: {{ smooth: {{ type: 'dynamic' }}, width: 2 }},
                nodes: {{ borderWidth: 2, font: {{ size: 16, bold: true }} }}
            }};
            {"".join(js_scripts)}
        </script>
    </body>
    </html>
    """

    temp_dir = tempfile.gettempdir()
    file_path = os.path.join(temp_dir, 'mna_extraction.html')
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(html_content)
    webbrowser.open('file://' + os.path.realpath(file_path))


# ==========================================
# Desktop UI Setup (Tkinter)
# ==========================================
def on_generate_click(run_mode):
    json_text = text_area.get("1.0", tk.END).strip()
    if not json_text:
        messagebox.showerror("Error", "Please paste a JSON netlist.")
        return
    try:
        parse_and_generate_html(json_text, run_mode)
    except Exception as e:
        import traceback
        messagebox.showerror("Error", f"An error occurred:\n{traceback.format_exc()}")

root = tk.Tk()
root.title("MNA Equation & Graph Extractor")
root.geometry("800x600")
root.configure(padx=20, pady=20)

tk.Label(root, text="Paste JSON Netlist below:", font=("Arial", 12, "bold")).pack(anchor="w")

text_area = tk.Text(root, wrap=tk.WORD, font=("Consolas", 10))
text_area.pack(fill=tk.BOTH, expand=True, pady=10)

# Provided Buck Converter Test JSON
default_json = """{
  "physical_stage": {
    "resistors": [
      {
        "id": "R1",
        "nodes": ["node_3", "node_0"],
        "value": 10
      }
    ],
    "inductors": [
      {
        "id": "L1",
        "nodes": ["node_3", "node_2"],
        "L": 0.01
      }
    ],
    "capacitors": [
      {
        "id": "C1",
        "nodes": ["node_3", "node_0"],
        "C": 0.00009999999999999999
      }
    ],
    "voltage_sources": [
      {
        "id": "V1",
        "nodes": ["node_1", "node_0"],
        "value": 24
      }
    ],
    "diodes": [
      {
        "id": "D1",
        "type": "Diode",
        "nodes": ["node_0", "node_2"]
      }
    ],
    "analog_switches": [
      {
        "id": "MOSFET1",
        "type": "MOSFET",
        "nodes": ["node_1", "node_2"]
      }
    ]
  }
}"""
text_area.insert("1.0", default_json)

btn_frame = tk.Frame(root)
btn_frame.pack(pady=10)

btn_complete = tk.Button(btn_frame, text="Extract Complete Circuit (Static Ron)", font=("Arial", 11, "bold"), 
                         bg="#17a2b8", fg="white", command=lambda: on_generate_click("complete"), padx=10, pady=8)
btn_complete.pack(side=tk.LEFT, padx=10)

btn_modes = tk.Button(btn_frame, text="Extract Operating Modes (Ideal Sw)", font=("Arial", 11, "bold"), 
                         bg="#0056b3", fg="white", command=lambda: on_generate_click("modes"), padx=10, pady=8)
btn_modes.pack(side=tk.LEFT, padx=10)

root.mainloop()