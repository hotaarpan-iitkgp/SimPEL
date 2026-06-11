import { state } from './state';
import { COMPONENT_PINS, getComponentPins, parseTurnsList, discoverPortsJS } from './config';
import { DETAILED_COMPONENTS } from './detailedLibrary';

// Calculate dynamic terminal coordinates in Canvas Space
export function getTerminalCoords(comp: any, terminalName: string) {
  const pinMap = getComponentPins(comp);
  const pin = pinMap && pinMap[terminalName] ? pinMap[terminalName] : { x: 0, y: 0 };
  const localX = pin.x;
  const localY = pin.y;
  
  // Calculate rotation in radians
  const rad = (comp.rotation * Math.PI) / 180;
  const cos = Math.round(Math.cos(rad));
  const sin = Math.round(Math.sin(rad));
  
  return {
    x: comp.x + (localX * cos - localY * sin),
    y: comp.y + (localX * sin + localY * cos)
  };
}

// Determine the exit unit vector for a terminal
export function getTerminalDir(comp: any, terminalName: string) {
  const pinMap = getComponentPins(comp);
  const pin = pinMap && pinMap[terminalName] ? pinMap[terminalName] : { dx: 0, dy: 0 };
  const dx = pin.dx;
  const dy = pin.dy;
  
  const rad = (comp.rotation * Math.PI) / 180;
  const cos = Math.round(Math.cos(rad));
  const sin = Math.round(Math.sin(rad));
  
  return {
    x: dx * cos - dy * sin,
    y: dx * sin + dy * cos
  };
}

// Determine pin net domain ('control' or 'electrical')
export function getPinDomain(compType: string, terminalName: string): string {
  // Check if it's a basic control/general component
  if (['CONST', 'GAIN', 'PID', 'SUM', 'PWM', 'TRI', 'COMP', 'AND', 'OR', 'NOT', 'FCN', 'PROD', 'MUX', 'DEMUX', 'SCOPE', 'CSCRIPT', 'PROBE'].includes(compType)) {
    return 'control';
  }

  // Check detailed library category
  const libComp = DETAILED_COMPONENTS.find(c => c.type === compType);
  if (libComp && (libComp.category === 'control' || libComp.category === 'general')) {
    return 'control';
  }

  const controlPins: Record<string, string[]> = {
    VM: ['Out'],
    AM: ['Out'],
    VM_3PH: ['Out'],
    AM_3PH: ['Out'],
    MOSFET: ['G'],
    MOSFET_DIODE: ['G'],
    IGBT: ['G'],
    IGBT_DIODE: ['G'],
    IGCT: ['G'],
    GTO: ['G'],
    THYRISTOR: ['G'],
    JFET: ['G'],
    BJT: ['B'],
    VAR_R: ['Ctrl'],
    VAR_L: ['Ctrl'],
    VAR_C: ['Ctrl'],
    SAT_L: ['Ctrl'],
    SAT_C: ['Ctrl'],
    CTRL_V: ['Ctrl'],
    CTRL_I: ['Ctrl'],
    BREAKER: ['Ctrl'],
    TRPL_SWITCH: ['Ctrl'],
    MAN_TRPL_SWITCH: ['Ctrl']
  };
  
  if (controlPins[compType] && controlPins[compType].includes(terminalName)) {
    return 'control';
  }
  
  // Specific fallbacks for pin names
  if (['G', 'B', 'Ctrl'].includes(terminalName)) {
    // If it's a known switch/semiconductor/variable component, these are control pins
    if (compType.includes('MOSFET') || compType.includes('IGBT') || compType.includes('SWITCH') || 
        ['VAR_R', 'VAR_L', 'VAR_C', 'SAT_L', 'SAT_C', 'CTRL_V', 'CTRL_I', 'BREAKER', 'BJT', 'JFET', 'GTO', 'THYRISTOR', 'IGCT'].includes(compType)) {
      return 'control';
    }
  }

  return 'electrical';
}

