import re

content = open("src/schematic/detailedLibrary.ts").read()

blocks = {}

current_block = None
for line in content.split("\n"):
    m = re.match(r"^\s*'([A-Za-z0-9_-]+)':\s*\{", line)
    if not m:
        m = re.match(r"^\s*([A-Za-z0-9_-]+):\s*\{", line)
        
    if m:
        current_block = m.group(1)
        if current_block not in blocks:
            blocks[current_block] = {}
            
    if current_block:
        if "category:" in line:
            cat = re.search(r"category:\s*'([^']+)'", line)
            if cat:
                blocks[current_block]["category"] = cat.group(1)
        if "subcategory:" in line:
            sub = re.search(r"subcategory:\s*'([^']+)'", line)
            if sub:
                blocks[current_block]["subcategory"] = sub.group(1)

electrical = {}
for k, v in blocks.items():
    if v.get("category") == "electrical":
        sub = v.get("subcategory", "General")
        if sub not in electrical:
            electrical[sub] = []
        electrical[sub].append(k)

import json
print(json.dumps(electrical, indent=2))
