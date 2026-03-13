import {
  extractSpreadsheetId,
  getSheets,
  renameSheet,
  changeTabColor,
  addSheet,
  deleteSheet,
  duplicateSheet,
  batchReorder,
  batchDelete,
  batchChangeTabColor,
  batchToggleVisibility,
  toggleSheetVisibility,
} from "../lib/sheets-api";
import { getAccessToken, getAccessTokenSilent } from "../lib/auth";
import type { Sheet, TabColor } from "../lib/types";
import { PRESET_COLORS } from "../lib/types";

// ─── Constants ──────────────────────────────────────────────────

const TOAST_DURATION_MS = 2000;

const ICON_DUPLICATE = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
  <path d="M11 1H3a1 1 0 0 0-1 1v9h1V2h8V1zm2 3H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zm0 11H5V5h8v10z"/>
</svg>`;

const ICON_DELETE = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
  <path d="M5.5 1a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1h-5zM3 3.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1H12v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4h-.5a.5.5 0 0 1-.5-.5zM5 4v9h6V4H5z"/>
</svg>`;

const ICON_EYE_OPEN = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
  <path d="M8 3C4.364 3 1.258 5.073 0 8c1.258 2.927 4.364 5 8 5s6.742-2.073 8-5c-1.258-2.927-4.364-5-8-5zm0 8.5A3.5 3.5 0 1 1 8 4.5a3.5 3.5 0 0 1 0 7zm0-5.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>
</svg>`;

const ICON_EYE_CLOSED = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
  <path d="M13.359 11.238l1.934 1.934-1.06 1.06-12.466-12.464 1.06-1.06 2.15 2.15C6.018 2.302 6.985 2 8 2c3.636 0 6.742 2.073 8 5a9.4 9.4 0 0 1-2.641 3.238zM5.007 4.886l1.462 1.462A2 2 0 0 0 8 10c.178 0 .352-.023.52-.067l1.462 1.462A3.5 3.5 0 0 1 4.5 7c0-.636.17-1.232.467-1.747L3.534 3.82A9.4 9.4 0 0 0 0 8c1.258 2.927 4.364 5 8 5 .98 0 1.92-.177 2.793-.505l-1.303-1.303A3.5 3.5 0 0 1 5.007 4.886z"/>
</svg>`;

// ─── DOM Elements ───────────────────────────────────────────────

const loadingEl = document.getElementById("loading") as HTMLDivElement;
const errorEl = document.getElementById("error") as HTMLDivElement;
const errorMessageEl = document.getElementById("error-message") as HTMLParagraphElement;
const authRequiredEl = document.getElementById("auth-required") as HTMLDivElement;
const notSheetsEl = document.getElementById("not-sheets") as HTMLDivElement;
const sheetListEl = document.getElementById("sheet-list") as HTMLUListElement;
const colorPickerEl = document.getElementById("color-picker") as HTMLDivElement;
const confirmDialog = document.getElementById("confirm-dialog") as HTMLDialogElement;
const confirmMessage = document.getElementById("confirm-message") as HTMLParagraphElement;
const confirmOkBtn = document.getElementById("confirm-ok") as HTMLButtonElement;
const bulkBarEl = document.getElementById("bulk-bar") as HTMLDivElement;
const bulkCountEl = document.getElementById("bulk-count") as HTMLSpanElement;
const toastContainer = document.getElementById("toast-container") as HTMLDivElement;
const searchInput = document.getElementById("search-input") as HTMLInputElement;
const sheetCountEl = document.getElementById("sheet-count") as HTMLSpanElement;

const btnRefresh = document.getElementById("btn-refresh") as HTMLButtonElement;
const btnAdd = document.getElementById("btn-add") as HTMLButtonElement;
const btnAuth = document.getElementById("btn-auth") as HTMLButtonElement;
const btnRetry = document.getElementById("btn-retry") as HTMLButtonElement;
const confirmCancel = document.getElementById("confirm-cancel") as HTMLButtonElement;
const btnBulkMoveTop = document.getElementById("btn-bulk-move-top") as HTMLButtonElement;
const btnBulkMoveBottom = document.getElementById("btn-bulk-move-bottom") as HTMLButtonElement;
const btnBulkDelete = document.getElementById("btn-bulk-delete") as HTMLButtonElement;
const btnBulkDeselect = document.getElementById("btn-bulk-deselect") as HTMLButtonElement;
const btnBulkColor = document.getElementById("btn-bulk-color") as HTMLButtonElement;
const btnBulkVisibility = document.getElementById("btn-bulk-visibility") as HTMLButtonElement;

