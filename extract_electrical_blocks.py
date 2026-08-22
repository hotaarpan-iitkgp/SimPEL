import re

content = open("src/schematic/detailedLibrary.ts").read()
blocks = []
current_block = None

for line in content.split("\n"):
    m = re.match(r"^\s*'([A-Za-z0-9_-]+)':\s*\{", line)
    if not m:
        m = re.match(r"^\s*([A-Za-z0-9_-]+):\s*\{", line)
    
    if m:
        current_block = m.group(1)
    
    if current_block and "category: 'electrical'" in line:
        blocks.append(current_block)
        current_block = None

print(blocks)
