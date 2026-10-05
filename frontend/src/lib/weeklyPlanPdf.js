/**
 * Extract a weekly-plan style table matrix from a PDF, then reuse Excel parser.
 * Kept intentionally light so the Weekly Plan page stays responsive.
 */
import { parseWeeklyPlanMatrix, parseDateFromText } from "./weeklyPlanExcel";

const MAX_TEXT_ITEMS = 4000;

async function loadPdfjs() {
  const [pdfjs, workerUrl] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default;
  }
  return pdfjs;
}

function clusterBy(values, tolerance) {
  if (!values.length) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const groups = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i += 1) {
    const v = sorted[i];
    const g = groups[groups.length - 1];
    if (Math.abs(v - g[g.length - 1]) <= tolerance) g.push(v);
    else groups.push([v]);
  }
  return groups.map((g) => g.reduce((a, b) => a + b, 0) / g.length);
}

function nearestIndex(centers, value) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < centers.length; i += 1) {
    const d = Math.abs(centers[i] - value);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function countDateHits(matrix) {
  let best = 0;
  for (let r = 0; r < Math.min(matrix.length, 25); r += 1) {
    let n = 0;
    const row = matrix[r] || [];
    for (let c = 0; c < row.length; c += 1) {
      if (parseDateFromText(row[c])) n += 1;
    }
    if (n > best) best = n;
  }
  return best;
}

function buildMatrixFromItems(items, xTolerance) {
  const yCenters = clusterBy(
    items.map((i) => i.y),
    5
  ).slice(0, 80);
  const xCenters = clusterBy(
    items.map((i) => i.x),
    xTolerance
  ).slice(0, 40);
  if (!yCenters.length || !xCenters.length) return [];

  const rowBuckets = yCenters.map(() => xCenters.map(() => []));
  items.forEach((item) => {
    const r = nearestIndex(yCenters, item.y);
    const c = nearestIndex(xCenters, item.x);
    rowBuckets[r][c].push(item);
  });
  return rowBuckets.map((cols) =>
    cols.map((cellItems) => {
      if (!cellItems.length) return "";
      cellItems.sort((a, b) => a.x - b.x || a.y - b.y);
      return cellItems
        .map((i) => i.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    })
  );
}

function buildMatrixAnchoredByDates(items) {
  const yCenters = clusterBy(
    items.map((i) => i.y),
    5
  ).slice(0, 80);
  let bestDates = [];

  for (let ri = 0; ri < yCenters.length; ri += 1) {
    const yc = yCenters[ri];
    const rowItems = items.filter((it) => Math.abs(it.y - yc) <= 6);
    if (rowItems.length > 200) continue;
    const xCenters = clusterBy(
      rowItems.map((i) => i.x),
      12
    ).slice(0, 40);
    const cells = xCenters.map(() => []);
    rowItems.forEach((it) => {
      cells[nearestIndex(xCenters, it.x)].push(it);
    });
    const dates = [];
    cells.forEach((arr, ci) => {
      arr.sort((a, b) => a.x - b.x);
      const text = arr
        .map((i) => i.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      const ymd = parseDateFromText(text);
      if (ymd) dates.push({ ymd, x: xCenters[ci] });
    });
    if (dates.length > bestDates.length) bestDates = dates;
    if (bestDates.length >= 7) break;
  }

  if (bestDates.length < 2) return null;

  const anchors = [];
  for (let i = 0; i < bestDates.length; i += 1) {
    const cur = bestDates[i];
    const next = bestDates[i + 1];
    anchors.push(cur.x);
    if (next) {
      const mid = cur.x + (next.x - cur.x) * 0.45;
      if (mid - cur.x > 8) anchors.push(mid);
    } else {
      anchors.push(cur.x + 40);
    }
  }

  const leftXs = items.map((i) => i.x).filter((x) => x < bestDates[0].x - 10);
  const leftCenters = clusterBy(leftXs, 14).slice(0, 3);
  const xCenters = [...leftCenters, ...anchors].sort((a, b) => a - b).slice(0, 40);

  const rowBuckets = yCenters.map(() => xCenters.map(() => []));
  items.forEach((item) => {
    const r = nearestIndex(yCenters, item.y);
    const c = nearestIndex(xCenters, item.x);
    rowBuckets[r][c].push(item);
  });

  return rowBuckets.map((cols) =>
    cols.map((cellItems) => {
      if (!cellItems.length) return "";
      cellItems.sort((a, b) => a.x - b.x || a.y - b.y);
      return cellItems
        .map((i) => i.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    })
  );
}

async function pdfBufferToMatrix(arrayBuffer) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const items = [];
  const pageLimit = Math.min(doc.numPages || 1, 3);

  for (let pageNum = 1; pageNum <= pageLimit; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    for (const item of content.items || []) {
      if (items.length >= MAX_TEXT_ITEMS) break;
      const str = String(item.str || "").replace(/\s+/g, " ").trim();
      if (!str) continue;
      const tx = item.transform || [1, 0, 0, 1, 0, 0];
      const x = Number(tx[4]) || 0;
      const y = viewport.height - (Number(tx[5]) || 0) + (pageNum - 1) * (viewport.height + 40);
      items.push({ str, x, y, page: pageNum });
    }
    if (items.length >= MAX_TEXT_ITEMS) break;
  }

  if (!items.length) return [];

  const candidates = [];
  const anchored = buildMatrixAnchoredByDates(items);
  if (anchored) candidates.push({ matrix: anchored, score: countDateHits(anchored) });

  [8, 12, 16, 20, 24, 30].forEach((tol) => {
    const matrix = buildMatrixFromItems(items, tol);
    if (matrix?.length) candidates.push({ matrix, score: countDateHits(matrix) });
  });

  let best = null;
  for (const candidate of candidates) {
    const parsed = parseWeeklyPlanMatrix(candidate.matrix);
    if (parsed?.tasks?.length) {
      return candidate.matrix;
    }
    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }

  return best ? best.matrix : [];
}

export async function parseWeeklyPlanPdfBuffer(arrayBuffer) {
  try {
    const matrix = await pdfBufferToMatrix(arrayBuffer);
    if (!matrix.length) return { tasks: [], meta: { error: "empty_pdf" }, matrix: [] };
    const parsed = parseWeeklyPlanMatrix(matrix);
    return {
      ...parsed,
      meta: { ...parsed.meta, via: "pdf", dateHits: countDateHits(matrix) },
    };
  } catch (err) {
    return { tasks: [], meta: { error: err.message || "pdf_parse_failed" }, matrix: [] };
  }
}

export async function parseWeeklyPlanPdfFile(file) {
  if (!file) return { tasks: [], meta: { error: "no_file" } };
  const buffer = await file.arrayBuffer();
  return parseWeeklyPlanPdfBuffer(buffer);
}