// Determine domain of a wire endpoint (either 'control' or 'electrical')
export function getEndpointDomain(endpoint: any): string {
  if (endpoint.type === 'pin') {
    const comp = state.components.find((c: any) => c.id === endpoint.compId);
    if (!comp) return 'electrical';
    return getPinDomain(comp.type, endpoint.terminal);
  } else if (endpoint.type === 'wire') {
    const wire = state.wires.find((w: any) => w.id === endpoint.wireId);
    if (!wire) return 'electrical';
    return getWireDomain(wire);
  }
  return 'electrical';
}

// Determine wire domain dynamically based on connected pins
export function getWireDomain(wire: any): string {
  if (wire.from.type === 'pin') {
    const comp = state.components.find((c: any) => c.id === wire.from.compId);
    if (comp) return getPinDomain(comp.type, wire.from.terminal);
  } else if (wire.from.type === 'wire') {
    const parentWire = state.wires.find((w: any) => w.id === wire.from.wireId);
    if (parentWire) return getWireDomain(parentWire);
  }
  if (wire.to && wire.to.type === 'pin') {
    const comp = state.components.find((c: any) => c.id === wire.to.compId);
    if (comp) return getPinDomain(comp.type, wire.to.terminal);
  } else if (wire.to && wire.to.type === 'wire') {
    const parentWire = state.wires.find((w: any) => w.id === wire.to.wireId);
    if (parentWire) return getWireDomain(parentWire);
  }
  return 'electrical';
}

// Determine which wires should move rigidly during drag
export function getRigidMovingWires(): string[] {
  const movingWireIds = new Set<string>(state.selectedWireIds);
  const movingCompIds = new Set<string>(state.selectedComponentIds);
  
  let addedAny = true;
  while (addedAny) {
    addedAny = false;
    state.wires.forEach((wire: any) => {
      if (movingWireIds.has(wire.id)) return;
      
      const fromMoving = isEndpointMoving(wire.from, movingCompIds, movingWireIds);
      const toMoving = isEndpointMoving(wire.to, movingCompIds, movingWireIds);
      
      if (fromMoving && toMoving) {
        movingWireIds.add(wire.id);
        addedAny = true;
      }
    });
  }
  
  return Array.from(movingWireIds);
}

function isEndpointMoving(endpoint: any, movingCompIds: Set<string>, movingWireIds: Set<string>): boolean {
  if (endpoint.type === 'pin') {
    return movingCompIds.has(endpoint.compId);
  } else if (endpoint.type === 'wire') {
    return movingWireIds.has(endpoint.wireId);
  }
  return false;
}

// Resolve wire endpoint coordinate (Respects Component terminals and Wire connections)
export function getWireEndpointCoords(endpoint: any): { x: number; y: number } {
  if (endpoint.type === 'pin') {
    const comp = state.components.find((c: any) => c.id === endpoint.compId);
    if (!comp) return { x: 0, y: 0 };
    return getTerminalCoords(comp, endpoint.terminal);
  } else {
    return { x: endpoint.x, y: endpoint.y };
  }
}

// Determine exit direction for wire endpoints
export function getWireEndpointDir(endpoint: any): { x: number; y: number } {
  if (endpoint.type === 'pin') {
    const comp = state.components.find((c: any) => c.id === endpoint.compId);
    if (!comp) return { x: 1, y: 0 };
    return getTerminalDir(comp, endpoint.terminal);
  } else {
    // Wire-to-wire connections exit directly without offset
    return { x: 0, y: 0 };
  }
}

