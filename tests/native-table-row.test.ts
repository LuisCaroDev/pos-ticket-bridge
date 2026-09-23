/* eslint-disable @typescript-eslint/no-var-requires */
import { describe, expect, it } from "vitest";
import { nativeTableRowLines } from "../src/core/native-table-row";
const iconv = require("iconv-lite");
const { Printer } = require("@node-escpos/core");

describe("native receipt rows", () => {
  for (const encoding of ["CP850", "CP858"]) {
    for (const columns of [32, 48]) {
      it(`aligns actual encoded amounts in ${encoding}, ${columns} columns`, () => {
        for (const left of [
          "1x Combo futbolero",
          "1x Sopa de Patacón · Personal",
          "1x Torta de Chocolate · Personal",
          "1x Pizza Tropical · ½ Pizza Tropical (Grande) / ½ Pizza Queso y Bocadillo (Grande)",
        ]) {
          const lines = nativeTableRowLines(
            { left, right: "$\u00a010.000" },
            columns,
            encoding,
          );
          const printer = new Printer({}, { encoding, width: columns });
          lines.forEach((line) => printer.text(line));
          const bytes = printer.buffer.flush();
          const printed = iconv
            .decode(bytes, encoding)
            .split("\n")
            .filter(Boolean);
          expect(printed[0].endsWith("$ 10.000")).toBe(true);
          expect(
            printed.every(
              (line: string) => iconv.encode(line, encoding).length === columns,
            ),
          ).toBe(true);
          expect(printed.join("\n").match(/\$ 10\.000/g)).toHaveLength(1);
          const name = printed
            .map((line: string, i: number) =>
              (i === 0 ? line.slice(0, -8) : line).trim(),
            )
            .join(" ");
          expect(name).toBe(left);
        }
      });
    }
  }
  it("keeps Personal intact when the name fits beside the price", () => {
    expect(
      nativeTableRowLines(
        { left: "1x Torta de Chocolate · Personal", right: "$ 3.000" },
        48,
        "CP850",
      ),
    ).toEqual(["1x Torta de Chocolate · Personal" + " ".repeat(9) + "$ 3.000"]);
  });
  it("preserves long unbroken labels, explicit lines and oversized values", () => {
    const word = "X".repeat(70);
    const lines = nativeTableRowLines({ left: word, right: "10" }, 32, "CP850");
    expect(
      lines.map((line, i) => (i ? line : line.slice(0, -2)).trim()).join(""),
    ).toBe(word);
    expect(
      nativeTableRowLines({ left: "Uno\nDos", right: "" }, 32, "CP850").map(
        (line) => line.trim(),
      ),
    ).toEqual(["Uno", "Dos"]);
    const huge = "9".repeat(40);
    expect(
      nativeTableRowLines({ left: "Total", right: huge }, 32, "CP850")
        .map((line) => line.trim())
        .join(""),
    ).toBe("Total" + huge);
  });
  it("preserves right-only rows and composed Spanish accents", () => {
    expect(
      nativeTableRowLines({ left: "", right: "100" }, 32, "CP850"),
    ).toEqual([" ".repeat(29) + "100"]);
    expect(
      nativeTableRowLines({ left: "Cafe\u0301", right: "" }, 32, "CP850")[0],
    ).toBe("Café" + " ".repeat(28));
  });
});
