import json

def create_component(id, type, x, y, parameters=None):
    if parameters is None:
        parameters = {}
    return {
        "id": id,
        "type": type,
        "x": x,
        "y": y,
        "rotation": 0,
        "parameters": parameters
    }

def create_wire(wid, from_comp, from_pin, to_comp, to_pin):
    return {
        "id": wid,
        "from": {"type": "pin", "compId": from_comp, "terminal": from_pin},
        "to": {"type": "pin", "compId": to_comp, "terminal": to_pin}
    }

def generate_test_file(filename, block_list, description):
    components = []
    wires = []
    current_y = 0
    wid_count = 1
    
    for block in block_list:
        block_id = f"{block}1"
        
        components.append(create_component(block_id, block, 200, current_y))
        
        # Determine inputs based on block
        in_pins = ["In"]
        if block in ["D_FLIP_FLOP"]:
            in_pins = ["D", "Clk"]
        elif block in ["JK_FLIP_FLOP"]:
            in_pins = ["J", "Clk", "K"]
        elif block in ["SUM", "AND", "OR", "XOR", "NAND"]:
            in_pins = ["A", "B"]
        elif block == "PRODUCT_RECT":
            in_pins = ["In1", "In2"]
        elif block == "DIVIDE":
            in_pins = ["Num", "Den"]
        elif block == "CLARKE":
            in_pins = ["A", "B", "C"]
        elif block == "INV_CLARKE":
            in_pins = ["Alpha", "Beta"]
        elif block == "PARK":
            in_pins = ["Alpha", "Beta", "Theta"]
        elif block == "INV_PARK":
            in_pins = ["d", "q", "Theta"]
        elif block == "PLL_3PH":
            in_pins = ["Va", "Vb", "Vc"]
            
        # Add Sources and wire them
        for i, p in enumerate(in_pins):
            src_id = f"SRC_{block}_{p}"
            # Sine wave for analog inputs, Clock for digital/clk, Const for others
            if p == "Clk":
                components.append(create_component(src_id, "CLOCK", 0, current_y + i*20))
            elif block in ["D_FLIP_FLOP", "JK_FLIP_FLOP", "AND", "OR", "XOR", "NAND", "NOT", "TURN_ON_DELAY"]:
                # Ensure pulse generator toggles within 0.1s t_end
                components.append(create_component(src_id, "PULSE_GEN", 0, current_y + i*20, {"amplitude": "1", "period": "0.02", "pulse_width": "50"}))
            else:
                # Add 120 degree phase shifts for multi-input blocks so Clarke/Park don't sum to 0
                phase = str(i * 120)
                components.append(create_component(src_id, "SINE_WAVE", 0, current_y + i*20, {"amplitude": "1", "phase": phase}))
            
            wires.append(create_wire(f"w{wid_count}", src_id, "Out", block_id, p)); wid_count+=1
            
        # Give LUT blocks actual array data so they don't default to returning 0
        if block == "LUT_1D":
            components[-1 - len(in_pins)]["parameters"] = {"x": "[0, 1, -1]", "y": "[0, 2, -2]"}
        elif block == "LUT_2D":
            components[-1 - len(in_pins)]["parameters"] = {"x": "[0, 1]", "y": "[0, 1]", "z": "[[1, 2], [3, 4]]"}
        elif block == "MOV_AVG":
            components[-1 - len(in_pins)]["parameters"] = {"window_time": "0.015"}
        elif block == "TURN_ON_DELAY":
            components[-1 - len(in_pins)]["parameters"] = {"delay": "0.005"}
            
        # Determine outputs based on block
        out_pins = ["Out"]
        if block in ["D_FLIP_FLOP", "JK_FLIP_FLOP"]:
            out_pins = ["Q", "Q_bar"]
        elif block == "CLARKE":
            out_pins = ["Alpha", "Beta"]
        elif block == "PARK":
            out_pins = ["d", "q"]
        elif block == "INV_CLARKE":
            out_pins = ["A", "B", "C"]
        elif block == "INV_PARK":
            out_pins = ["Alpha", "Beta"]
        elif block in ["PLL_1PH", "PLL_3PH"]:
            out_pins = ["Theta", "Freq", "Cos", "Sin"]
        elif block == "FOURIER_TRANS":
            out_pins = ["Mag", "Phase"]
            
        # Add Scope
        scope_id = f"SCOPE_{block}"
        components.append(create_component(scope_id, "SCOPE", 400, current_y, {"channels": str(len(out_pins))}))
        for i, p in enumerate(out_pins):
            wires.append(create_wire(f"w{wid_count}", block_id, p, scope_id, f"In{i+1}")); wid_count+=1
            
        current_y += 150

    out_data = {
        "components": components,
        "wires": wires,
        "plotConfiguration": {"plots": []},
        "simulation_parameters": {"t_end": "0.1", "h": "1e-4", "solver": "euler", "step_type": "fixed"},
        "description": description
    }
    
    with open(f"working jsons/{filename}", "w") as f:
        json.dump(out_data, f, indent=2)

states = ["D_FLIP_FLOP", "JK_FLIP_FLOP", "MONOFLOP", "MONOSTABLE", "COMPARE_TO_CONSTANT", "STATE_MACHINE"]
generate_test_file("Control_State_Machines_Test.json", states, "Test State Machines")

math = ["SUM", "PRODUCT_RECT", "DIVIDE", "ABS", "SIGNUM", "FCN", "CSCRIPT", "LUT_1D", "LUT_2D"]
generate_test_file("Control_Math_Functions_Test.json", math, "Test Math and Functions")

filters = ["FILTER_1ST", "FILTER_2ND", "MOV_AVG", "DELAY", "TRANSPORT_DELAY", "TURN_ON_DELAY", "UNIT_DELAY", "ZOH"]
generate_test_file("Control_Filters_Delays_Test.json", filters, "Test Filters and Delays")

transforms = ["CLARKE", "PARK", "INV_CLARKE", "INV_PARK", "PLL_1PH", "PLL_3PH", "FOURIER_TRANS"]
generate_test_file("Control_Transforms_Test.json", transforms, "Test Transforms")

logic = ["AND", "OR", "NOT", "XOR", "NAND"]
generate_test_file("Control_Logic_Test.json", logic, "Test Logic Gates")

print("Generated control JSONs successfully.")
