/* eslint-disable @typescript-eslint/no-var-requires */
const iconv = require("iconv-lite") as {
  encode(value: string, encoding: string): Buffer;
};

export type NativeTableRow = {
  left: string;
  right: string;
  align?: "left" | "right";
};

/** Native code-page cells; never use the library's double-width Latin heuristic. */
export function nativeTableRowLines(
  row: NativeTableRow,
  columns: number,
  encoding: string,
): string[] {
  const normalize = (text: string) =>
    text
      .normalize("NFC")
      .replace(/\r/g, "")
      .replace(/[\u00a0\u202f\t]/g, " ");
  const measure = (text: string) => iconv.encode(text, encoding).length;
  const wrap = (text: string, width: number): string[] =>
    text.split("\n").flatMap((paragraph) => {
      const lines: string[] = [];
      let chars = Array.from(paragraph);
      while (measure(chars.join("")) > width) {
        let count = 0;
        let used = 0;
        while (count < chars.length && used + measure(chars[count]) <= width) {
          used += measure(chars[count++]);
        }
        // Retain an indivisible glyph even for pathological one-column inputs.
        count = Math.max(1, count);
        const space = chars.slice(0, count + 1).lastIndexOf(" ");
        const end = space > 0 ? space : count;
        lines.push(chars.slice(0, end).join(""));
        chars = chars.slice(end + (space > 0 ? 1 : 0));
      }
      return [...lines, chars.join("")];
    });
  const cell = (text: string, width: number, right: boolean) => {
    const padding = " ".repeat(Math.max(0, width - measure(text)));
    return right ? padding + text : text + padding;
  };
  const left = normalize(row.left);
  const right = normalize(row.right);
  const rightWidth = measure(right);
  // Never truncate oversized values; print them separately if two columns cannot fit.
  if (right.includes("\n") || rightWidth >= columns - 1) {
    return [
      ...(left
        ? wrap(left, columns).map((line) =>
            cell(line, columns, row.align === "right"),
          )
        : []),
      ...wrap(right, columns).map((line) => cell(line, columns, true)),
    ];
  }
  const leftWidth = columns - (right ? rightWidth + 1 : 0);
  return wrap(left, leftWidth).map((line, index) => {
    if (index > 0 || !right) return cell(line, columns, row.align === "right");
    return cell(line, leftWidth, row.align === "right") + " " + right;
  });
}