// ─── State ──────────────────────────────────────────────────────

let currentSpreadsheetId: string | null = null;
let sheets: Sheet[] = [];
let selectedSheetIds: Set<number> = new Set();
let lastClickedIndex: number | null = null;
let focusedIndex: number | null = null;
let dragSourceIndex: number | null = null;
let activeColorPickerSheetId: number | null = null;
let bulkColorMode = false;
let pendingConfirmResolve: ((value: boolean) => void) | null = null;
let currentSearchQuery = "";

// ─── Toast Notifications ────────────────────────────────────────

function showToast(message: string, type: "success" | "error" = "success"): void {
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  toast.style.setProperty("--toast-duration", `${TOAST_DURATION_MS}ms`);
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, TOAST_DURATION_MS + 300);
}

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

function updateSheetCount(): void {
  const hidden = sheets.filter((s) => s.properties.hidden).length;
  const total = sheets.length;
  sheetCountEl.textContent = hidden > 0 ? `${total} シート (${hidden} 非表示)` : `${total} シート`;
}

// ─── Search / Filter ────────────────────────────────────────────

function applySearchFilter(): void {
  const query = currentSearchQuery.toLowerCase();
  const items = sheetListEl.querySelectorAll(".sheet-item") as NodeListOf<HTMLElement>;

  for (const item of items) {
    const name = item.dataset.sheetTitle ?? "";
    item.hidden = query !== "" && !name.toLowerCase().includes(query);
  }
}

// ─── Navigation (Click-to-Jump) ─────────────────────────────────

async function navigateToSheet(sheetId: number): Promise<void> {
  if (!currentSpreadsheetId) return;
  const url = `https://docs.google.com/spreadsheets/d/${currentSpreadsheetId}/edit#gid=${sheetId}`;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.tabs.update(tab.id, { url });
  }
}

// ─── Selection ──────────────────────────────────────────────────

function handleItemClick(sheetId: number, index: number, e: MouseEvent): void {
  if (e.metaKey || e.ctrlKey) {
    // Toggle selection
    if (selectedSheetIds.has(sheetId)) {
      selectedSheetIds.delete(sheetId);
    } else {
      selectedSheetIds.add(sheetId);
    }
    lastClickedIndex = index;
    focusedIndex = index;
    updateSelectionUI();
  } else if (e.shiftKey && lastClickedIndex !== null) {
    // Range selection
    const start = Math.min(lastClickedIndex, index);
    const end = Math.max(lastClickedIndex, index);
    for (let i = start; i <= end; i++) {
      if (sheets[i]) {
        selectedSheetIds.add(sheets[i].properties.sheetId);
      }
    }
    focusedIndex = index;
    updateSelectionUI();
  } else {
    // Single click = navigate to sheet
    focusedIndex = index;
    updateFocusUI();
    navigateToSheet(sheetId);
  }
}

function updateSelectionUI(): void {
  const items = sheetListEl.querySelectorAll(".sheet-item");
  for (const item of items) {
    const id = Number((item as HTMLElement).dataset.sheetId);
    item.classList.toggle("sheet-item--selected", selectedSheetIds.has(id));
  }
  updateBulkBar();
  updateFocusUI();
}

function updateFocusUI(): void {
  const items = sheetListEl.querySelectorAll(".sheet-item");
  for (const item of items) {
    const idx = Number((item as HTMLElement).dataset.index);
    item.classList.toggle("sheet-item--focused", idx === focusedIndex);
  }
}

function clearSelection(): void {
  selectedSheetIds.clear();
  lastClickedIndex = null;
  updateSelectionUI();
}

