import { localDateKey, minutesBetween, type Shift } from "./time";

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

export async function createGoogleSheet(accessToken: string, shifts: Shift[]): Promise<{ url: string; complete: boolean }> {
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
  catch { return { url, complete: false }; }
  try { await googleRequest(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}:batchUpdate`, accessToken, "POST", {
    requests: [
      { repeatCell: { range: { sheetId: tabId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { backgroundColor: { red: .1, green: .25, blue: .2 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } } } }, fields: "userEnteredFormat" } },
      { repeatCell: { range: { sheetId: tabId, startRowIndex: rows.length - 1, endRowIndex: rows.length }, cell: { userEnteredFormat: { backgroundColor: { red: .87, green: .96, blue: .9 }, textFormat: { bold: true } } }, fields: "userEnteredFormat" } },
      { autoResizeDimensions: { dimensions: { sheetId: tabId, dimension: "COLUMNS", startIndex: 0, endIndex: 5 } } },
    ],
  }); } catch { /* The hours are already in the sheet; formatting is optional. */ }
  return { url, complete: true };
}
