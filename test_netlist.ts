import { CIRCUITS_TEMPLATES } from './src/templates.js';
console.log(CIRCUITS_TEMPLATES['forward_converter'].components.find((c: any) => c.id === 'XFMR1'));
