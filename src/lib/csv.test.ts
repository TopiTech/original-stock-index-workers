import { describe, expect, it } from "vitest";
import { escapeCsvCell } from "./csv";

describe("escapeCsvCell", () => {
  it.each(["=SUM(A1:A2)", "+CMD()", "-10", "@SUM(A1:A2)", " =1+1", "\t=1+1", "\uFEFF=1+1"])(
    "prevents spreadsheet formula evaluation for %s",
    (value) => {
      expect(escapeCsvCell(value)).toBe(`"'${value}"`);
    },
  );

  it("quotes ordinary text and escapes embedded quotes", () => {
    expect(escapeCsvCell('A "quoted" company')).toBe('"A ""quoted"" company"');
  });
});
