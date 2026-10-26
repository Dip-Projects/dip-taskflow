import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMergeMaps,
  matrixFromPlainRows,
  omitStatusHeaderColumns,
  resolveSheetCellStyle,
  sheetHasContent,
} from "./excelSheetPreview.js";

test("keeps merged Excel cells as a single display cell", () => {
  const { mergeStarts, covered } = buildMergeMaps([
    { r1: 0, c1: 2, r2: 0, c2: 3 },
    { r1: 1, c1: 0, r2: 2, c2: 0 },
  ]);

  assert.deepEqual(mergeStarts.get("0:2"), { rowSpan: 1, colSpan: 2 });
  assert.equal(covered.has("0:3"), true);
  assert.equal(covered.has("0:2"), false);
  assert.equal(covered.has("2:0"), true);
});

test("plain Excel rows keep the uploaded cell text instead of a rebuilt task grid", () => {
  const sheet = matrixFromPlainRows([
    ["SR NO", "SITE NAME", "07 Sep 2026", "", "08 Sep 2026"],
    ["", "", "1st half", "2nd half", "1st half"],
    ["1", "TO STUDY / FOLLOW UP", "SITE INSPECTION", "MEETING", "BARCUTTING"],
  ]);

  assert.equal(sheetHasContent(sheet), true);
  assert.equal(sheet.matrix[0][2].display, "07 Sep 2026");
  assert.equal(sheet.matrix[2][2].display, "SITE INSPECTION");
  assert.equal(sheet.matrix[2][3].display, "MEETING");
  assert.equal(resolveSheetCellStyle(sheet.matrix[2][1], 2, 1).display, "TO STUDY / FOLLOW UP");
});

test("hides WORK STATUS columns and keeps time/plan columns", () => {
  const sheet = matrixFromPlainRows([
    ["SR NO", "SITE NAME", "10-Sep-2026", "", "11-Sep-2026", ""],
    ["", "", "THURSDAY", "", "FRIDAY", ""],
    ["", "", "9-00 AM TO 7-30 PM", "WORK STATUS", "9-00 AM TO 7-30 PM", "WORK STATUS"],
    ["1", "TO CALL", "SITE CHECK", "PENDING", "REBAR", "COMPLETED"],
  ]);
  sheet.merges = [
    { r1: 0, c1: 2, r2: 0, c2: 3 },
    { r1: 0, c1: 4, r2: 0, c2: 5 },
  ];

  const cleaned = omitStatusHeaderColumns(sheet);
  assert.equal(cleaned.matrix[0].length, 4);
  assert.equal(cleaned.matrix[2][2].display, "9-00 AM TO 7-30 PM");
  assert.equal(cleaned.matrix[2][3].display, "9-00 AM TO 7-30 PM");
  assert.equal(
    cleaned.matrix.some((row) => row.some((cell) => /status/i.test(cell.display))),
    false
  );
  assert.equal(cleaned.matrix[3][2].display, "SITE CHECK");
  assert.equal(cleaned.matrix[3][3].display, "REBAR");
  assert.deepEqual(cleaned.merges[0], { r1: 0, c1: 2, r2: 0, c2: 2 });
  assert.deepEqual(cleaned.merges[1], { r1: 0, c1: 3, r2: 0, c2: 3 });
});

test("hides WORK UPDATE and UPDATES WRITTEN columns", () => {
  const sheet = matrixFromPlainRows([
    ["SR NO", "SITE NAME", "DAYS PLANNING", "WORK UPDATE", "UPDATES WRITTEN"],
    ["1", "TO CALL", "SITE CHECK", "COMPLETED", "DONE"],
  ]);

  const cleaned = omitStatusHeaderColumns(sheet);
  assert.deepEqual(cleaned.matrix[0].map((cell) => cell.display), ["SR NO", "SITE NAME", "DAYS PLANNING"]);
  assert.deepEqual(cleaned.matrix[1].map((cell) => cell.display), ["1", "TO CALL", "SITE CHECK"]);
});
