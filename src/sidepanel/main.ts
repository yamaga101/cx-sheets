import {
  extractSpreadsheetId,
  getSheets,
  renameSheet,
  reorderSheet,
  changeTabColor,
  addSheet,
  deleteSheet,
  duplicateSheet,
} from "../lib/sheets-api";
import { getAccessToken, getAccessTokenSilent } from "../lib/auth";
import type { Sheet, TabColor } from "../lib/types";
import { PRESET_COLORS } from "../lib/types";

// DOM Elements
const loadingEl = document.getElementById("loading") as HTMLDivElement;
const errorEl = document.getElementById("error") as HTMLDivElement;
const errorMessageEl = document.getElementById("error-message") as HTMLParagraphElement;
const authRequiredEl = document.getElementById("auth-required") as HTMLDivElement;
const notSheetsEl = document.getElementById("not-sheets") as HTMLDivElement;
const sheetListEl = document.getElementById("sheet-list") as HTMLUListElement;
const colorPickerEl = document.getElementById("color-picker") as HTMLDivElement;
const confirmDialog = document.getElementById("confirm-dialog") as HTMLDialogElement;
const confirmMessage = document.getElementById("confirm-message") as HTMLParagraphElement;
const bulkBarEl = document.getElementById("bulk-bar") as HTMLDivElement;
const bulkCountEl = document.getElementById("bulk-count") as HTMLSpanElement;

const btnRefresh = document.getElementById("btn-refresh") as HTMLButtonElement;
const btnAdd = document.getElementById("btn-add") as HTMLButtonElement;
const btnAuth = document.getElementById("btn-auth") as HTMLButtonElement;
const btnRetry = document.getElementById("btn-retry") as HTMLButtonElement;
const confirmCancel = document.getElementById("confirm-cancel") as HTMLButtonElement;
const confirmOk = document.getElementById("confirm-ok") as HTMLButtonElement;
const btnBulkMoveTop = document.getElementById("btn-bulk-move-top") as HTMLButtonElement;
const btnBulkMoveBottom = document.getElementById("btn-bulk-move-bottom") as HTMLButtonElement;
const btnBulkDelete = document.getElementById("btn-bulk-delete") as HTMLButtonElement;
const btnBulkDeselect = document.getElementById("btn-bulk-deselect") as HTMLButtonElement;

// State
let currentSpreadsheetId: string | null = null;
let sheets: Sheet[] = [];
let selectedSheetIds: Set<number> = new Set();
let lastClickedIndex: number | null = null;
let dragSourceIndex: number | null = null;
let activeColorPickerSheetId: number | null = null;
let pendingConfirmResolve: ((value: boolean) => void) | null = null;

// ─── UI State Management ────────────────────────────────────────

function showView(view: "loading" | "error" | "auth" | "not-sheets" | "list"): void {
  loadingEl.hidden = view !== "loading";
  errorEl.hidden = view !== "error";
  authRequiredEl.hidden = view !== "auth";
  notSheetsEl.hidden = view !== "not-sheets";
  sheetListEl.hidden = view !== "list";
}

function showError(message: string): void {
  errorMessageEl.textContent = message;
  showView("error");
}

function updateBulkBar(): void {
  const count = selectedSheetIds.size;
  bulkBarEl.hidden = count === 0;
  bulkCountEl.textContent = `${count} 件選択中`;
}

// ─── Selection ──────────────────────────────────────────────────

function handleItemClick(sheetId: number, index: number, e: MouseEvent): void {
  if (e.metaKey || e.ctrlKey) {
    // Toggle individual selection
    if (selectedSheetIds.has(sheetId)) {
      selectedSheetIds.delete(sheetId);
    } else {
      selectedSheetIds.add(sheetId);
    }
  } else if (e.shiftKey && lastClickedIndex !== null) {
    // Range selection
    const start = Math.min(lastClickedIndex, index);
    const end = Math.max(lastClickedIndex, index);
    for (let i = start; i <= end; i++) {
      if (sheets[i]) {
        selectedSheetIds.add(sheets[i].properties.sheetId);
      }
    }
  } else {
    // Single click - toggle if already only selection, otherwise select only this
    if (selectedSheetIds.size === 1 && selectedSheetIds.has(sheetId)) {
      selectedSheetIds.clear();
    } else {
      selectedSheetIds.clear();
      selectedSheetIds.add(sheetId);
    }
  }

  lastClickedIndex = index;
  updateSelectionUI();
}

function updateSelectionUI(): void {
  const items = sheetListEl.querySelectorAll(".sheet-item");
  for (const item of items) {
    const id = Number((item as HTMLElement).dataset.sheetId);
    item.classList.toggle("sheet-item--selected", selectedSheetIds.has(id));
  }
  updateBulkBar();
}

