/** RGB color representation for sheet tab colors */
export interface TabColor {
  red: number;
  green: number;
  blue: number;
  alpha?: number;
}

/** Sheet properties from Google Sheets API */
export interface SheetProperties {
  sheetId: number;
  title: string;
  index: number;
  sheetType: string;
  hidden?: boolean;
  tabColorStyle?: {
    rgbColor?: TabColor;
  };
}

/** Sheet entry from API response */
export interface Sheet {
  properties: SheetProperties;
}

/** Spreadsheet metadata from API response */
export interface Spreadsheet {
  spreadsheetId: string;
  properties: {
    title: string;
  };
  sheets: Sheet[];
}

/** Request body for batchUpdate API */
export interface BatchUpdateRequest {
  requests: SheetRequest[];
}

/** Individual request in batchUpdate */
export type SheetRequest =
  | { updateSheetProperties: UpdateSheetPropertiesRequest }
  | { addSheet: AddSheetRequest }
  | { deleteSheet: DeleteSheetRequest }
  | { duplicateSheet: DuplicateSheetRequest }
  | { moveDimension: MoveDimensionRequest };

export interface UpdateSheetPropertiesRequest {
  properties: Partial<SheetProperties>;
  fields: string;
}

export interface AddSheetRequest {
  properties?: Partial<SheetProperties>;
}

export interface DeleteSheetRequest {
  sheetId: number;
}

export interface DuplicateSheetRequest {
  sourceSheetId: number;
  insertSheetIndex?: number;
  newSheetName?: string;
}

export interface MoveDimensionRequest {
  source: {
    sheetId: number;
    dimension: "ROWS" | "COLUMNS";
    startIndex: number;
    endIndex: number;
  };
  destinationIndex: number;
}

/** Messages between service worker and side panel */
export type Message =
  | { type: "SPREADSHEET_URL"; url: string }
  | { type: "TAB_UPDATED"; tabId: number; url?: string }
  | { type: "GET_CURRENT_URL" }
  | { type: "CURRENT_URL"; url: string | null };

/** Preset colors for the color picker */
export const PRESET_COLORS: TabColor[] = [
  { red: 0.92, green: 0.26, blue: 0.21 },  // Red
  { red: 1.0, green: 0.43, blue: 0.0 },     // Deep Orange
  { red: 1.0, green: 0.6, blue: 0.0 },      // Orange
  { red: 1.0, green: 0.76, blue: 0.03 },    // Yellow
  { red: 0.3, green: 0.69, blue: 0.31 },    // Green
  { red: 0.0, green: 0.59, blue: 0.53 },    // Teal
  { red: 0.4, green: 0.73, blue: 0.42 },    // Light Green
  { red: 0.13, green: 0.59, blue: 0.95 },   // Blue
  { red: 0.25, green: 0.32, blue: 0.71 },   // Indigo
  { red: 0.61, green: 0.15, blue: 0.69 },   // Purple
  { red: 0.47, green: 0.33, blue: 0.28 },   // Brown
  { red: 0.62, green: 0.62, blue: 0.62 },   // Grey
];