// Simplify paths by removing duplicates and collinear midpoints
export function simplifyPath(pts: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (pts.length < 3) return pts;
  const result = [pts[0]];
  
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = pts[i];
    const next = pts[i + 1];
    
    // Remove duplicate points
    if ((curr.x === prev.x && curr.y === prev.y) || (curr.x === next.x && curr.y === next.y)) {
      continue;
    }
    
    // Remove collinear points (horizontal or vertical lines merging)
    const isCollinear = (prev.x === curr.x && curr.x === next.x) || 
                        (prev.y === curr.y && curr.y === next.y);
    if (!isCollinear) {
      result.push(curr);
    }
  }
  
  result.push(pts[pts.length - 1]);
  return result;
}

// Get component axis-aligned bounds in canvas coordinates
export function getComponentBounds(comp: any): { xMin: number; xMax: number; yMin: number; yMax: number } {
  let w = 44;
  let h = 84;
  if (comp.type === 'XFMR') {
    const pTurns = parseTurnsList(comp.parameters && comp.parameters.primary_turns);
    const sTurns = parseTurnsList(comp.parameters && comp.parameters.secondary_turns);
    const Np = pTurns.length;
    const Ns = sTurns.length;
    const spacing = 60;
    const yMaxP = Math.round(((Np - 1) / 2) * spacing) + 20;
    const yMaxS = Math.round(((Ns - 1) / 2) * spacing) + 20;
    const halfHeight = Math.max(yMaxP, yMaxS) + 12;
    h = halfHeight * 2;
  } else if (comp.type === 'CSCRIPT') {
    const ports = discoverPortsJS(comp.parameters && comp.parameters.code);
    const inList = ports.inputs;
    const outList = ports.outputs;
    const Ni = inList.length;
    const No = outList.length;
    const spacing = 40;
    
    let maxInLen = 0;
    for (const p of inList) {
      if (p.length > maxInLen) maxInLen = p.length;
    }
    let maxOutLen = 0;
    for (const p of outList) {
      if (p.length > maxOutLen) maxOutLen = p.length;
    }
    const halfWidth = Math.max(50, Math.round((100 + maxInLen * 6 + maxOutLen * 6) / 2));
    const halfHeight = Math.max(40, Math.round(Math.max(Ni, No) * spacing / 2) + 20);
    w = halfWidth * 2;
    h = halfHeight * 2;
  }
  const rot = (comp.rotation || 0) % 360;
  if (rot === 90 || rot === 270 || rot === -90 || rot === -270) {
    const temp = w;
    w = h;
    h = temp;
  }
  return {
    xMin: comp.x - w / 2,
    xMax: comp.x + w / 2,
    yMin: comp.y - h / 2,
    yMax: comp.y + h / 2
  };
}

