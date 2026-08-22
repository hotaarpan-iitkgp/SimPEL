import { DETAILED_COMPONENTS } from './src/schematic/detailedLibrary.js';

const blocks = Object.keys(DETAILED_COMPONENTS).filter(k => DETAILED_COMPONENTS[k].category === 'electrical');
const subcategories = {};
for (const b of blocks) {
    const sub = DETAILED_COMPONENTS[b].subcategory || 'General';
    if (!subcategories[sub]) subcategories[sub] = [];
    subcategories[sub].push(b);
}

console.log(JSON.stringify(subcategories, null, 2));
