import fs from 'fs';

const content = fs.readFileSync('src/schematic/detailedLibrary.ts', 'utf8');

// The file exports an array of objects assigned to DETAILED_COMPONENTS.
// We can parse it by matching the objects or using a regex for the category.
// Let's just find the types of components that have category: 'electrical'.

const blocks = [];
const blocksMatches = content.match(/\{\s*type:\s*'([^']+)'[\s\S]*?category:\s*'electrical'[\s\S]*?\}/g);
if (blocksMatches) {
    for (const match of blocksMatches) {
        const typeMatch = match.match(/type:\s*'([^']+)'/);
        const subCatMatch = match.match(/subcategory:\s*'([^']+)'/);
        if (typeMatch) {
            blocks.push({
                type: typeMatch[1],
                subcategory: subCatMatch ? subCatMatch[1] : 'General'
            });
        }
    }
}

const grouped = {};
for (const b of blocks) {
    if (!grouped[b.subcategory]) grouped[b.subcategory] = [];
    grouped[b.subcategory].push(b.type);
}

console.log(JSON.stringify(grouped, null, 2));