// ─── Confirmation Dialog ────────────────────────────────────────

function showConfirmDialog(message: string, okLabel = "削除"): Promise<boolean> {
  confirmMessage.textContent = message;
  confirmOkBtn.textContent = okLabel;
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

confirmOkBtn.addEventListener("click", () => {
  confirmDialog.close();
  pendingConfirmResolve?.(true);
  pendingConfirmResolve = null;
});

// ─── Color Picker ───────────────────────────────────────────────

function colorsMatch(a: TabColor, b: TabColor): boolean {
  const tolerance = 0.02;
  return (
    Math.abs((a.red ?? 0) - (b.red ?? 0)) < tolerance &&
    Math.abs((a.green ?? 0) - (b.green ?? 0)) < tolerance &&
    Math.abs((a.blue ?? 0) - (b.blue ?? 0)) < tolerance
  );
}

function initColorPicker(currentColor?: TabColor | null): void {
  const colorsContainer = colorPickerEl.querySelector(".color-picker__colors") as HTMLDivElement;
  colorsContainer.innerHTML = "";

  for (const color of PRESET_COLORS) {
    const swatch = document.createElement("button");
    swatch.className = "color-picker__swatch";
    swatch.style.backgroundColor = tabColorToCss(color);

    if (currentColor && colorsMatch(color, currentColor)) {
      swatch.classList.add("color-picker__swatch--active");
    }

    swatch.addEventListener("click", () => handleColorSelect(color));
    colorsContainer.appendChild(swatch);
  }

  const clearBtn = colorPickerEl.querySelector(".color-picker__clear") as HTMLButtonElement;
  clearBtn.replaceWith(clearBtn.cloneNode(true));
  const newClearBtn = colorPickerEl.querySelector(".color-picker__clear") as HTMLButtonElement;
  newClearBtn.addEventListener("click", () => handleColorSelect(null));
}

function showColorPicker(sheetId: number, anchorEl: HTMLElement): void {
  activeColorPickerSheetId = sheetId;
  bulkColorMode = false;

  const sheet = sheets.find((s) => s.properties.sheetId === sheetId);
  const currentColor = sheet?.properties.tabColorStyle?.rgbColor ?? null;
  initColorPicker(currentColor);

  colorPickerEl.hidden = false;
  const rect = anchorEl.getBoundingClientRect();
  colorPickerEl.style.top = `${rect.bottom + 4}px`;
  colorPickerEl.style.left = `${Math.max(8, rect.left - 60)}px`;
}

function showBulkColorPicker(anchorEl: HTMLElement): void {
  bulkColorMode = true;
  activeColorPickerSheetId = null;
  initColorPicker(null);

  colorPickerEl.hidden = false;
  const rect = anchorEl.getBoundingClientRect();
  colorPickerEl.style.top = `${rect.top - 160}px`;
  colorPickerEl.style.left = `${Math.max(8, rect.left)}px`;
}

function hideColorPicker(): void {
  colorPickerEl.hidden = true;
  activeColorPickerSheetId = null;
  bulkColorMode = false;
}

async function handleColorSelect(color: TabColor | null): Promise<void> {
  if (!currentSpreadsheetId) return;

  if (bulkColorMode) {
    // Bulk color change
    hideColorPicker();
    if (selectedSheetIds.size === 0) return;

    const ids = [...selectedSheetIds];

    // Optimistic update
    const oldColors = new Map<number, Sheet["properties"]["tabColorStyle"]>();
    for (const id of ids) {
      const sheet = sheets.find((s) => s.properties.sheetId === id);
      if (sheet) {
        oldColors.set(id, sheet.properties.tabColorStyle);
        sheet.properties.tabColorStyle = color ? { rgbColor: color } : undefined;
      }
    }
    renderSheets();

    try {
      await batchChangeTabColor(currentSpreadsheetId, ids, color);
      showToast(`${ids.length} 件の色を変更しました`);
    } catch (err) {
      // Rollback
      for (const [id, oldColor] of oldColors) {
        const sheet = sheets.find((s) => s.properties.sheetId === id);
        if (sheet) sheet.properties.tabColorStyle = oldColor;
      }
      renderSheets();
      showToast(`色の変更に失敗しました: ${(err as Error).message}`, "error");
    }
    return;
  }

  // Single sheet color change
  if (activeColorPickerSheetId === null) return;
  const sheetId = activeColorPickerSheetId;
  hideColorPicker();

  // Optimistic update
  const sheet = sheets.find((s) => s.properties.sheetId === sheetId);
  const oldColor = sheet?.properties.tabColorStyle;
  if (sheet) {
    sheet.properties.tabColorStyle = color ? { rgbColor: color } : undefined;
    renderSheets();
  }

  try {
    await changeTabColor(currentSpreadsheetId, sheetId, color);
    showToast("色を変更しました");
  } catch (err) {
    // Rollback
    if (sheet) {
      sheet.properties.tabColorStyle = oldColor;
      renderSheets();
    }
    showToast(`色の変更に失敗しました: ${(err as Error).message}`, "error");
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
    const li = createSheetItem(
      props.sheetId,
      props.title,
      props.index,
      props.tabColorStyle?.rgbColor,
      props.hidden
    );
    sheetListEl.appendChild(li);
  }

  showView("list");
  updateSelectionUI();
  applySearchFilter();
  updateSheetCount();
}

function createSheetItem(
  sheetId: number,
  title: string,
  index: number,
  tabColor?: TabColor,
  hidden?: boolean
): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "sheet-item";
  if (hidden) li.classList.add("sheet-item--hidden");
  li.dataset.sheetId = String(sheetId);
  li.dataset.index = String(index);
  li.dataset.sheetTitle = title;
  li.draggable = true;

  // Click: navigate or select
  li.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest(".sheet-item__btn, .sheet-item__color, .sheet-item__name-input, .sheet-item__visibility")) return;
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

  // Visibility toggle
  const visibilityBtn = document.createElement("button");
  visibilityBtn.className = `sheet-item__visibility${hidden ? "" : " sheet-item__visibility--visible"}`;
  visibilityBtn.title = hidden ? "表示する" : "非表示にする";
  visibilityBtn.innerHTML = hidden ? ICON_EYE_CLOSED : ICON_EYE_OPEN;
  visibilityBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    handleToggleVisibility(sheetId, title, !hidden);
  });

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

  const duplicateBtn = createIconButton(ICON_DUPLICATE, "複製", "sheet-item__btn", () =>
    handleDuplicate(sheetId, title)
  );
  const deleteBtn = createIconButton(ICON_DELETE, "削除", "sheet-item__btn sheet-item__btn--delete", () =>
    handleDelete(sheetId, title)
  );

  actions.append(duplicateBtn, deleteBtn);
  li.append(handle, visibilityBtn, colorDot, nameSpan, actions);

  setupDragEvents(li);

  return li;
}

