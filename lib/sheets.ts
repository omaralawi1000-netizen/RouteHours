import { localDateKey, minutesBetween, type Shift } from "./time.ts";
import { columnLetter, reportLayout, timeSerial, type WeeklyReport } from "./timesheet.ts";

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
  const layout = reportLayout(report);
  const { rows, totalIndex, remarksIndex, totalColumn } = layout;
  const columnCount = layout.headers.length;
  const totalLetter = columnLetter(totalColumn);
  const range = (row: number, start = 0, end = columnCount) => ({ sheetId: 0, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: start, endColumnIndex: end });
  const dateSerial = (date: string) => (Date.parse(`${date}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000;
  const sheet = await googleRequest("https://sheets.googleapis.com/v4/spreadsheets", accessToken, "POST", {
    properties: { title: `RouteHours · ${report.title}${report.profile.name ? ` · ${report.profile.name}` : ""}`, timeZone: report.zone, locale: "da_DK" },
    sheets: [{ properties: { sheetId: 0, title: "Ugeseddel", gridProperties: { frozenRowCount: 4, rowCount: Math.max(100, rows.length), columnCount, hideGridlines: true } },
      merges: [range(0), range(1, 1, 4), range(1, 5), range(2), range(totalIndex, 0, totalColumn), range(totalIndex + 1), ...(remarksIndex === null ? [] : [range(remarksIndex), ...layout.remarks.map((_, i) => range(remarksIndex + 1 + i, 2))])],
      data: [{ startRow: 0, startColumn: 0,
        columnMetadata: [65, 110, ...Array(layout.intervalCount * 2).fill(85), 65, 65, 65, 105, 95].map(pixelSize => ({ pixelSize })),
        rowMetadata: rows.map((_, i) => ({ pixelSize: i === 0 ? 48 : remarksIndex !== null && i > remarksIndex ? Math.max(40, Math.ceil((layout.remarks[i - remarksIndex - 1]?.text.length || 0) / 105) * 19) : 36 })),
        rowData: rows.map((row, i) => ({ values: Array.from({ length: columnCount }, (_, j) => {
          let value = row[j] ?? "";
          const daily = i >= 4 && i < totalIndex;
          const remark = remarksIndex !== null && i > remarksIndex ? layout.remarks[i - remarksIndex - 1] : null;
          if (j === 1 && (daily || remark)) value = dateSerial(daily ? layout.dailyRows[i - 4].date : remark!.date);
          const timeCell = daily && j >= 2 && j < 2 + layout.intervalCount * 2;
          if (timeCell && value) value = timeSerial(String(value));
          const heading = i === 0 || i === 3 || i === remarksIndex;
          return {
            userEnteredValue: i === totalIndex && j === totalColumn ? { formulaValue: `=SUM(${totalLetter}5:${totalLetter}${totalIndex})` } : typeof value === "number" ? { numberValue: value } : { stringValue: value },
            userEnteredFormat: {
              wrapStrategy: "WRAP", verticalAlignment: remark ? "TOP" : "MIDDLE",
              ...(daily && j >= 2 || i === 3 || i === totalIndex && j === totalColumn ? { horizontalAlignment: "CENTER" } : {}),
              backgroundColor: heading ? { red: .15, green: .20, blue: .29 } : i === totalIndex ? { red: .91, green: .93, blue: .98 } : daily && i % 2 === 0 ? { red: .96, green: .97, blue: .98 } : { red: 1, green: 1, blue: 1 },
              textFormat: { fontFamily: "Arial", fontSize: i === 0 ? 20 : i === totalIndex + 1 ? 9 : 10, bold: heading || i === totalIndex, foregroundColor: heading ? { red: 1, green: 1, blue: 1 } : { red: .14, green: .19, blue: .28 } },
              ...(j === totalColumn && i >= 4 && i <= totalIndex ? { numberFormat: { type: "TIME", pattern: "[h]:mm" } } : timeCell ? { numberFormat: { type: "TIME", pattern: "[hh]:mm" } } : j === 1 && (daily || remark) ? { numberFormat: { type: "DATE", pattern: "dd.mm.yyyy" } } : {}),
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
