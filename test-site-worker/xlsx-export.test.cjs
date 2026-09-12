"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildWorkbook } = require("../test-site/xlsx-export.js");

test("buildWorkbook creates a valid multi-sheet XLSX package", () => {
  const bytes = buildWorkbook([
    { name: "Households", rows: [["ID", "Name"], ["CCC-1", "Sample Family"]] },
    { name: "Children", rows: [["Child ID", "Age"], ["CH-1", 9]] }
  ]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const packageText = new TextDecoder().decode(bytes);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);
  assert.match(packageText, /\[Content_Types\]\.xml/);
  assert.match(packageText, /xl\/worksheets\/sheet2\.xml/);
  assert.match(packageText, /Sample Family/);
  assert.match(packageText, /name="Households"/);
});
