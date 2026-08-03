import { state } from './state';
import { draw } from './renderer';
import { updatePropertiesPanel } from './properties';
import { 
  cutSelected, 
  copySelected, 
  deleteSelected, 
  toggleCommentSelected,
  rotateSelected, 
  flipSelectedHorizontal, 
  flipSelectedVertical 
} from './actions';

let menuEl: HTMLElement | null = null;

function ensureContextMenuDOM(): HTMLElement {
  if (menuEl) return menuEl;

  // Inject CSS styles for Context Menu
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .schematic-context-menu {
      position: fixed;
      z-index: 10000;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
      padding: 4px;
      min-width: 190px;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      font-size: 12px;
      color: #f8fafc;
      user-select: none;
      backdrop-filter: blur(8px);
    }
    .schematic-context-menu .ctx-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 7px 12px;
      border-radius: 5px;
      cursor: pointer;
      position: relative;
      transition: background 0.12s ease, color 0.12s ease;
      color: #e2e8f0;
    }
    .schematic-context-menu .ctx-item:hover {
      background: #0284c7;
      color: #ffffff;
    }
    .schematic-context-menu .ctx-item.disabled {
      opacity: 0.45;
      cursor: not-allowed;
      pointer-events: none;
    }
    .schematic-context-menu .ctx-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 500;
    }
    .schematic-context-menu .ctx-shortcut {
      font-size: 10px;
      color: #94a3b8;
      font-family: 'JetBrains Mono', monospace;
      margin-left: 16px;
    }
    .schematic-context-menu .ctx-item:hover .ctx-shortcut {
      color: #e0f2fe;
    }
    .schematic-context-menu .ctx-divider {
      height: 1px;
      background: #334155;
      margin: 4px 0;
    }
    .schematic-context-menu .ctx-arrow {
      font-size: 9px;
      color: #94a3b8;
      margin-left: 12px;
    }
    .schematic-context-menu .ctx-item:hover .ctx-arrow {
      color: #ffffff;
    }
    .schematic-context-menu .ctx-submenu {
      display: none;
      position: absolute;
      top: -4px;
      left: 100%;
      margin-left: 2px;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
      padding: 4px;
      min-width: 180px;
    }
    .schematic-context-menu .ctx-item.has-submenu:hover > .ctx-submenu {
      display: block;
    }
  `;
  document.head.appendChild(styleEl);

  menuEl = document.createElement('div');
  menuEl.id = 'schematic-context-menu';
  menuEl.className = 'schematic-context-menu';
  menuEl.style.display = 'none';

  menuEl.innerHTML = `
    <div class="ctx-item" id="ctx-cut">
      <span class="ctx-label">Cut</span>
      <span class="ctx-shortcut">Ctrl+X</span>
    </div>
    <div class="ctx-item" id="ctx-copy">
      <span class="ctx-label">Copy</span>
      <span class="ctx-shortcut">Ctrl+C</span>
    </div>
    <div class="ctx-item" id="ctx-delete">
      <span class="ctx-label">Delete</span>
      <span class="ctx-shortcut">Del</span>
    </div>
    <div class="ctx-item" id="ctx-comment">
      <span class="ctx-label" id="ctx-comment-label">Comment Out</span>
      <span class="ctx-shortcut">Shift+X</span>
    </div>
    <div class="ctx-divider"></div>
    <div class="ctx-item has-submenu" id="ctx-format">
      <span class="ctx-label">Format</span>
      <span class="ctx-arrow">▶</span>
      <div class="ctx-submenu">
        <div class="ctx-item" id="ctx-flip-h">
          <span class="ctx-label">Flip Left/Right</span>
          <span class="ctx-shortcut">Ctrl+F</span>
        </div>
        <div class="ctx-item" id="ctx-flip-v">
          <span class="ctx-label">Flip Up/Down</span>
          <span class="ctx-shortcut">Ctrl+I</span>
        </div>
        <div class="ctx-item" id="ctx-rotate">
          <span class="ctx-label">Rotate</span>
          <span class="ctx-shortcut">Ctrl+R</span>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(menuEl);

  // Bind Menu Click Actions
  menuEl.querySelector('#ctx-cut')?.addEventListener('click', (e) => {
    e.stopPropagation();
    hideContextMenu();
    cutSelected();
  });

  menuEl.querySelector('#ctx-copy')?.addEventListener('click', (e) => {
    e.stopPropagation();
    hideContextMenu();
    copySelected();
  });

  menuEl.querySelector('#ctx-delete')?.addEventListener('click', (e) => {
    e.stopPropagation();
    hideContextMenu();
    deleteSelected();
  });

  menuEl.querySelector('#ctx-comment')?.addEventListener('click', (e) => {
    e.stopPropagation();
    hideContextMenu();
    toggleCommentSelected();
  });

  menuEl.querySelector('#ctx-flip-h')?.addEventListener('click', (e) => {
    e.stopPropagation();
    hideContextMenu();
    flipSelectedHorizontal();
  });

  menuEl.querySelector('#ctx-flip-v')?.addEventListener('click', (e) => {
    e.stopPropagation();
    hideContextMenu();
    flipSelectedVertical();
  });

  menuEl.querySelector('#ctx-rotate')?.addEventListener('click', (e) => {
    e.stopPropagation();
    hideContextMenu();
    rotateSelected();
  });

  // Global dismiss listeners
  window.addEventListener('pointerdown', (e) => {
    if (menuEl && !menuEl.contains(e.target as Node)) {
      hideContextMenu();
    }
  });

  window.addEventListener('scroll', () => hideContextMenu(), true);

  return menuEl;
}