function createIconButton(
  iconHtml: string,
  tooltip: string,
  className: string,
  onClick: () => void
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = className;
  btn.innerHTML = iconHtml;
  btn.title = tooltip;
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
      // Optimistic update
      nameSpan.textContent = newTitle;
      li.dataset.sheetTitle = newTitle;
      const sheet = sheets.find((s) => s.properties.sheetId === sheetId);
      if (sheet) sheet.properties.title = newTitle;

      try {
        await renameSheet(currentSpreadsheetId, sheetId, newTitle);
        showToast("名前を変更しました");
      } catch (err) {
        // Rollback
        nameSpan.textContent = currentTitle;
        li.dataset.sheetTitle = currentTitle;
        if (sheet) sheet.properties.title = currentTitle;
        showToast(`リネームに失敗しました: ${(err as Error).message}`, "error");
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

function startRenameByIndex(index: number): void {
  if (index < 0 || index >= sheets.length) return;
  const sheet = sheets[index];
  const item = sheetListEl.querySelector(`[data-sheet-id="${sheet.properties.sheetId}"]`) as HTMLLIElement | null;
  if (item) {
    startRename(item, sheet.properties.sheetId, sheet.properties.title);
  }
}

// ─── Drag and Drop ──────────────────────────────────────────────

function setupDragEvents(li: HTMLLIElement): void {
  li.addEventListener("dragstart", (e) => {
    const sheetId = Number(li.dataset.sheetId);

    if (!selectedSheetIds.has(sheetId)) {
      selectedSheetIds.clear();
      selectedSheetIds.add(sheetId);
      updateSelectionUI();
    }

    // Use dataset.index to avoid stale closure
    dragSourceIndex = Number(li.dataset.index);
    li.classList.add("sheet-item--dragging");
    e.dataTransfer!.effectAllowed = "move";
    e.dataTransfer!.setData("text/plain", li.dataset.index!);
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

    const selectedSheets = sheets
      .filter((s) => selectedSheetIds.has(s.properties.sheetId))
      .sort((a, b) => a.properties.index - b.properties.index);

    try {
      const moves = selectedSheets.map((s, i) => ({
        sheetId: s.properties.sheetId,
        newIndex: targetIndex + i,
      }));
      await batchReorder(currentSpreadsheetId, moves);
      showToast("並び替えました");
      await loadSheets();
    } catch (err) {
      showToast(`並び替えに失敗しました: ${(err as Error).message}`, "error");
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
    showToast("シートを追加しました");
    await loadSheets();
  } catch (err) {
    showToast(`シートの追加に失敗しました: ${(err as Error).message}`, "error");
  }
}

async function handleDelete(sheetId: number, title: string): Promise<void> {
  if (!currentSpreadsheetId) return;

  const confirmed = await showConfirmDialog(
    `「${title}」を削除しますか？この操作は取り消せません。`,
    "削除"
  );
  if (!confirmed) return;

  // Optimistic update
  const removedIndex = sheets.findIndex((s) => s.properties.sheetId === sheetId);
  const removedSheet = sheets[removedIndex];
  sheets.splice(removedIndex, 1);
  selectedSheetIds.delete(sheetId);
  renderSheets();

  try {
    await deleteSheet(currentSpreadsheetId, sheetId);
    showToast(`「${title}」を削除しました`);
  } catch (err) {
    // Rollback
    if (removedSheet) {
      sheets.splice(removedIndex, 0, removedSheet);
      renderSheets();
    }
    showToast(`シートの削除に失敗しました: ${(err as Error).message}`, "error");
  }
}

async function handleDuplicate(sheetId: number, title: string): Promise<void> {
  if (!currentSpreadsheetId) return;
  try {
    await duplicateSheet(currentSpreadsheetId, sheetId, `${title} のコピー`);
    showToast(`「${title}」を複製しました`);
    await loadSheets();
  } catch (err) {
    showToast(`シートの複製に失敗しました: ${(err as Error).message}`, "error");
  }
}

async function handleToggleVisibility(sheetId: number, title: string, hidden: boolean): Promise<void> {
  if (!currentSpreadsheetId) return;

  // Optimistic update
  const sheet = sheets.find((s) => s.properties.sheetId === sheetId);
  const oldHidden = sheet?.properties.hidden;
  if (sheet) {
    sheet.properties.hidden = hidden;
    renderSheets();
  }

  try {
    await toggleSheetVisibility(currentSpreadsheetId, sheetId, hidden);
    showToast(hidden ? `「${title}」を非表示にしました` : `「${title}」を表示しました`);
  } catch (err) {
    // Rollback
    if (sheet) {
      sheet.properties.hidden = oldHidden;
      renderSheets();
    }
    showToast(`表示切替に失敗しました: ${(err as Error).message}`, "error");
  }
}

// ─── Bulk Actions ───────────────────────────────────────────────

async function handleBulkMoveTop(): Promise<void> {
  if (!currentSpreadsheetId || selectedSheetIds.size === 0) return;

  const selectedSheets = sheets
    .filter((s) => selectedSheetIds.has(s.properties.sheetId))
    .sort((a, b) => a.properties.index - b.properties.index);

  try {
    const moves = selectedSheets.map((s, i) => ({
      sheetId: s.properties.sheetId,
      newIndex: i,
    }));
    await batchReorder(currentSpreadsheetId, moves);
    showToast(`${selectedSheets.length} 件を先頭へ移動しました`);
    await loadSheets();
  } catch (err) {
    showToast(`一括移動に失敗しました: ${(err as Error).message}`, "error");
  }
}

async function handleBulkMoveBottom(): Promise<void> {
  if (!currentSpreadsheetId || selectedSheetIds.size === 0) return;

  const selectedSheets = sheets
    .filter((s) => selectedSheetIds.has(s.properties.sheetId))
    .sort((a, b) => a.properties.index - b.properties.index);

  // Fix: calculate correct start index so sheets don't all go to same position
  const startIndex = sheets.length - selectedSheets.length;

  try {
    const moves = selectedSheets.map((s, i) => ({
      sheetId: s.properties.sheetId,
      newIndex: startIndex + i,
    }));
    await batchReorder(currentSpreadsheetId, moves);
    showToast(`${selectedSheets.length} 件を末尾へ移動しました`);
    await loadSheets();
  } catch (err) {
    showToast(`一括移動に失敗しました: ${(err as Error).message}`, "error");
  }
}

async function handleBulkDelete(): Promise<void> {
  if (!currentSpreadsheetId || selectedSheetIds.size === 0) return;

  const count = selectedSheetIds.size;
  const confirmed = await showConfirmDialog(
    `${count} 件のシートを削除しますか？この操作は取り消せません。`,
    "削除"
  );
  if (!confirmed) return;

  // Optimistic update
  const removedSheets = sheets.filter((s) => selectedSheetIds.has(s.properties.sheetId));
  sheets = sheets.filter((s) => !selectedSheetIds.has(s.properties.sheetId));
  const removedIds = [...selectedSheetIds];
  selectedSheetIds.clear();
  renderSheets();

  try {
    await batchDelete(currentSpreadsheetId, removedIds);
    showToast(`${count} 件のシートを削除しました`);
  } catch (err) {
    // Rollback
    sheets.push(...removedSheets);
    sheets.sort((a, b) => a.properties.index - b.properties.index);
    renderSheets();
    showToast(`一括削除に失敗しました: ${(err as Error).message}`, "error");
  }
}

async function handleBulkToggleVisibility(): Promise<void> {
  if (!currentSpreadsheetId || selectedSheetIds.size === 0) return;

  const selectedSheets = sheets.filter((s) => selectedSheetIds.has(s.properties.sheetId));
  // If any selected sheet is visible, hide all; otherwise show all
  const anyVisible = selectedSheets.some((s) => !s.properties.hidden);
  const newHidden = anyVisible;

  // Optimistic update
  const oldStates = new Map<number, boolean | undefined>();
  for (const s of selectedSheets) {
    oldStates.set(s.properties.sheetId, s.properties.hidden);
    s.properties.hidden = newHidden;
  }
  renderSheets();

  try {
    await batchToggleVisibility(currentSpreadsheetId, [...selectedSheetIds], newHidden);
    showToast(newHidden
      ? `${selectedSheets.length} 件を非表示にしました`
      : `${selectedSheets.length} 件を表示しました`
    );
  } catch (err) {
    // Rollback
    for (const [id, hidden] of oldStates) {
      const sheet = sheets.find((s) => s.properties.sheetId === id);
      if (sheet) sheet.properties.hidden = hidden;
    }
    renderSheets();
    showToast(`表示切替に失敗しました: ${(err as Error).message}`, "error");
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

// ─── Keyboard Shortcuts ─────────────────────────────────────────

function getVisibleItems(): HTMLLIElement[] {
  return Array.from(sheetListEl.querySelectorAll<HTMLLIElement>(".sheet-item:not([hidden])"));
}

function handleKeydown(e: KeyboardEvent): void {
  // Ignore when typing in an input
  if ((e.target as HTMLElement).tagName === "INPUT") {
    if (e.key === "Escape") {
      (e.target as HTMLInputElement).blur();
    }
    return;
  }

  const visibleItems = getVisibleItems();
  if (visibleItems.length === 0) return;

  switch (e.key) {
    case "/": {
      e.preventDefault();
      searchInput.focus();
      break;
    }

    case "Escape": {
      if (currentSearchQuery) {
        searchInput.value = "";
        currentSearchQuery = "";
        applySearchFilter();
      } else if (selectedSheetIds.size > 0) {
        clearSelection();
      }
      break;
    }

    case "F2": {
      e.preventDefault();
      if (focusedIndex !== null) {
        startRenameByIndex(focusedIndex);
      }
      break;
    }

    case "Delete":
    case "Backspace": {
      if (selectedSheetIds.size > 0) {
        e.preventDefault();
        handleBulkDelete();
      } else if (focusedIndex !== null && focusedIndex < sheets.length) {
        e.preventDefault();
        const s = sheets[focusedIndex];
        handleDelete(s.properties.sheetId, s.properties.title);
      }
      break;
    }

    case "a": {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        // Select all visible sheets
        for (const item of visibleItems) {
          selectedSheetIds.add(Number(item.dataset.sheetId));
        }
        updateSelectionUI();
      }
      break;
    }

    case "ArrowDown": {
      e.preventDefault();
      const currentFocusIdx = visibleItems.findIndex(
        (item) => Number(item.dataset.index) === focusedIndex
      );
      const nextIdx = currentFocusIdx < visibleItems.length - 1 ? currentFocusIdx + 1 : 0;
      focusedIndex = Number(visibleItems[nextIdx].dataset.index);
      updateFocusUI();
      visibleItems[nextIdx].scrollIntoView({ block: "nearest" });
      break;
    }

    case "ArrowUp": {
      e.preventDefault();
      const currentFocusIdx2 = visibleItems.findIndex(
        (item) => Number(item.dataset.index) === focusedIndex
      );
      const prevIdx = currentFocusIdx2 > 0 ? currentFocusIdx2 - 1 : visibleItems.length - 1;
      focusedIndex = Number(visibleItems[prevIdx].dataset.index);
      updateFocusUI();
      visibleItems[prevIdx].scrollIntoView({ block: "nearest" });
      break;
    }

    case "Enter": {
      if (focusedIndex !== null && focusedIndex < sheets.length) {
        navigateToSheet(sheets[focusedIndex].properties.sheetId);
      }
      break;
    }

    case " ": {
      if (focusedIndex !== null && focusedIndex < sheets.length) {
        e.preventDefault();
        const sheetId = sheets[focusedIndex].properties.sheetId;
        if (selectedSheetIds.has(sheetId)) {
          selectedSheetIds.delete(sheetId);
        } else {
          selectedSheetIds.add(sheetId);
        }
        lastClickedIndex = focusedIndex;
        updateSelectionUI();
      }
      break;
    }
  }
}

// ─── Initialization ─────────────────────────────────────────────

async function init(): Promise<void> {
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
btnBulkColor.addEventListener("click", () => showBulkColorPicker(btnBulkColor));
btnBulkVisibility.addEventListener("click", () => handleBulkToggleVisibility());

// Search input
searchInput.addEventListener("input", () => {
  currentSearchQuery = searchInput.value;
  applySearchFilter();
});

// Keyboard shortcuts
document.addEventListener("keydown", handleKeydown);

// Listen for TAB_UPDATED from service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "TAB_UPDATED" && message.url) {
    const spreadsheetId = extractSpreadsheetId(message.url);
    if (spreadsheetId && spreadsheetId !== currentSpreadsheetId) {
      currentSpreadsheetId = spreadsheetId;
      clearSelection();
      loadSheets();
    }
  }
});

// Listen for active tab changes (fallback)
chrome.tabs.onActivated.addListener(async (info) => {
  try {
    const tab = await chrome.tabs.get(info.tabId);
    if (!tab.url || !tab.url.includes("/spreadsheets/d/")) return;
    const spreadsheetId = extractSpreadsheetId(tab.url);
    if (spreadsheetId && spreadsheetId !== currentSpreadsheetId) {
      currentSpreadsheetId = spreadsheetId;
      clearSelection();
      loadSheets();
    }
  } catch {
    // Tab may not be accessible
  }
});

// Start
init();
