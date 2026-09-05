import { z } from "zod";

export const PrintScaleSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(8),
]);

export const PrintTextFontSchema = z.enum([
  "standard",
  "compact",
  "compact-tall",
]);

export const PrintTextStyleSchema = z.object({
  font: PrintTextFontSchema.optional(),
  width: PrintScaleSchema.optional(),
  height: PrintScaleSchema.optional(),
});

export const PrintJobBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("image"),
    url: z.string(),
    maxWidth: z.number().optional(),
    maxHeight: z.number().optional(),
  }),
  z
    .object({
      type: z.literal("text"),
      content: z.string(),
      align: z.enum(["left", "center", "right"]).optional(),
      bold: z.boolean().optional(),
      ...PrintTextStyleSchema.shape,
      underline: z.boolean().optional(),
    })
    .strict(),
  z.object({
    type: z.literal("table-row"),
    left: z.string(),
    right: z.string(),
    bold: z.boolean().optional(),
    align: z.enum(["left", "right"]).optional(),
  }),
  z.object({
    type: z.literal("separator"),
    style: z.enum(["solid", "dotted"]).optional(),
  }),
  z.object({ type: z.literal("feed"), lines: z.number().optional() }),
  z.object({
    type: z.literal("qr"),
    content: z.string(),
    size: PrintScaleSchema.optional(),
  }),
  z.object({
    type: z.literal("barcode"),
    content: z.string(),
    format: z.enum(["CODE128", "EAN13"]).optional(),
  }),
  z.object({ type: z.literal("cut"), partial: z.boolean().optional() }),
  z.object({ type: z.literal("open-drawer") }),
]);

export const PrintJobV1Schema = z.object({
  version: z.literal(1),
  widthMm: z.union([z.literal(58), z.literal(80)]).optional(),
  reason: z.string().optional(),
  jobId: z.string().optional(),
  blocks: z.array(PrintJobBlockSchema),
});

export const PrintRequestSchema = z.object({
  printerId: z.string().min(1),
  job: PrintJobV1Schema,
});

export type PrintScale = z.infer<typeof PrintScaleSchema>;
export type PrintTextFont = z.infer<typeof PrintTextFontSchema>;
export type PrintTextStyle = z.infer<typeof PrintTextStyleSchema>;
export type PrintJobBlock = z.infer<typeof PrintJobBlockSchema>;
export type PrintJobV1 = z.infer<typeof PrintJobV1Schema>;
export type PrintRequest = z.infer<typeof PrintRequestSchema>;
