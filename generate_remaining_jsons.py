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
        source_id = f"SRC_{block}1"
        gnd_id = f"GND_{block}1"
        am_id = f"AM_{block}1"
        
        components.append(create_component(source_id, "V", 0, current_y, {"value": "24"}))
        components.append(create_component(gnd_id, "GND", 400, current_y))
        components.append(create_component(block_id, block, 200, current_y))
        
        if block == "IGBT_DIODE":
            # Like IGBT: D, S, G + Diode. Internally it's probably D, S, G.
            # detailedLibrary.ts lines 1615 shows IGBT_DIODE falls under MOSFET logic: D, S, G
            components.append(create_component("CTRL_"+block, "CONST", 100, current_y-50, {"value": "1"}))
            wires.append(create_wire(f"w{wid_count}", source_id, "A", block_id, "D")); wid_count+=1
            wires.append(create_wire(f"w{wid_count}", block_id, "S", gnd_id, "Gnd")); wid_count+=1
            wires.append(create_wire(f"w{wid_count}", source_id, "B", gnd_id, "Gnd")); wid_count+=1
            wires.append(create_wire(f"w{wid_count}", "CTRL_"+block, "Out", block_id, "G")); wid_count+=1
            
        elif block in ["IC_LM7805", "IC_LM317"]:
            # Typically these are voltage regulators. V_in, GND, V_out.
            # But let's just place them with basic generic connections to see if parser accepts them.
            components.append(create_component(f"LOAD_{block}1", "R", 300, current_y, {"value": "10"}))
            pass
            
        elif block == "IC_PC817":
            # Optocoupler
            pass

        current_y += 200

    out_data = {
        "components": components,
        "wires": wires,
        "plotConfiguration": {"plots": []},
        "description": description
    }
    
    with open(f"working jsons/{filename}", "w") as f:
        json.dump(out_data, f, indent=2)

file1 = ["IGBT_DIODE", "IC_LM7805", "IC_LM317", "IC_PC817"]
generate_test_file("Electrical_Remaining_Missing_Test.json", file1, "Test Missing ICs and IGBT Diode")
