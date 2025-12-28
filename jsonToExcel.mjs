import ExcelJS from "exceljs";
import fs from "fs";

export async function jsonToExcel({
  jsonPath,
  xlsxPath,
  sheetName = "Tenders",
  columns,                 // [{ header, key, width?, align? }]
  centerColumnKeys = [],   // e.g. ["bidValue", "publishDate"]
  minWidth = 12,
  maxWidth = 45,
  padding = 2,
}) {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(sheetName);

  const raw = fs.readFileSync(jsonPath, "utf8");
  const rows = JSON.parse(raw);

  // 1) Set columns (order + headers)
  ws.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width || 15, // temporary; we will overwrite with auto width below
    style: {
      alignment: {
        horizontal: c.align || "left",
        vertical: "middle",
        wrapText: true,
      },
    },
  }));

  // 2) Header styling
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { horizontal: "center", vertical: "middle" };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  // 3) Add rows
  for (const r of rows) ws.addRow(r);

  // 4) Apply selective centering by column key (non-breaking)
  ws.columns.forEach((col) => {
    if (centerColumnKeys.includes(col.key)) {
      col.alignment = { horizontal: "center", vertical: "middle" };
    } else {
      col.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    }
  });

  // 5) ✅ Auto-width logic: width = max(header length, any cell text length) + padding
  ws.columns.forEach((col, i) => {
    const headerText = String(col.header ?? "");
    let maxLen = headerText.length;

    // ExcelJS column includes empty cells; measure only what exists
    col.eachCell({ includeEmpty: false }, (cell) => {
      let text = "";

      // Handle rich types (Hyperlink, Formula, etc.) safely
      if (cell.value == null) {
        text = "";
      } else if (typeof cell.value === "string" || typeof cell.value === "number" || typeof cell.value === "boolean") {
        text = String(cell.value);
      } else if (cell.value instanceof Date) {
        text = cell.value.toISOString();
      } else if (typeof cell.value === "object") {
        // ExcelJS sometimes stores objects like { text, hyperlink } etc.
        if (cell.value.text) text = String(cell.value.text);
        else text = String(cell.value);
      } else {
        text = String(cell.value);
      }

      // For wrapped/multi-line content, use longest line
      const longestLine = text
        .split("\n")
        .reduce((m, line) => Math.max(m, line.length), 0);

      maxLen = Math.max(maxLen, longestLine);
    });

    // Add padding and clamp
    const finalWidth = Math.min(Math.max(maxLen + padding, minWidth), maxWidth);
    ws.getColumn(i + 1).width = finalWidth;
  });

  await workbook.xlsx.writeFile(xlsxPath);
  console.log(`✅ Excel created: ${xlsxPath}`);
}