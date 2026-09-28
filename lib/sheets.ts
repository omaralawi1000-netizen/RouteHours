import { localDateKey, minutesBetween, type Shift } from "./time";
import { reportRows, type WeeklyReport } from "./timesheet";

async function googleRequest(url: string, accessToken: string, method: string, body: unknown) {
  const response = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `Google Sheets error ${response.status}`);
  return data;
}

export async function createGoogleSheet(accessToken: string, shifts: Shift[], report?: WeeklyReport): Promise<{ id: string; url: string; complete: boolean }> {
  if (report) return createWeeklyGoogleSheet(accessToken, report);
  const sorted = shifts.slice().sort((a, b) => a.start.localeCompare(b.start));
  const title = `RouteHours — ${new Date().toLocaleDateString("en-GB")}`;
  const sheet = await googleRequest("https://sheets.googleapis.com/v4/spreadsheets", accessToken, "POST", {
    properties: { title, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Copenhagen" },
    sheets: [{ properties: { title: "Hours", gridProperties: { frozenRowCount: 1 } } }],
  });
  const id: string = sheet.spreadsheetId;
  const tabId: number = sheet.sheets?.[0]?.properties?.sheetId ?? 0;
  const url: string = sheet.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${id}/edit`;
  const totalMinutes = sorted.reduce((sum, s) => sum + minutesBetween(s.start, s.end), 0);
  const rows = [
    ["Date", "Start", "End", "Minutes", "Decimal hours"],
    ...sorted.map(s => {
      const minutes = minutesBetween(s.start, s.end);
      return [localDateKey(s.start), new Date(s.start).toLocaleString("en-GB"), new Date(s.end).toLocaleString("en-GB"), minutes, Number((minutes / 60).toFixed(4))];
    }),
    ["TOTAL", "", "", totalMinutes, Number((totalMinutes / 60).toFixed(4))],
  ];
  try { await googleRequest(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/Hours!A1?valueInputOption=RAW`, accessToken, "PUT", { majorDimension: "ROWS", values: rows }); }
  catch { return { id, url, complete: false }; }
  try { await googleRequest(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}:batchUpdate`, accessToken, "POST", {
    requests: [
      { repeatCell: { range: { sheetId: tabId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { backgroundColor: { red: .1, green: .25, blue: .2 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } } } }, fields: "userEnteredFormat" } },
      { repeatCell: { range: { sheetId: tabId, startRowIndex: rows.length - 1, endRowIndex: rows.length }, cell: { userEnteredFormat: { backgroundColor: { red: .87, green: .96, blue: .9 }, textFormat: { bold: true } } }, fields: "userEnteredFormat" } },
      { autoResizeDimensions: { dimensions: { sheetId: tabId, dimension: "COLUMNS", startIndex: 0, endIndex: 5 } } },
    ],
  }); } catch { /* The hours are already in the sheet; formatting is optional. */ }
  return { id, url, complete: true };
}

async function createWeeklyGoogleSheet(accessToken: string, report: WeeklyReport) {
  const rows = reportRows(report);
  const totalIndex = 4 + report.rows.length;
  const remarksIndex = totalIndex + 3;
  const range = (row: number, start = 0, end = 9) => ({ sheetId: 0, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: start, endColumnIndex: end });
  const sheet = await googleRequest("https://sheets.googleapis.com/v4/spreadsheets", accessToken, "POST", {
    properties: { title: `RouteHours · ${report.title}${report.profile.name ? ` · ${report.profile.name}` : ""}`, timeZone: report.zone, locale: "da_DK" },
    sheets: [{ properties: { sheetId: 0, title: "Ugeseddel", gridProperties: { frozenRowCount: 4, rowCount: Math.max(100, rows.length), columnCount: 9, hideGridlines: true } },
      merges: [range(0), range(1, 1, 4), range(1, 5, 9), range(2), range(totalIndex, 0, 8), range(totalIndex + 1), range(remarksIndex), ...report.remarks.map((_, i) => range(remarksIndex + 1 + i, 2))],
      data: [{ startRow: 0, startColumn: 0,
        columnMetadata: [65, 110, 165, 105, 85, 85, 85, 130, 100].map(pixelSize => ({ pixelSize })),
        rowMetadata: rows.map((_, i) => ({ pixelSize: i === 0 ? 46 : i > remarksIndex ? Math.max(40, Math.ceil((report.remarks[i - remarksIndex - 1]?.text.length || 0) / 90) * 19) : 32 })),
        rowData: rows.map((row, i) => ({ values: Array.from({ length: 9 }, (_, j) => {
          const value = row[j] ?? "";
          const heading = i === 0 || i === 3 || i === remarksIndex;
          return {
            userEnteredValue: i === totalIndex && j === 8 ? { formulaValue: `=SUM(I5:I${totalIndex})` } : typeof value === "number" ? { numberValue: value } : { stringValue: value },
            userEnteredFormat: {
              wrapStrategy: "WRAP", verticalAlignment: "TOP",
              backgroundColor: heading ? { red: .10, green: .24, blue: .19 } : i === totalIndex ? { red: .87, green: .94, blue: .86 } : { red: .97, green: .98, blue: .96 },
              textFormat: { fontFamily: "Arial", fontSize: i === 0 ? 20 : 10, bold: heading || i === totalIndex, foregroundColor: heading ? { red: 1, green: 1, blue: 1 } : { red: .1, green: .2, blue: .15 } },
              ...(j === 8 && i >= 4 && i <= totalIndex ? { numberFormat: { type: "TIME", pattern: "[h]:mm" } } : {}),
            },
          };
        }) })),
      }],
    }],
  });
  return { id: sheet.spreadsheetId as string, url: (sheet.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${sheet.spreadsheetId}/edit`) as string, complete: true };
}

export async function shareGoogleSheet(accessToken: string, id: string, email: string, role: "reader" | "writer") {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/permissions?sendNotificationEmail=true`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ type: "user", role, emailAddress: email.trim() }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || `Google Drive could not share the Sheet (${response.status}). Check that the Drive API is enabled.`);
}
