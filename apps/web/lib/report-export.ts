/**
 * Report Export Utilities
 *
 * Provides PDF and Excel export functionality for all report dashboards.
 * Uses jsPDF for PDF generation and xlsx for Excel export.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const jsPDF = require("jspdf").default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const autoTable = require("jspdf-autotable").default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require("xlsx");

// Format currency for export
function formatCurrencyForExport(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

// Format date for display
function formatDateForExport(dateStr: string | null | undefined): string {
  if (!dateStr) return "All Time";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export interface ReportExportConfig {
  title: string;
  filename: string;
  subtitle?: string;
  dateRange?: {
    from: string;
    to: string;
  };
  columns: {
    header: string;
    key: string;
    type?: "text" | "number" | "currency";
    width?: number;
    align?: "left" | "center" | "right";
  }[];
  data: Record<string, unknown>[];
  summary?: Record<string, string | number>;
  companyName?: string;
}

/**
 * Export report to PDF
 */
export function exportToPDF(config: ReportExportConfig): void {
  const {
    title,
    filename,
    subtitle,
    dateRange,
    columns,
    data,
    summary,
    companyName = "Quake Inventory System",
  } = config;

  // Create PDF document (A4 size)
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let yPos = margin;

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(40, 40, 40);
  doc.text(companyName, pageWidth / 2, yPos, { align: "center" });
  yPos += 10;

  // Report Title
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(60, 60, 60);
  doc.text(title, pageWidth / 2, yPos, { align: "center" });
  yPos += 7;

  // Subtitle / Date Range
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  const dateRangeText = dateRange
    ? `Period: ${formatDateForExport(dateRange.from)} to ${formatDateForExport(dateRange.to)}`
    : "Period: All Time";
  doc.text(dateRangeText, pageWidth / 2, yPos, { align: "center" });
  yPos += 5;

  if (subtitle) {
    doc.text(subtitle, pageWidth / 2, yPos, { align: "center" });
    yPos += 5;
  }

  // Generated timestamp
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  const generatedText = `Generated on: ${new Date().toLocaleString("en-IN")}`;
  doc.text(generatedText, pageWidth / 2, yPos, { align: "center" });
  yPos += 10;

  // Summary Section (if provided)
  if (summary && Object.keys(summary).length > 0) {
    const summaryEntries = Object.entries(summary);
    const boxHeight = Math.ceil(summaryEntries.length / 4) * 12 + 12;
    doc.setFillColor(248, 249, 250);
    doc.roundedRect(margin, yPos, pageWidth - margin * 2, boxHeight, 3, 3, "F");

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 60, 60);
    doc.text("Summary", margin + 5, yPos + 6);

    const summaryColWidth =
      (pageWidth - margin * 2 - 10) / Math.min(4, summaryEntries.length);
    summaryEntries.forEach((entry, index) => {
      const row = Math.floor(index / 4);
      const col = index % 4;
      const xPos = margin + 5 + col * summaryColWidth;
      const yOffset = row * 12;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text(entry[0], xPos, yPos + 13 + yOffset);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(40, 40, 40);
      doc.text(String(entry[1]), xPos, yPos + 20 + yOffset);
    });

    yPos += boxHeight + 7;
  }

  // Table Data
  const tableColumns = columns.map((col) => ({
    header: col.header,
    dataKey: col.key,
  }));

  const tableData = data.map((row) => {
    const formattedRow: Record<string, string> = {};
    columns.forEach((col) => {
      const value = row[col.key];
      if (col.type === "currency" && value !== undefined) {
        formattedRow[col.key] = formatCurrencyForExport(
          value as number | string,
        );
      } else if (col.type === "number" && value !== undefined) {
        formattedRow[col.key] = Number(value).toLocaleString("en-IN");
      } else {
        formattedRow[col.key] = String(value ?? "-");
      }
    });
    return formattedRow;
  });

  autoTable(doc, {
    startY: yPos,
    head: [tableColumns.map((col) => col.header)],
    body: tableData.map((row) => tableColumns.map((col) => row[col.dataKey])),
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 9,
      cellPadding: 3,
      lineColor: [220, 220, 220],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [198, 161, 91], // Gold color
      textColor: [0, 0, 0],
      fontStyle: "bold",
      fontSize: 9,
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    columnStyles: columns.reduce(
      (acc, col, index) => {
        if (col.type === "currency" || col.type === "number") {
          acc[index] = { halign: "right" };
        }
        return acc;
      },
      {} as Record<number, { halign: "right" | "left" | "center" }>,
    ),
  });

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" },
    );
    doc.text(
      "Confidential - For Internal Use Only",
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 5,
      { align: "center" },
    );
  }

  // Save PDF
  const safeFilename = filename.replace(/[^a-zA-Z0-9-_]/g, "_");
  doc.save(`${safeFilename}.pdf`);
}

/**
 * Export report to Excel
 */
export function exportToExcel(config: ReportExportConfig): void {
  const {
    title,
    filename,
    dateRange,
    columns,
    data,
    summary,
    companyName = "Quake Inventory System",
  } = config;

  // Create workbook
  const wb = XLSX.utils.book_new();

  // Prepare header rows
  const dateRangeText = dateRange
    ? `Period: ${formatDateForExport(dateRange.from)} to ${formatDateForExport(dateRange.to)}`
    : "Period: All Time";

  const headerRows: (string | number)[][] = [
    [companyName],
    [title],
    [dateRangeText],
    [`Generated on: ${new Date().toLocaleString("en-IN")}`],
    [], // Empty row
  ];

  // Add summary if provided
  if (summary && Object.keys(summary).length > 0) {
    headerRows.push(["Summary"]);
    Object.entries(summary).forEach((entry) => {
      headerRows.push([entry[0], String(entry[1])]);
    });
    headerRows.push([]); // Empty row
  }

  // Add column headers
  headerRows.push(columns.map((col) => col.header));

  // Prepare data rows
  const dataRows = data.map((row) => {
    return columns.map((col) => {
      const value = row[col.key];
      if (col.type === "currency" && value !== undefined) {
        return parseFloat(String(value));
      } else if (col.type === "number" && value !== undefined) {
        return Number(value);
      }
      return value ?? "";
    });
  });

  // Combine all rows
  const allRows = [...headerRows, ...dataRows];

  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(allRows);

  // Set column widths
  const colWidths = columns.map((col) => ({
    wch: col.width || Math.max(col.header.length, 15),
  }));
  ws["!cols"] = colWidths;

  // Style header cells (merge for title)
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: columns.length - 1 } }, // Company name
    { s: { r: 1, c: 0 }, e: { r: 1, c: columns.length - 1 } }, // Title
    { s: { r: 2, c: 0 }, e: { r: 2, c: columns.length - 1 } }, // Date range
    { s: { r: 3, c: 0 }, e: { r: 3, c: columns.length - 1 } }, // Generated on
  ];

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, "Report");

  // Save Excel file
  const safeFilename = filename.replace(/[^a-zA-Z0-9-_]/g, "_");
  XLSX.writeFile(wb, `${safeFilename}.xlsx`);
}

// Export button component props
export interface ExportButtonsProps {
  config: ReportExportConfig;
  disabled?: boolean;
}
