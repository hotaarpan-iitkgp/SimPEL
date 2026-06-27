import { state } from './state';
import { getWirePath, getWireDomain, getComponentBounds } from './routing';
import { getComponentSVG } from './components';
import { isControlInputPin, commitCurrentSchematicState, getRootSchematic } from './actions';
import { pathToString } from './utils';
import JSZip from 'jszip';

// Helper to determine if we are in light mode
export function isLightModeActive(): boolean {
  return document.querySelector('.light-mode') !== null;
}

// Generate self-contained, bounded SVG for a schematic layer
export function generateSVGForSchematic(
  targetComponents: any[],
  targetWires: any[],
  title: string
): string {
  // Save original state components and wires
  const originalComponents = state.components;
  const originalWires = state.wires;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  let wiresSVG = '';
  let junctionsSVG = '';
  let componentsSVG = '';

  try {
    // Crucial mapping: set state variables temporarily so getWirePath and routing helpers resolve correctly
    state.components = targetComponents;
    state.wires = targetWires;

    // 1. Calculate Component Bounds
    targetComponents.forEach((comp) => {
      const b = getComponentBounds(comp);
      if (b.xMin < minX) minX = b.xMin;
      if (b.xMax > maxX) maxX = b.xMax;
      if (b.yMin < minY) minY = b.yMin;
      if (b.yMax > maxY) maxY = b.yMax;
    });

    // 2. Generate Component SVG Elements
    targetComponents.forEach((comp) => {
      const compBody = getComponentSVG(comp);
      componentsSVG += `    <g class="component" id="export-comp-${comp.id}" transform="translate(${comp.x}, ${comp.y}) rotate(${comp.rotation})">\n`;
      componentsSVG += `      ${compBody}\n`;
      componentsSVG += `    </g>\n`;
    });

    // 3. Generate Wire SVG Elements & update bounds
    targetWires.forEach((wire) => {
      const pathPoints = getWirePath(wire);
      
      // Update bounds with wire points
      pathPoints.forEach((pt) => {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      });

      const pathStr = pathToString(pathPoints);
      const domain = getWireDomain(wire);
      const isControl = (domain === 'control');

      let markerStart = '';
      let markerEnd = '';
      if (isControl) {
        const hasArrowAtStart = (wire.from.type === 'pin' && isControlInputPin(wire.from.compId, wire.from.terminal));
        const hasArrowAtEnd = (wire.to && (wire.to.type === 'wire' || (wire.to.type === 'pin' && isControlInputPin(wire.to.compId, wire.to.terminal))));
        if (hasArrowAtStart) markerStart = ' marker-start="url(#control-arrow)"';
        if (hasArrowAtEnd) markerEnd = ' marker-end="url(#control-arrow)"';
      }

      wiresSVG += `    <path d="${pathStr}" class="wire ${isControl ? 'control-net' : ''}" id="export-wire-${wire.id}"${markerStart}${markerEnd} />\n`;

      // Junction dots
      if (wire.from.type === 'wire') {
        junctionsSVG += `    <circle cx="${wire.from.x}" cy="${wire.from.y}" r="4" class="junction-dot" />\n`;
      }
      if (wire.to.type === 'wire') {
        junctionsSVG += `    <circle cx="${wire.to.x}" cy="${wire.to.y}" r="4" class="junction-dot" />\n`;
      }
    });

  } finally {
    // Restore original state components and wires
    state.components = originalComponents;
    state.wires = originalWires;
  }

  // Handle empty canvas fallback
  if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
    minX = 0;
    minY = 0;
    maxX = 800;
    maxY = 600;
  }

  // Add margin around bounding box to prevent truncation
  const padding = 40;
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;

  const width = maxX - minX;
  const height = maxY - minY;

  const isLight = isLightModeActive();
  const themeBg = isLight ? '#ffffff' : '#050711';
  const themeText = isLight ? '#0f172a' : '#f8fafc';
  const wirePowerColor = isLight ? '#1d4ed8' : '#38bdf8';
  const wireControlColor = isLight ? '#047857' : '#10b981';
  const compStrokeColor = isLight ? '#334155' : '#f1f5f9';
  const compTextColor = isLight ? '#475569' : '#94a3b8';
  const junctionDotColor = isLight ? '#1d4ed8' : '#38bdf8';

  let svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n`;
  svgContent += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}">\n`;
  svgContent += `  <defs>\n`;
  svgContent += `    <marker id="control-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto">\n`;
  svgContent += `      <path d="M 0 1.5 L 7 5 L 0 8.5 z" fill="${wireControlColor}" />\n`;
  svgContent += `    </marker>\n`;
  svgContent += `    <style>\n`;
  svgContent += `      svg {\n`;
  svgContent += `        background-color: ${themeBg};\n`;
  svgContent += `        color: ${themeText};\n`;
  svgContent += `      }\n`;
  svgContent += `      .wire {\n`;
  svgContent += `        fill: none;\n`;
  svgContent += `        stroke: ${wirePowerColor};\n`;
  svgContent += `        stroke-width: 2.0;\n`;
  svgContent += `        stroke-linecap: round;\n`;
  svgContent += `        stroke-linejoin: round;\n`;
  svgContent += `      }\n`;
  svgContent += `      .wire.control-net {\n`;
  svgContent += `        stroke: ${wireControlColor};\n`;
  svgContent += `      }\n`;
  svgContent += `      .junction-dot {\n`;
  svgContent += `        fill: ${junctionDotColor};\n`;
  svgContent += `      }\n`;
  svgContent += `      .component {\n`;
  svgContent += `        color: ${compStrokeColor};\n`;
  svgContent += `        fill: none;\n`;
  svgContent += `      }\n`;
  svgContent += `      .comp-path {\n`;
  svgContent += `        stroke: currentColor;\n`;
  svgContent += `        stroke-width: 2;\n`;
  svgContent += `        stroke-linecap: round;\n`;
  svgContent += `        stroke-linejoin: round;\n`;
  svgContent += `      }\n`;
  svgContent += `      .comp-fill {\n`;
  svgContent += `        fill: currentColor;\n`;
  svgContent += `        opacity: 0.12;\n`;
  svgContent += `      }\n`;
  svgContent += `      .comp-node {\n`;
  svgContent += `        fill: currentColor;\n`;
  svgContent += `      }\n`;
  svgContent += `      .comp-text, .comp-label {\n`;
  svgContent += `        fill: ${compTextColor};\n`;
  svgContent += `        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;\n`;
  svgContent += `        font-size: 10px;\n`;
  svgContent += `        font-weight: bold;\n`;
  svgContent += `      }\n`;
  svgContent += `    </style>\n`;
  svgContent += `  </defs>\n`;
  svgContent += `  \n`;
  svgContent += `  <!-- Background -->\n`;
  svgContent += `  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${themeBg}" />\n`;
  svgContent += `  \n`;
  svgContent += `  <!-- Wires Group -->\n`;
  svgContent += `  <g id="exported-wires">\n`;
  svgContent += wiresSVG;
  svgContent += `  </g>\n`;
  svgContent += `  \n`;
  svgContent += `  <!-- Junctions Group -->\n`;
  svgContent += `  <g id="exported-junctions">\n`;
  svgContent += junctionsSVG;
  svgContent += `  </g>\n`;
  svgContent += `  \n`;
  svgContent += `  <!-- Components Group -->\n`;
  svgContent += `  <g id="exported-components">\n`;
  svgContent += componentsSVG;
  svgContent += `  </g>\n`;
  svgContent += `</svg>\n`;

  // Post-process the generated SVG using DOMParser to inject inline styling attributes.
  // This guarantees robust rendering in vector viewers/converters (e.g., Microsoft Word, standard image viewers) 
  // that completely ignore class styling or internal <style> blocks.
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    
    // 1. Process Wires
    const wires = doc.querySelectorAll('.wire');
    wires.forEach((wire) => {
      const isControl = wire.classList.contains('control-net');
      const color = isControl ? wireControlColor : wirePowerColor;
      wire.setAttribute('fill', 'none');
      wire.setAttribute('stroke', color);
      wire.setAttribute('stroke-width', '2.0');
      wire.setAttribute('stroke-linecap', 'round');
      wire.setAttribute('stroke-linejoin', 'round');
    });

    // 2. Process Junctions
    const junctions = doc.querySelectorAll('.junction-dot');
    junctions.forEach((junc) => {
      junc.setAttribute('fill', junctionDotColor);
    });

    // 3. Process Component Groups
    const components = doc.querySelectorAll('.component');
    components.forEach((comp) => {
      comp.setAttribute('color', compStrokeColor);
    });

    // 4. Process Component Paths/Lines/Shapes
    const compPaths = doc.querySelectorAll('.comp-path');
    compPaths.forEach((path) => {
      if (!path.getAttribute('stroke')) {
        path.setAttribute('stroke', 'currentColor');
      }
      if (!path.getAttribute('stroke-width')) {
        path.setAttribute('stroke-width', '1.8');
      }
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      if (!path.getAttribute('fill')) {
        path.setAttribute('fill', 'none');
      }
    });

    // 5. Process Component Fills
    const compFills = doc.querySelectorAll('.comp-fill');
    compFills.forEach((fill) => {
      if (!fill.getAttribute('fill')) {
        fill.setAttribute('fill', 'currentColor');
      }
      fill.setAttribute('fill-opacity', '0.12');
      fill.setAttribute('stroke', 'none');
    });

    // 6. Process Bounding Boxes (so they are transparent/invisible instead of defaulting to black)
    const compBounds = doc.querySelectorAll('.comp-bounds');
    compBounds.forEach((bound) => {
      bound.setAttribute('fill', 'none');
      bound.setAttribute('stroke', 'none');
    });

    // 7. Process Component Labels / Text (make sure they are readable and don't overlap)
    const compLabels = doc.querySelectorAll('.comp-label');
    compLabels.forEach((label) => {
      label.setAttribute('fill', compTextColor);
      label.setAttribute('font-family', 'sans-serif');
      label.setAttribute('font-size', '11px');
      label.setAttribute('font-weight', '600');
      label.setAttribute('text-anchor', 'middle');
    });

    // 8. Process Node/Terminal Dots
    const compNodes = doc.querySelectorAll('.comp-node');
    compNodes.forEach((node) => {
      node.setAttribute('fill', compStrokeColor);
    });

    const serializer = new XMLSerializer();
    svgContent = serializer.serializeToString(doc);
  } catch (err) {
    console.error("Error post-processing exported SVG:", err);
  }

  return svgContent;
}

