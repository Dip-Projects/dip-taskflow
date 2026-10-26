import { useEffect, useMemo, useState } from "react";
import {
  buildMergeMaps,
  mapSheetColorsForTheme,
  resolveSheetCellStyle,
} from "../lib/excelSheetPreview";

function readIsDarkTheme() {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute("data-theme") === "dark";
}

/**
 * Renders a workbook matrix with Excel merges / column widths.
 * Optional renderCell({ style, rowIdx, colIdx }) replaces the default text.
 */
export function ExcelSheetTable({ matrix = [], merges = [], colWidths = [], renderCell }) {
  const [isDark, setIsDark] = useState(readIsDarkTheme);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const root = document.documentElement;
    const sync = () => setIsDark(root.getAttribute("data-theme") === "dark");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const { mergeStarts, covered } = useMemo(() => buildMergeMaps(merges), [merges]);

  const rowCount = matrix.length;
  const colCount = useMemo(
    () => matrix.reduce((max, row) => Math.max(max, (row || []).length), 0),
    [matrix]
  );

  if (!rowCount || !colCount) return null;

  const cols = [];
  for (let c = 0; c < colCount; c += 1) {
    const width = Number(colWidths?.[c]) || 0;
    cols.push(
      <col key={c} style={width > 0 ? { width: `${width}px` } : undefined} />
    );
  }

  const rows = [];
  for (let r = 0; r < rowCount; r += 1) {
    const cells = [];
    for (let c = 0; c < colCount; c += 1) {
      if (covered.has(`${r}:${c}`)) continue;

      const style = resolveSheetCellStyle(matrix[r]?.[c], r, c);
      const themed = mapSheetColorsForTheme(style.bg, style.color, isDark);
      const span = mergeStarts.get(`${r}:${c}`);
      const widthHint = Number(colWidths?.[c]) || style.minWidth;

      const content =
        typeof renderCell === "function"
          ? renderCell({ style, rowIdx: r, colIdx: c })
          : style.display;

      cells.push(
        <td
          key={`${r}:${c}`}
          rowSpan={span?.rowSpan > 1 ? span.rowSpan : undefined}
          colSpan={span?.colSpan > 1 ? span.colSpan : undefined}
          style={{
            background: themed.bg,
            color: themed.color,
            border: `1px solid ${themed.border}`,
            fontWeight: style.bold || r <= 6 ? 700 : 400,
            textAlign: style.align,
            verticalAlign: "middle",
            padding: "6px 8px",
            whiteSpace: style.wrap ? "pre-wrap" : "nowrap",
            minWidth: `${widthHint}px`,
            lineHeight: 1.25,
          }}
        >
          {content}
        </td>
      );
    }
    rows.push(<tr key={r}>{cells}</tr>);
  }

  return (
    <table className="smt-excel-sheet">
      <colgroup>{cols}</colgroup>
      <tbody>{rows}</tbody>
    </table>
  );
}
