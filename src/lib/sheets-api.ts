import { getAccessToken, getAccessTokenSilent, refreshAccessToken } from "./auth";
import type {
  BatchUpdateRequest,
  Sheet,
  SheetRequest,
  Spreadsheet,
  TabColor,
} from "./types";

const API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

/** Extract spreadsheet ID from a Google Sheets URL */
export function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/** Make an authenticated API request with automatic token refresh on 401 */
async function apiRequest<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  // Use silent token first to avoid popup blocking
  let token = await getAccessTokenSilent();
  if (!token) {
    token = await getAccessToken();
  }

  const doFetch = async (accessToken: string): Promise<Response> => {
    return fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  };

  let response = await doFetch(token);

  // Retry with fresh token on 401
  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    response = await doFetch(newToken);
  }

  if (!response.ok) {
    let message = `API error: ${response.status}`;
    try {
      const error = await response.json();
      message = error.error?.message ?? message;
    } catch {
      // Response body may not be JSON
    }
    console.error("[SheetsAPI]", message);
    throw new Error(message);
  }

  return response.json();
}

/** Execute a batchUpdate request */
async function batchUpdate(
  spreadsheetId: string,
  requests: SheetRequest[]
): Promise<unknown> {
  const body: BatchUpdateRequest = { requests };
  return apiRequest(`${API_BASE}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Get all sheets in a spreadsheet */
export async function getSheets(spreadsheetId: string): Promise<Sheet[]> {
  const data = await apiRequest<Spreadsheet>(
    `${API_BASE}/${spreadsheetId}?fields=sheets.properties`
  );
  return data.sheets ?? [];
}

/** Rename a sheet */
export async function renameSheet(
  spreadsheetId: string,
  sheetId: number,
  newTitle: string
): Promise<void> {
  const sanitizedTitle = newTitle.trim();
  if (sanitizedTitle.length === 0) {
    throw new Error("Sheet name cannot be empty");
  }

  await batchUpdate(spreadsheetId, [
    {
      updateSheetProperties: {
        properties: { sheetId, title: sanitizedTitle },
        fields: "title",
      },
    },
  ]);
}

/** Reorder a sheet to a new index position */
export async function reorderSheet(
  spreadsheetId: string,
  sheetId: number,
  newIndex: number
): Promise<void> {
  await batchUpdate(spreadsheetId, [
    {
      updateSheetProperties: {
        properties: { sheetId, index: newIndex },
        fields: "index",
      },
    },
  ]);
}

/** Change the tab color of a sheet */
export async function changeTabColor(
  spreadsheetId: string,
  sheetId: number,
  color: TabColor | null
): Promise<void> {
  const tabColorStyle = color
    ? { rgbColor: { red: color.red, green: color.green, blue: color.blue } }
    : { rgbColor: {} };

  await batchUpdate(spreadsheetId, [
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          tabColorStyle,
        } as any,
        fields: "tabColorStyle",
      },
    },
  ]);
}

/** Add a new sheet */
export async function addSheet(
  spreadsheetId: string,
  title?: string
): Promise<void> {
  const properties = title ? { title } : {};
  await batchUpdate(spreadsheetId, [
    {
      addSheet: { properties },
    },
  ]);
}

/** Delete a sheet */
export async function deleteSheet(
  spreadsheetId: string,
  sheetId: number
): Promise<void> {
  await batchUpdate(spreadsheetId, [
    {
      deleteSheet: { sheetId },
    },
  ]);
}

/** Duplicate a sheet */
export async function duplicateSheet(
  spreadsheetId: string,
  sourceSheetId: number,
  newSheetName?: string
): Promise<void> {
  await batchUpdate(spreadsheetId, [
    {
      duplicateSheet: {
        sourceSheetId,
        ...(newSheetName ? { newSheetName } : {}),
      },
    },
  ]);
}
