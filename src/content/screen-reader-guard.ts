/**
 * Screen Reader Guard - detects when screen reader support is enabled
 * in Google Sheets and warns the user (causes IME first-char drop).
 */

const BANNER_ID = "stm-sr-guard-banner";
const DISMISS_KEY = "stm-sr-guard-dismissed";
const CHECK_INTERVAL_MS = 3000;
const INITIAL_DELAY_MS = 2000;

/** Detect screen reader mode by checking ARIA attributes on the grid */
function isScreenReaderEnabled(): boolean {
  // When screen reader support is ON, the grid cells get aria-label attributes
  // and a live region element becomes active
  const grid = document.querySelector('[role="grid"]');
  if (grid && grid.getAttribute("aria-label")) return true;

  // Fallback: check for the accessibility announcement container
  const speakable = document.getElementById("docs-aria-speakable");
  if (speakable && speakable.children.length > 0) return true;

  // Fallback: check for screen reader specific elements
  const ariaGridcells = document.querySelectorAll('[role="gridcell"][aria-label]');
  if (ariaGridcells.length > 5) return true;

  return false;
}

function showBanner(): void {
  if (document.getElementById(BANNER_ID)) return;

  const banner = document.createElement("div");
  banner.id = BANNER_ID;
  banner.setAttribute("style", [
    "position: fixed",
    "top: 0",
    "left: 0",
    "right: 0",
    "z-index: 99999",
    "background: #FFF3E0",
    "border-bottom: 2px solid #FF9800",
    "padding: 8px 16px",
    "display: flex",
    "align-items: center",
    "justify-content: space-between",
    "font-family: 'Google Sans', Roboto, sans-serif",
    "font-size: 13px",
    "color: #E65100",
    "box-shadow: 0 2px 8px rgba(0,0,0,0.15)",
  ].join(";"));

  const msg = document.createElement("span");
  msg.textContent =
    "スクリーンリーダーのサポートが有効です — かな入力の1文字目が消える原因になります。ツール → ユーザー補助設定 で無効にしてください。";

  const dismiss = document.createElement("button");
  dismiss.textContent = "OK";
  dismiss.setAttribute("style", [
    "background: #FF9800",
    "color: white",
    "border: none",
    "border-radius: 4px",
    "padding: 4px 16px",
    "cursor: pointer",
    "font-size: 13px",
    "font-weight: 500",
    "margin-left: 12px",
    "white-space: nowrap",
  ].join(";"));
  dismiss.addEventListener("click", () => {
    banner.remove();
    sessionStorage.setItem(DISMISS_KEY, "1");
  });

  banner.appendChild(msg);
  banner.appendChild(dismiss);
  document.body.appendChild(banner);
}

function removeBanner(): void {
  document.getElementById(BANNER_ID)?.remove();
}

function check(): void {
  if (sessionStorage.getItem(DISMISS_KEY)) return;

  if (isScreenReaderEnabled()) {
    showBanner();
  } else {
    removeBanner();
  }
}

// Initial check after page settles, then periodic re-check
setTimeout(() => {
  check();
  setInterval(check, CHECK_INTERVAL_MS);
}, INITIAL_DELAY_MS);