export function showContextMenu(e: MouseEvent, svg: SVGSVGElement): void {
  const menu = ensureContextMenuDOM();

  // If drawing a wire, contextmenu cancels wire drawing
  if (state.activeWire) {
    state.activeWire = null;
    draw();
    hideContextMenu();
    return;
  }

  // Determine element directly under right click
  let targetCompId: string | null = null;
  let targetWireId: string | null = null;

  let element: Element | null = document.elementFromPoint(e.clientX, e.clientY);
  while (element && element !== (svg as unknown as Element)) {
    if (element.classList && element.classList.contains('component')) {
      targetCompId = element.getAttribute('data-id');
      break;
    }
    if (element.classList && (element.classList.contains('wire-hitbox') || element.classList.contains('wire'))) {
      targetWireId = element.getAttribute('data-id');
      break;
    }
    element = element.parentElement;
  }

  if (targetCompId) {
    if (!state.selectedComponentIds.includes(targetCompId)) {
      state.selectedComponentIds = [targetCompId];
      state.selectedWireIds = [];
    }
  } else if (targetWireId) {
    if (!state.selectedWireIds.includes(targetWireId)) {
      state.selectedWireIds = [targetWireId];
      state.selectedComponentIds = [];
    }
  }

  draw();
  updatePropertiesPanel();

  const hasSelection = state.selectedComponentIds.length > 0 || state.selectedWireIds.length > 0;
  const hasCompSelection = state.selectedComponentIds.length > 0;

  // Check if all selected items are currently commented out
  const selComps = state.selectedComponentIds.map((id: string) => state.components.find((c: any) => c.id === id)).filter(Boolean);
  const selWires = state.selectedWireIds.map((id: string) => state.wires.find((w: any) => w.id === id)).filter(Boolean);
  const allCommented = hasSelection && selComps.every((c: any) => c.commented) && selWires.every((w: any) => w.commented);

  const commentLabelEl = menu.querySelector('#ctx-comment-label');
  if (commentLabelEl) {
    commentLabelEl.textContent = allCommented ? 'Uncomment' : 'Comment Out';
  }

  // Update item enabled/disabled state based on active selection
  const cutItem = menu.querySelector('#ctx-cut');
  const copyItem = menu.querySelector('#ctx-copy');
  const deleteItem = menu.querySelector('#ctx-delete');
  const commentItem = menu.querySelector('#ctx-comment');
  const formatItem = menu.querySelector('#ctx-format');

  if (hasSelection) {
    cutItem?.classList.remove('disabled');
    copyItem?.classList.remove('disabled');
    deleteItem?.classList.remove('disabled');
    commentItem?.classList.remove('disabled');
  } else {
    cutItem?.classList.add('disabled');
    copyItem?.classList.add('disabled');
    deleteItem?.classList.add('disabled');
    commentItem?.classList.add('disabled');
  }

  if (hasCompSelection) {
    formatItem?.classList.remove('disabled');
  } else {
    formatItem?.classList.add('disabled');
  }

  // Display and adjust position to fit within viewport boundaries
  menu.style.display = 'block';

  const menuWidth = menu.offsetWidth || 190;
  const menuHeight = menu.offsetHeight || 190;

  let x = e.clientX;
  let y = e.clientY;

  if (x + menuWidth > window.innerWidth) {
    x = Math.max(0, window.innerWidth - menuWidth - 10);
  }
  if (y + menuHeight > window.innerHeight) {
    y = Math.max(0, window.innerHeight - menuHeight - 10);
  }

  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  // Adjust submenu flip position if near right boundary
  const submenu = menu.querySelector('.ctx-submenu') as HTMLElement;
  if (submenu) {
    if (x + menuWidth + 180 > window.innerWidth) {
      submenu.style.left = 'auto';
      submenu.style.right = '100%';
      submenu.style.marginRight = '2px';
      submenu.style.marginLeft = '0';
    } else {
      submenu.style.left = '100%';
      submenu.style.right = 'auto';
      submenu.style.marginLeft = '2px';
      submenu.style.marginRight = '0';
    }
  }
}

export function hideContextMenu(): void {
  if (menuEl) {
    menuEl.style.display = 'none';
  }
}
