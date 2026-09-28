import ExcelJS from "exceljs";
import { reportRows, type WeeklyReport } from "./timesheet.ts";

export async function createTimesheetFile(report: WeeklyReport): Promise<File> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RouteHours";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Ugeseddel", { views: [{ state: "frozen", ySplit: 4 }], pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  sheet.columns = [8, 14, 23, 14, 12, 12, 12, 18, 14].map(width => ({ width }));
  sheet.addRows(reportRows(report));
  const totalRow = 5 + report.rows.length;
  const remarksHeading = totalRow + 3;
  sheet.mergeCells("A1:I1");
  sheet.mergeCells("B2:D2"); sheet.mergeCells("F2:I2"); sheet.mergeCells("A3:I3");
  sheet.mergeCells(`A${totalRow}:H${totalRow}`);
  sheet.mergeCells(`A${totalRow + 1}:I${totalRow + 1}`);
  sheet.mergeCells(`A${remarksHeading}:I${remarksHeading}`);
  sheet.getCell(`I${totalRow}`).value = { formula: `SUM(I5:I${totalRow - 1})`, result: report.total / 1440 };
  sheet.getColumn(9).numFmt = "[h]:mm";
  sheet.eachRow((row, rowNumber) => {
    row.height = rowNumber === 1 ? 36 : 25;
    row.eachCell({ includeEmpty: true }, cell => {
      cell.font = { name: "Calibri", size: 11, color: { argb: "FF193D31" } };
      cell.alignment = { vertical: "middle", wrapText: true };
      if (rowNumber >= 5 && rowNumber < totalRow) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowNumber % 2 ? "FFF0F5EF" : "FFFFFFFF" } };
        cell.border = { bottom: { style: "hair", color: { argb: "FFD7E1D5" } } };
      }
    });
  });
  for (const n of [1, 4, remarksHeading]) {
    sheet.getRow(n).eachCell({ includeEmpty: true }, cell => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF193D31" } };
      cell.font = { name: "Calibri", size: n === 1 ? 20 : 11, bold: true, color: { argb: "FFFFFFFF" } };
    });
  }
  sheet.getRow(totalRow).font = { name: "Calibri", size: 12, bold: true };
  sheet.getRow(totalRow).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDFF0DB" } };
  for (let i = 0; i < 7; i++) {
    const n = remarksHeading + 1 + i;
    sheet.mergeCells(`C${n}:I${n}`);
    if (report.remarks[i].text.length > 1800 || report.remarks[i].text.split("\n").length > 24) {
      sheet.getCell(`C${n}`).value = report.remarks[i].text.slice(0, 1600) + "\n\nFortsættes i fanen Bemærkninger fulde.";
    }
    const lines = report.remarks[i].text.split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 105)), 0);
    sheet.getRow(n).height = Math.min(409, Math.max(30, lines * 15));
    sheet.getRow(n).alignment = { vertical: "top", wrapText: true };
  }
  // Long notes get a separate continuation sheet so Excel's row-height limit cannot hide them.
  if (report.remarks.some(r => r.text.length > 1800 || r.text.split("\n").length > 24)) {
    const notes = workbook.addWorksheet("Bemærkninger fulde");
    notes.columns = [{ width: 15 }, { width: 105 }];
    notes.addRow(["Dato", "Alle bemærkninger"]);
    for (const remark of report.remarks) for (const line of remark.text.split("\n")) {
      for (let i = 0; i < Math.max(1, line.length); i += 500) {
        const row = notes.addRow([remark.date, line.slice(i, i + 500)]);
        row.alignment = { vertical: "top", wrapText: true }; row.height = Math.max(20, Math.ceil(line.slice(i, i + 500).length / 100) * 16);
      }
    }
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new File([new Uint8Array(buffer)], `RouteHours-${report.monday}.xlsx`, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