// A* Pathfinding to route around components on a 20px grid
export function findAStarPath(pStart: { x: number; y: number }, dirStart: { x: number; y: number }, pEnd: { x: number; y: number }, dirEnd: { x: number; y: number }): Array<{ x: number; y: number }> | null {
  const GRID = 20;
  const turnPenalty = 150;
  
  const startX = Math.round(pStart.x / GRID) * GRID;
  const startY = Math.round(pStart.y / GRID) * GRID;
  const endX = Math.round(pEnd.x / GRID) * GRID;
  const endY = Math.round(pEnd.y / GRID) * GRID;
  
  if (startX === endX && startY === endY) {
    return [{ x: startX, y: startY }];
  }
  
  // Search box bounds with padding
  const margin = 240;
  const xMin = Math.min(startX, endX) - margin;
  const xMax = Math.max(startX, endX) + margin;
  const yMin = Math.min(startY, endY) - margin;
  const yMax = Math.max(startY, endY) + margin;
  
  const openSet = [];
  const openSetMap = new Map();
  const closedSet = new Set();
  
  const startKey = `${startX},${startY},${dirStart.x},${dirStart.y}`;
  const startNode: any = {
    x: startX,
    y: startY,
    dx: dirStart.x,
    dy: dirStart.y,
    gScore: 0,
    fScore: Math.abs(startX - endX) + Math.abs(startY - endY),
    parent: null
  };
  
  openSet.push(startNode);
  openSetMap.set(startKey, startNode);
  
  function isBlocked(x: number, y: number) {
    if (x === endX && y === endY) return false;
    for (const comp of state.components) {
      const b = getComponentBounds(comp);
      if (x > b.xMin + 2 && x < b.xMax - 2 &&
          y > b.yMin + 2 && y < b.yMax - 2) {
        return true;
      }
    }
    return false;
  }
  
  let iterations = 0;
  const maxIterations = 3000;
  
  while (openSet.length > 0) {
    iterations++;
    if (iterations > maxIterations) break;
    
    openSet.sort((a, b) => a.fScore - b.fScore);
    const curr = openSet.shift()!;
    
    if (curr.x === endX && curr.y === endY) {
      const path = [];
      let temp = curr;
      while (temp) {
        path.push({ x: temp.x, y: temp.y });
        temp = temp.parent;
      }
      path.reverse();
      return path;
    }
    
    const key = `${curr.x},${curr.y},${curr.dx},${curr.dy}`;
    closedSet.add(key);
    
    const dirs = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 }
    ];
    
    for (const d of dirs) {
      const nx = curr.x + d.x * GRID;
      const ny = curr.y + d.y * GRID;
      
      if (nx < xMin || nx > xMax || ny < yMin || ny > yMax) continue;
      if (isBlocked(nx, ny)) continue;
      
      const nKey = `${nx},${ny},${d.x},${d.y}`;
      if (closedSet.has(nKey)) continue;
      
      let stepCost = GRID;
      if (curr.dx !== 0 || curr.dy !== 0) {
        if (curr.dx !== d.x || curr.dy !== d.y) {
          stepCost += turnPenalty;
        }
      }
      
      const nextG = curr.gScore + stepCost;
      
      const existing = openSetMap.get(nKey);
      if (existing) {
        if (nextG < existing.gScore) {
          existing.gScore = nextG;
          existing.fScore = nextG + Math.abs(nx - endX) + Math.abs(ny - endY);
          existing.parent = curr;
        }
      } else {
        const newNode = {
          x: nx,
          y: ny,
          dx: d.x,
          dy: d.y,
          gScore: nextG,
          fScore: nextG + Math.abs(nx - endX) + Math.abs(ny - endY),
          parent: curr
        };
        openSet.push(newNode);
        openSetMap.set(nKey, newNode);
      }
    }
  }
  
  return null;
}

// Orthogonal Auto-Routing Router (Avoids passing wire inside components)
export function getOrthogonalPath(p1: { x: number; y: number }, dir1: { x: number; y: number }, p2: { x: number; y: number }, dir2: { x: number; y: number }): Array<{ x: number; y: number }> {
  const d = 20;
  
  const startExit = (dir1.x === 0 && dir1.y === 0) ? p1 : { x: p1.x + dir1.x * d, y: p1.y + dir1.y * d };
  const endExit = (dir2.x === 0 && dir2.y === 0) ? p2 : { x: p2.x + dir2.x * d, y: p2.y + dir2.y * d };
  
  // Attempt A* component avoidance routing first
  const astarPath = findAStarPath(startExit, dir1, endExit, { x: -dir2.x, y: -dir2.y });
  if (astarPath) {
    const fullPath = [p1, ...astarPath, p2];
    return simplifyPath(fullPath);
  }
  
  const points = [p1];
  if (dir1.x !== 0 || dir1.y !== 0) {
    points.push(startExit);
    
    // Start detour
    if (dir1.x !== 0) {
      const isGoingBackwards = (endExit.x - startExit.x) * dir1.x < 0;
      if (isGoingBackwards) {
        const detourY = p1.y + (endExit.y >= p1.y ? 60 : -60);
        points.push({ x: startExit.x, y: detourY });
      }
    } else if (dir1.y !== 0) {
      const isGoingBackwards = (endExit.y - startExit.y) * dir1.y < 0;
      if (isGoingBackwards) {
        const detourX = p1.x + (endExit.x >= p1.x ? 40 : -40);
        points.push({ x: detourX, y: startExit.y });
      }
    }
  }
  
  const pointsEnd = [p2];
  if (dir2.x !== 0 || dir2.y !== 0) {
    pointsEnd.push(endExit);
    
    // End detour
    if (dir2.x !== 0) {
      const isGoingBackwards = (startExit.x - endExit.x) * dir2.x < 0;
      if (isGoingBackwards) {
        const detourY = p2.y + (startExit.y >= p2.y ? 60 : -60);
        pointsEnd.push({ x: endExit.x, y: detourY });
      }
    } else if (dir2.y !== 0) {
      const isGoingBackwards = (startExit.y - endExit.y) * dir2.y < 0;
      if (isGoingBackwards) {
        const detourX = p2.x + (startExit.x >= p2.x ? 40 : -40);
        pointsEnd.push({ x: detourX, y: endExit.y });
      }
    }
  }
  pointsEnd.reverse();
  
  const pA = points[points.length - 1];
  const pB = pointsEnd[0];
  
  const midPoints: Array<{ x: number; y: number }> = [];
  if (pA.x !== pB.x && pA.y !== pB.y) {
    midPoints.push({ x: pB.x, y: pA.y });
  }
  
  const fullPath = [...points, ...midPoints, ...pointsEnd];
  return simplifyPath(fullPath);
}

