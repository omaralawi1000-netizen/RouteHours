import ExcelJS from "exceljs";
import { columnLetter, reportLayout, timeSerial, type WeeklyReport } from "./timesheet.ts";

export async function createTimesheetFile(report: WeeklyReport): Promise<File> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RouteHours";
  workbook.created = new Date();
  const layout = reportLayout(report);
  const last = columnLetter(layout.totalColumn);
  const totalRow = layout.totalIndex + 1;
  const remarksHeading = layout.remarksIndex === null ? null : layout.remarksIndex + 1;
  const hasLongRemarks = layout.remarks.some(row => row.text.length > 1800 || row.text.split("\n").length > 24);
  const sheet = workbook.addWorksheet("Ugeseddel", {
    views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: layout.remarks.length ? 0 : 1, printArea: `A1:${last}${layout.rows.length}`, printTitlesRow: "1:4" },
  });
  sheet.columns = [8, 14, ...Array(layout.intervalCount * 2).fill(11), 9, 9, 9, 14, 12].map(width => ({ width }));
  sheet.addRows(layout.rows.map(row => row.map(value => value === "" ? null : value)));
  sheet.mergeCells(`A1:${last}1`);
  sheet.mergeCells("B2:D2"); sheet.mergeCells(`F2:${last}2`); sheet.mergeCells(`A3:${last}3`);
  sheet.mergeCells(`A${totalRow}:${columnLetter(layout.totalColumn - 1)}${totalRow}`);
  sheet.mergeCells(`A${totalRow + 1}:${last}${totalRow + 1}`);
  if (remarksHeading) sheet.mergeCells(`A${remarksHeading}:${last}${remarksHeading}`);
  sheet.getCell(`${last}${totalRow}`).value = { formula: `SUM(${last}5:${last}${totalRow - 1})`, result: report.total / 1440 };
  for (let i = 0; i < layout.dailyRows.length; i++) {
    const rowNumber = i + 5;
    sheet.getCell(`B${rowNumber}`).value = new Date(`${layout.dailyRows[i].date}T00:00:00Z`);
    sheet.getCell(`B${rowNumber}`).numFmt = "dd.mm.yyyy";
    for (let j = 0; j < layout.intervalCount * 2; j++) {
      const cell = sheet.getCell(rowNumber, j + 3);
      if (cell.value) cell.value = timeSerial(String(cell.value));
      cell.numFmt = "[hh]:mm";
    }
    sheet.getCell(rowNumber, layout.totalColumn + 1).numFmt = "[h]:mm";
  }
  sheet.getCell(`${last}${totalRow}`).numFmt = "[h]:mm";
  sheet.eachRow((row, rowNumber) => {
    row.height = rowNumber === 1 ? 38 : rowNumber === 3 ? 24 : rowNumber === totalRow + 1 ? 26 : 32;
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      cell.font = { name: "Calibri", size: 11, color: { argb: "FF243047" } };
      cell.alignment = { vertical: "middle", wrapText: true };
      if (rowNumber >= 5 && rowNumber < totalRow) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowNumber % 2 ? "FFF4F6FA" : "FFFFFFFF" } };
        cell.border = { bottom: { style: "hair", color: { argb: "FFE2E7EF" } } };
        if (column >= 3) cell.alignment = { ...cell.alignment, horizontal: "center" };
      }
    });
  });
  for (const n of [1, 4, ...(remarksHeading ? [remarksHeading] : [])]) {
    sheet.getRow(n).eachCell({ includeEmpty: true }, cell => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF26334A" } };
      cell.font = { name: "Calibri", size: n === 1 ? 20 : 11, bold: true, color: { argb: "FFFFFFFF" } };
      if (n === 4) cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });
  }
  sheet.getRow(3).eachCell({ includeEmpty: true }, cell => { cell.font = { name: "Calibri", size: 10, color: { argb: "FF667389" } }; });
  sheet.getRow(totalRow).eachCell({ includeEmpty: true }, cell => {
    cell.font = { name: "Calibri", size: 12, bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EDF9" } };
  });
  sheet.getCell(`${last}${totalRow}`).alignment = { vertical: "middle", horizontal: "center" };
  sheet.getRow(totalRow + 1).eachCell({ includeEmpty: true }, cell => { cell.font = { name: "Calibri", size: 9, color: { argb: "FF667389" } }; });
  for (let i = 0; remarksHeading && i < layout.remarks.length; i++) {
    const n = remarksHeading + 1 + i;
    const remark = layout.remarks[i];
    sheet.mergeCells(`C${n}:${last}${n}`);
    sheet.getCell(`B${n}`).value = new Date(`${remark.date}T00:00:00Z`);
    sheet.getCell(`B${n}`).numFmt = "dd.mm.yyyy";
    if (remark.text.length > 1800 || remark.text.split("\n").length > 24) {
      sheet.getCell(`C${n}`).value = remark.text.slice(0, 1600) + "\n\nFortsættes i fanen Bemærkninger fulde.";
    }
    const lines = remark.text.split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 105)), 0);
    sheet.getRow(n).height = Math.min(409, Math.max(30, lines * 15));
    sheet.getRow(n).alignment = { vertical: "top", wrapText: true };
  }
  // Long notes get a separate continuation sheet so Excel's row-height limit cannot hide them.
  if (hasLongRemarks) {
    const notes = workbook.addWorksheet("Bemærkninger fulde");
    notes.columns = [{ width: 15 }, { width: 105 }];
    notes.addRow(["Dato", "Alle bemærkninger"]);
    for (const remark of layout.remarks) for (const line of remark.text.split("\n")) {
      for (let i = 0; i < Math.max(1, line.length); i += 500) {
        const row = notes.addRow([remark.date, line.slice(i, i + 500)]);
        row.alignment = { vertical: "top", wrapText: true }; row.height = Math.max(20, Math.ceil(line.slice(i, i + 500).length / 100) * 16);
      }
    }
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new File([new Uint8Array(buffer)], `RouteHours-${report.monday}.xlsx`, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
