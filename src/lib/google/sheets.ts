/**
 * Google Sheets scope.
 *
 * This file used to hold ~300 lines that rebuilt the invoice layout cell by
 * cell into a blank spreadsheet. All of it is gone: archive-invoice.ts now
 * copies the master template and fills in the blanks, so the archived Sheet is
 * identical to the template by construction rather than by a reconstruction
 * that had to be kept in step with it by hand.
 */
export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