// Resolve the complete path points for a wire, keeping manual corners orthogonal
export function getWirePath(wire: any): Array<{ x: number; y: number }> {
  const p1 = getWireEndpointCoords(wire.from);
  const dir1 = getWireEndpointDir(wire.from);
  const p2 = getWireEndpointCoords(wire.to);
  const dir2 = getWireEndpointDir(wire.to);
  
  if (!wire.manualPath || wire.manualPath.length < 2) {
    return getOrthogonalPath(p1, dir1, p2, dir2);
  }
  
  const path = [...wire.manualPath];
  path[0] = p1;
  path[path.length - 1] = p2;
  
  let fullPath: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < path.length - 1; i++) {
    const start = path[i];
    const end = path[i + 1];
    
    let segmentPath: Array<{ x: number; y: number }>;
    if (i === 0) {
      segmentPath = getOrthogonalPath(start, dir1, end, { x: 0, y: 0 });
    } else if (i === path.length - 2) {
      segmentPath = getOrthogonalPath(start, { x: 0, y: 0 }, end, dir2);
    } else {
      segmentPath = [start, end];
    }
    
    if (i > 0) {
      segmentPath.shift();
    }
    fullPath.push(...segmentPath);
  }
  return simplifyPath(fullPath);
}

// Resolve preview path points for active wire drawing
export function getPreviewPathPoints(activeWire: any): Array<{ x: number; y: number }> {
  const p1 = activeWire.from.type === 'pin' 
    ? getTerminalCoords(state.components.find((c: any) => c.id === activeWire.from.compId), activeWire.from.terminal)
    : { x: activeWire.from.x, y: activeWire.from.y };
  const dir1 = getWireEndpointDir(activeWire.from);
  
  const corners = activeWire.intermediatePoints || [];
  const target = activeWire.target;
  
  const pts = [p1, ...corners, target];
  let fullPath: Array<{ x: number; y: number }> = [];
  
  for (let i = 0; i < pts.length - 1; i++) {
    const start = pts[i];
    const end = pts[i + 1];
    
    const dStart = (i === 0) ? dir1 : { x: 0, y: 0 };
    const dEnd = { x: 0, y: 0 };
    
    const segmentPath = getOrthogonalPath(start, dStart, end, dEnd);
    if (i > 0) {
      segmentPath.shift();
    }
    fullPath.push(...segmentPath);
  }
  return simplifyPath(fullPath);
}