// Download Trigger
export function downloadFile(content: Blob | string, filename: string, mimeType: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Export only the currently visible subsystem as SVG
export function exportCurrentSubsystemSVG() {
  commitCurrentSchematicState();
  const currentSubId = state.currentSubsystemId || 'Main';
  const svgText = generateSVGForSchematic(state.components, state.wires, currentSubId);
  const filename = `${currentSubId.toLowerCase().replace(/\s+/g, '_')}_schematic.svg`;
  downloadFile(svgText, filename, 'image/svg+xml;charset=utf-8');
}

interface SchematicLayer {
  name: string;
  components: any[];
  wires: any[];
}

// Recursively traverse subsystem elements to collect all layers
function collectAllLayers(
  currentName: string,
  components: any[],
  wires: any[],
  layers: SchematicLayer[] = []
): SchematicLayer[] {
  layers.push({ name: currentName, components, wires });
  
  components.forEach((comp) => {
    if (comp.type === 'SUBSYSTEM' && comp.sub_schematic) {
      const subComps = comp.sub_schematic.components || [];
      const subWires = comp.sub_schematic.wires || [];
      const subName = `${currentName}/${comp.id}`;
      collectAllLayers(subName, subComps, subWires, layers);
    }
  });
  
  return layers;
}

// Export the full schematic collection as a ZIP file
export async function exportFullSchematicZIP() {
  commitCurrentSchematicState();
  const root = getRootSchematic();
  const layers = collectAllLayers('Main', root.components, root.wires);

  const zip = new JSZip();

  layers.forEach((layer) => {
    const svgText = generateSVGForSchematic(layer.components, layer.wires, layer.name);
    // Format name hierarchy into directories inside zip
    let zipPath = layer.name;
    if (zipPath === 'Main') {
      zipPath = 'Main.svg';
    } else {
      zipPath = zipPath.replace(/^Main\//, '') + '.svg';
    }
    zip.file(zipPath, svgText);
  });

  try {
    const content = await zip.generateAsync({ type: 'blob' });
    downloadFile(content, 'schematic_hierarchy.zip', 'application/zip');
  } catch (err) {
    console.error("Failed to generate ZIP export", err);
    alert("Failed to package schematic hierarchy into a ZIP file.");
  }
}
