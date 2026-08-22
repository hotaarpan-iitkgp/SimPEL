import re

# Read detailedLibrary.ts to find all electrical blocks
with open("src/schematic/detailedLibrary.ts", "r") as f:
    content = f.read()

# Extract components from DETAILED_COMPONENTS
blocks = []
in_components = False
for line in content.split("\n"):
    if "export const DETAILED_COMPONENTS" in line:
        in_components = True
    if in_components:
        if "category: 'electrical'" in line or "category: 'power'" in line:
            # We need to backtrack to find the type
            pass

# Easier with regex:
matches = re.finditer(r"\{\s*type:\s*'([^']+)'[^}]*category:\s*'electrical'[^}]*\}", content)
electrical_blocks = set([m.group(1) for m in matches])
matches2 = re.finditer(r"\{\s*type:\s*'([^']+)'[^}]*category:\s*'power'[^}]*\}", content) # if power is used
electrical_blocks.update([m.group(1) for m in matches2])

# Blocks tested in generate_electrical_jsons.py
tested = set([
    "V", "I", "AC_V", "AC_I", "CTRL_V", "CTRL_I", "R", "L", "C", "VAR_R", "VAR_L", "VAR_C", "SAT_L", "SAT_C", "PWL_R", "E_ALGEBRAIC", "PI_SECTION", "VM", "AM", "V_3PH", "I_3PH", "LINE_3PH",
    "D", "THYRISTOR", "GTO", "IGBT", "IGCT", "MOSFET", "BJT", "JFET", "vg-FET", "S", "BREAKER",
    "IDEAL_XFMR", "XFMR_2W", "MUTUAL_2W",
    "DBL_SWITCH", "MAN_SWITCH", "MAN_DBL_SWITCH", "MAN_TRPL_SWITCH", "SR_SWITCH", "TRPL_SWITCH", "VM_3PH", "AM_3PH",
    "XFMR_3W", "MUTUAL_3W", "SAT_XFMR", "XFMR_3PH_2W", "XFMR_3PH_3W", "INDUCTION_MOTOR", "IND_MOTOR",
    "OPAMP", "E_COMP", "GEN_EBLOCK", "IC_555", "IC_7400", "IC_7408", "IC_7432", "IC_7404"
])

missing = electrical_blocks - tested
print("Missing electrical blocks:", missing)