// Simple preview path calculation for interactive drawing
export function getPreviewPath(p1: { x: number; y: number }, dir1: { x: number; y: number }, target: { x: number; y: number }): Array<{ x: number; y: number }> {
  const d = (dir1.x === 0 && dir1.y === 0) ? 0 : 20;
  const startExit = { x: p1.x + dir1.x * d, y: p1.y + dir1.y * d };
  const points = [p1, startExit];
  
  if (dir1.x !== 0 || (dir1.x === 0 && dir1.y === 0)) {
    points.push({ x: startExit.x, y: target.y });
  } else {
    points.push({ x: target.x, y: startExit.y });
  }
  points.push(target);
  
  return simplifyPath(points);
}

// Project a point onto the closest orthogonal segment of an SVG path
export function getClosestPointOnPath(pt: { x: number; y: number }, path: Array<{ x: number; y: number }>): { x: number; y: number } {
  let minD = Infinity;
  let closestPt = { x: pt.x, y: pt.y };

  for (let i = 0; i < path.length - 1; i++) {
    const pA = path[i];
    const pB = path[i + 1];

    let projX, projY;
    if (pA.x === pB.x) {
      // Vertical segment
      projX = pA.x;
      projY = Math.max(Math.min(pA.y, pB.y), Math.min(Math.max(pA.y, pB.y), pt.y));
    } else if (pA.y === pB.y) {
      // Horizontal segment
      projX = Math.max(Math.min(pA.x, pB.x), Math.min(Math.max(pA.x, pB.x), pt.x));
      projY = pA.y;
    } else {
      // General segment fallback
      const dx = pB.x - pA.x;
      const dy = pB.y - pA.y;
      const t = Math.max(0, Math.min(1, ((pt.x - pA.x) * dx + (pt.y - pA.y) * dy) / (dx * dx + dy * dy)));
      projX = pA.x + t * dx;
      projY = pA.y + t * dy;
    }

    const dist = Math.hypot(pt.x - projX, pt.y - projY);
    if (dist < minD) {
      minD = dist;
      closestPt = { x: Math.round(projX / 20) * 20, y: Math.round(projY / 20) * 20 };
    }
  }

  return closestPt;
}

// Snap all wire-to-wire connection endpoints to the closest point on their target wire's path
export function snapWireToWireEndpoints(): void {
  // Run 2 iterations to handle chained wire-to-wire connections (W3 -> W2 -> W1)
  for (let iter = 0; iter < 2; iter++) {
    const wirePaths: Record<string, Array<{ x: number; y: number }>> = {};
    state.wires.forEach((wire: any) => {
      const p1 = getWireEndpointCoords(wire.from);
      const dir1 = getWireEndpointDir(wire.from);
      const p2 = getWireEndpointCoords(wire.to);
      const dir2 = getWireEndpointDir(wire.to);
      if (wire.manualPath) {
        wirePaths[wire.id] = wire.manualPath;
      } else {
        wirePaths[wire.id] = getOrthogonalPath(p1, dir1, p2, dir2);
      }
    });

    state.wires.forEach((wire: any) => {
      if (wire.from.type === 'wire') {
        const targetPath = wirePaths[wire.from.wireId];
        if (targetPath) {
          const snapped = getClosestPointOnPath({ x: wire.from.x, y: wire.from.y }, targetPath);
          wire.from.x = snapped.x;
          wire.from.y = snapped.y;
        }
      }
      if (wire.to.type === 'wire') {
        const targetPath = wirePaths[wire.to.wireId];
        if (targetPath) {
          const snapped = getClosestPointOnPath({ x: wire.to.x, y: wire.to.y }, targetPath);
          wire.to.x = snapped.x;
          wire.to.y = snapped.y;
        }
      }
    });
  }
}