function clearSelection(): void {
  selectedSheetIds.clear();
  lastClickedIndex = null;
  updateSelectionUI();
}

// ─── Confirmation Dialog ────────────────────────────────────────

function showConfirmDialog(message: string): Promise<boolean> {
  confirmMessage.textContent = message;
  confirmDialog.showModal();
  return new Promise((resolve) => {
    pendingConfirmResolve = resolve;
  });
}

confirmCancel.addEventListener("click", () => {
  confirmDialog.close();
  pendingConfirmResolve?.(false);
  pendingConfirmResolve = null;
});

confirmOk.addEventListener("click", () => {
  confirmDialog.close();
  pendingConfirmResolve?.(true);
  pendingConfirmResolve = null;
});

// ─── Color Picker ───────────────────────────────────────────────

function initColorPicker(): void {
  const colorsContainer = colorPickerEl.querySelector(".color-picker__colors") as HTMLDivElement;
  colorsContainer.innerHTML = "";

  for (const color of PRESET_COLORS) {
    const swatch = document.createElement("button");
    swatch.className = "color-picker__swatch";
    swatch.style.backgroundColor = tabColorToCss(color);
    swatch.addEventListener("click", () => handleColorSelect(color));
    colorsContainer.appendChild(swatch);
  }

  const clearBtn = colorPickerEl.querySelector(".color-picker__clear") as HTMLButtonElement;
  clearBtn.addEventListener("click", () => handleColorSelect(null));
}

function showColorPicker(sheetId: number, anchorEl: HTMLElement): void {
  activeColorPickerSheetId = sheetId;
  colorPickerEl.hidden = false;

  const rect = anchorEl.getBoundingClientRect();
  colorPickerEl.style.top = `${rect.bottom + 4}px`;
  colorPickerEl.style.left = `${Math.max(8, rect.left - 60)}px`;
}

function hideColorPicker(): void {
  colorPickerEl.hidden = true;
  activeColorPickerSheetId = null;
}

async function handleColorSelect(color: TabColor | null): Promise<void> {
  if (activeColorPickerSheetId === null || !currentSpreadsheetId) return;

  hideColorPicker();
  try {
    await changeTabColor(currentSpreadsheetId, activeColorPickerSheetId, color);
    await loadSheets();
  } catch (err) {
    showError(`色の変更に失敗しました: ${(err as Error).message}`);
  }
}

document.addEventListener("click", (e) => {
  if (!colorPickerEl.hidden && !colorPickerEl.contains(e.target as Node)) {
    hideColorPicker();
  }
});

// ─── Tab Color Helpers ──────────────────────────────────────────

function tabColorToCss(color: TabColor | undefined | null): string {
  if (!color) return "#e0e0e0";
  const r = Math.round((color.red ?? 0) * 255);
  const g = Math.round((color.green ?? 0) * 255);
  const b = Math.round((color.blue ?? 0) * 255);
  return `rgb(${r}, ${g}, ${b})`;
}

// ─── Render Sheet List ──────────────────────────────────────────

function renderSheets(): void {
  sheetListEl.innerHTML = "";

  for (const sheet of sheets) {
    const props = sheet.properties;
    const li = createSheetItem(props.sheetId, props.title, props.index, props.tabColorStyle?.rgbColor);
    sheetListEl.appendChild(li);
  }

  showView("list");
  updateSelectionUI();
}