// Check if an orthogonal segment intersects a rectangle
export function rectIntersectsSegment(xMin: number, yMin: number, xMax: number, yMax: number, pA: { x: number; y: number }, pB: { x: number; y: number }): boolean {
  const xStart = Math.min(pA.x, pB.x);
  const xEnd = Math.max(pA.x, pB.x);
  const yStart = Math.min(pA.y, pB.y);
  const yEnd = Math.max(pA.y, pB.y);

  if (pA.x === pB.x) {
    // Vertical segment
    return pA.x >= xMin && pA.x <= xMax && yStart <= yMax && yEnd >= yMin;
  } else {
    // Horizontal segment
    return pA.y >= yMin && pA.y <= yMax && xStart <= xMax && xEnd >= xMin;
  }
}

// Find the closest terminal pin or wire segment to mousePos within a specific pixel tolerance
export function resolveRoutingSnap(mousePos: { x: number; y: number }): any {
  const TOLERANCE = 24; // tolerance in canvas pixels
  let closestPin: any = null;
  let minPinD = Infinity;

  // 1. Check all pins of all components
  state.components.forEach((comp: any) => {
    const pinMap = getComponentPins(comp);
    Object.keys(pinMap).forEach(term => {
      // Skip if this is the start pin of the active wire
      if (state.activeWire && state.activeWire.from.type === 'pin' && 
          state.activeWire.from.compId === comp.id && state.activeWire.from.terminal === term) {
        return;
      }
      
      const pt = getTerminalCoords(comp, term);
      const d = Math.hypot(mousePos.x - pt.x, mousePos.y - pt.y);
      if (d < minPinD) {
        minPinD = d;
        closestPin = { type: 'pin', compId: comp.id, terminal: term, x: pt.x, y: pt.y };
      }
    });
  });

  // 2. Check all wires
  let closestWirePoint: any = null;
  let minWireD = Infinity;
  
  state.wires.forEach((wire: any) => {
    // Skip target parent wire if we are connecting from a wire junction to avoid self-connecting
    if (state.activeWire && state.activeWire.from.type === 'wire' && state.activeWire.from.wireId === wire.id) {
      return;
    }
    
    // Resolve wire path
    const p1 = getWireEndpointCoords(wire.from);
    const dir1 = getWireEndpointDir(wire.from);
    const p2 = getWireEndpointCoords(wire.to);
    const dir2 = getWireEndpointDir(wire.to);
    let path = [];
    if (wire.manualPath) {
      path = wire.manualPath;
    } else {
      path = getOrthogonalPath(p1, dir1, p2, dir2);
    }
    
    // Project mousePos onto all segments of this wire
    for (let i = 0; i < path.length - 1; i++) {
      const pA = path[i];
      const pB = path[i + 1];
      
      let projX, projY;
      if (pA.x === pB.x) {
        // Vertical segment
        projX = pA.x;
        projY = Math.max(Math.min(pA.y, pB.y), Math.min(Math.max(pA.y, pB.y), mousePos.y));
      } else if (pA.y === pB.y) {
        // Horizontal segment
        projX = Math.max(Math.min(pA.x, pB.x), Math.min(Math.max(pA.x, pB.x), mousePos.x));
        projY = pA.y;
      } else {
        const dx = pB.x - pA.x;
        const dy = pB.y - pA.y;
        const t = Math.max(0, Math.min(1, ((mousePos.x - pA.x) * dx + (mousePos.y - pA.y) * dy) / (dx * dx + dy * dy)));
        projX = pA.x + t * dx;
        projY = pA.y + t * dy;
      }
      
      const d = Math.hypot(mousePos.x - projX, mousePos.y - projY);
      if (d < minWireD) {
        minWireD = d;
        closestWirePoint = { type: 'wire', wireId: wire.id, x: Math.round(projX / 20) * 20, y: Math.round(projY / 20) * 20 };
      }
    }
  });

  // 3. Choose the closest between pin and wire
  if (minPinD <= minWireD && minPinD <= TOLERANCE) {
    return closestPin;
  } else if (minWireD <= TOLERANCE) {
    return closestWirePoint;
  }
  return null;
}