function createSheetItem(
  sheetId: number,
  title: string,
  index: number,
  tabColor?: TabColor
): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "sheet-item";
  li.dataset.sheetId = String(sheetId);
  li.dataset.index = String(index);
  li.draggable = true;

  // Click for selection
  li.addEventListener("click", (e) => {
    // Ignore clicks on buttons, inputs, color dots
    const target = e.target as HTMLElement;
    if (target.closest(".sheet-item__btn, .sheet-item__color, .sheet-item__name-input")) return;
    handleItemClick(sheetId, index, e);
  });

  // Drag handle
  const handle = document.createElement("span");
  handle.className = "sheet-item__handle";
  handle.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <circle cx="5" cy="4" r="1.5"/><circle cx="11" cy="4" r="1.5"/>
    <circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/>
    <circle cx="5" cy="12" r="1.5"/><circle cx="11" cy="12" r="1.5"/>
  </svg>`;

  // Color indicator
  const colorDot = document.createElement("span");
  colorDot.className = "sheet-item__color";
  colorDot.style.backgroundColor = tabColorToCss(tabColor);
  colorDot.addEventListener("click", (e) => {
    e.stopPropagation();
    showColorPicker(sheetId, colorDot);
  });

  // Sheet name
  const nameSpan = document.createElement("span");
  nameSpan.className = "sheet-item__name";
  nameSpan.textContent = title;
  nameSpan.addEventListener("dblclick", () => startRename(li, sheetId, title));

  // Action buttons
  const actions = document.createElement("div");
  actions.className = "sheet-item__actions";

  const duplicateBtn = createActionButton("複製", "sheet-item__btn", () =>
    handleDuplicate(sheetId, title)
  );
  const deleteBtn = createActionButton("削除", "sheet-item__btn sheet-item__btn--delete", () =>
    handleDelete(sheetId, title)
  );

  actions.append(duplicateBtn, deleteBtn);
  li.append(handle, colorDot, nameSpan, actions);

  // Drag events
  setupDragEvents(li, index);

  return li;
}

function createActionButton(
  label: string,
  className: string,
  onClick: () => void
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = className;
  btn.textContent = label;
  btn.title = label;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

// ─── Inline Rename ──────────────────────────────────────────────

function startRename(li: HTMLLIElement, sheetId: number, currentTitle: string): void {
  const nameSpan = li.querySelector(".sheet-item__name") as HTMLSpanElement;
  const input = document.createElement("input");
  input.className = "sheet-item__name-input";
  input.type = "text";
  input.value = currentTitle;

  const finishRename = async (): Promise<void> => {
    const newTitle = input.value.trim();
    if (newTitle && newTitle !== currentTitle && currentSpreadsheetId) {
      try {
        await renameSheet(currentSpreadsheetId, sheetId, newTitle);
        nameSpan.textContent = newTitle;
      } catch (err) {
        showError(`リネームに失敗しました: ${(err as Error).message}`);
        nameSpan.textContent = currentTitle;
      }
    } else {
      nameSpan.textContent = currentTitle;
    }
    input.replaceWith(nameSpan);
  };

  input.addEventListener("blur", finishRename);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      input.blur();
    } else if (e.key === "Escape") {
      input.value = currentTitle;
      input.blur();
    }
  });

  nameSpan.replaceWith(input);
  input.focus();
  input.select();
}

// ─── Drag and Drop ──────────────────────────────────────────────

function setupDragEvents(li: HTMLLIElement, index: number): void {
  li.addEventListener("dragstart", (e) => {
    const sheetId = Number(li.dataset.sheetId);

    // If dragging an unselected item, select only that item
    if (!selectedSheetIds.has(sheetId)) {
      selectedSheetIds.clear();
      selectedSheetIds.add(sheetId);
      updateSelectionUI();
    }

    dragSourceIndex = index;
    li.classList.add("sheet-item--dragging");
    e.dataTransfer!.effectAllowed = "move";
    e.dataTransfer!.setData("text/plain", String(index));
  });

  li.addEventListener("dragend", () => {
    li.classList.remove("sheet-item--dragging");
    dragSourceIndex = null;
    clearDragOverStyles();
  });

  li.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = "move";
    clearDragOverStyles();
    li.classList.add("sheet-item--drag-over");
  });

  li.addEventListener("dragleave", () => {
    li.classList.remove("sheet-item--drag-over");
  });

  li.addEventListener("drop", async (e) => {
    e.preventDefault();
    clearDragOverStyles();

    if (!currentSpreadsheetId || selectedSheetIds.size === 0) return;

    const targetIndex = Number(li.dataset.index);

    // Move all selected sheets to the target position
    const selectedSheets = sheets
      .filter((s) => selectedSheetIds.has(s.properties.sheetId))
      .sort((a, b) => a.properties.index - b.properties.index);

    try {
      // Move each selected sheet sequentially to maintain order
      for (let i = 0; i < selectedSheets.length; i++) {
        await reorderSheet(
          currentSpreadsheetId,
          selectedSheets[i].properties.sheetId,
          targetIndex + i
        );
      }
      await loadSheets();
    } catch (err) {
      showError(`並び替えに失敗しました: ${(err as Error).message}`);
    }
  });
}

function clearDragOverStyles(): void {
  document.querySelectorAll(".sheet-item--drag-over").forEach((el) => {
    el.classList.remove("sheet-item--drag-over");
  });
}

// ─── Single Actions ─────────────────────────────────────────────

async function handleAdd(): Promise<void> {
  if (!currentSpreadsheetId) return;
  try {
    await addSheet(currentSpreadsheetId);
    await loadSheets();
  } catch (err) {
    showError(`シートの追加に失敗しました: ${(err as Error).message}`);
  }
}

async function handleDelete(sheetId: number, title: string): Promise<void> {
  if (!currentSpreadsheetId) return;

  const confirmed = await showConfirmDialog(
    `「${title}」を削除しますか？この操作は取り消せません。`
  );
  if (!confirmed) return;

  try {
    await deleteSheet(currentSpreadsheetId, sheetId);
    selectedSheetIds.delete(sheetId);
    await loadSheets();
  } catch (err) {
    showError(`シートの削除に失敗しました: ${(err as Error).message}`);
  }
}

async function handleDuplicate(sheetId: number, title: string): Promise<void> {
  if (!currentSpreadsheetId) return;
  try {
    await duplicateSheet(currentSpreadsheetId, sheetId, `${title} のコピー`);
    await loadSheets();
  } catch (err) {
    showError(`シートの複製に失敗しました: ${(err as Error).message}`);
  }
}

// ─── Bulk Actions ───────────────────────────────────────────────

async function handleBulkMoveTop(): Promise<void> {
  if (!currentSpreadsheetId || selectedSheetIds.size === 0) return;

  const selectedSheets = sheets
    .filter((s) => selectedSheetIds.has(s.properties.sheetId))
    .sort((a, b) => a.properties.index - b.properties.index);

  try {
    for (let i = 0; i < selectedSheets.length; i++) {
      await reorderSheet(currentSpreadsheetId, selectedSheets[i].properties.sheetId, i);
    }
    await loadSheets();
  } catch (err) {
    showError(`一括移動に失敗しました: ${(err as Error).message}`);
  }
}

async function handleBulkMoveBottom(): Promise<void> {
  if (!currentSpreadsheetId || selectedSheetIds.size === 0) return;

  const selectedSheets = sheets
    .filter((s) => selectedSheetIds.has(s.properties.sheetId))
    .sort((a, b) => a.properties.index - b.properties.index);

  const bottomIndex = sheets.length - 1;

  try {
    for (let i = 0; i < selectedSheets.length; i++) {
      await reorderSheet(
        currentSpreadsheetId,
        selectedSheets[i].properties.sheetId,
        bottomIndex
      );
    }
    await loadSheets();
  } catch (err) {
    showError(`一括移動に失敗しました: ${(err as Error).message}`);
  }
}

async function handleBulkDelete(): Promise<void> {
  if (!currentSpreadsheetId || selectedSheetIds.size === 0) return;

  const count = selectedSheetIds.size;
  const confirmed = await showConfirmDialog(
    `${count} 件のシートを削除しますか？この操作は取り消せません。`
  );
  if (!confirmed) return;

  try {
    for (const sheetId of selectedSheetIds) {
      await deleteSheet(currentSpreadsheetId, sheetId);
    }
    selectedSheetIds.clear();
    await loadSheets();
  } catch (err) {
    showError(`一括削除に失敗しました: ${(err as Error).message}`);
  }
}

// ─── Data Loading ───────────────────────────────────────────────

async function loadSheets(): Promise<void> {
  if (!currentSpreadsheetId) return;

  showView("loading");
  try {
    const result = await getSheets(currentSpreadsheetId);
    sheets = result.sort((a, b) => a.properties.index - b.properties.index);
    renderSheets();
  } catch (err) {
    showError(`シートの読み込みに失敗しました: ${(err as Error).message}`);
  }
}

async function getCurrentTabUrl(): Promise<string | null> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tabs[0]?.url ?? null;
    if (url && url.includes("/spreadsheets/d/")) {
      return url;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Initialization ─────────────────────────────────────────────

async function init(): Promise<void> {
  initColorPicker();

  const token = await getAccessTokenSilent();
  if (!token) {
    showView("auth");
    return;
  }

  const url = await getCurrentTabUrl();
  if (!url) {
    showView("not-sheets");
    return;
  }

  const spreadsheetId = extractSpreadsheetId(url);
  if (!spreadsheetId) {
    showView("not-sheets");
    return;
  }

  currentSpreadsheetId = spreadsheetId;
  await loadSheets();
}

// ─── Event Listeners ────────────────────────────────────────────

btnRefresh.addEventListener("click", () => loadSheets());
btnAdd.addEventListener("click", () => handleAdd());
btnRetry.addEventListener("click", () => init());

btnAuth.addEventListener("click", async () => {
  try {
    await getAccessToken();
    await init();
  } catch (err) {
    showError(`ログインに失敗しました: ${(err as Error).message}`);
  }
});

btnBulkMoveTop.addEventListener("click", () => handleBulkMoveTop());
btnBulkMoveBottom.addEventListener("click", () => handleBulkMoveBottom());
btnBulkDelete.addEventListener("click", () => handleBulkDelete());
btnBulkDeselect.addEventListener("click", () => clearSelection());

// Escape key to deselect
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && selectedSheetIds.size > 0) {
    clearSelection();
  }
});

// Listen for active tab changes
chrome.tabs.onActivated.addListener(async () => {
  const url = await getCurrentTabUrl();
  if (!url) return;
  const spreadsheetId = extractSpreadsheetId(url);
  if (spreadsheetId && spreadsheetId !== currentSpreadsheetId) {
    currentSpreadsheetId = spreadsheetId;
    loadSheets();
  }
});

// Start
init();
