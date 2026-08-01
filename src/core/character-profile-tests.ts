import { z } from "zod";
import { BridgeError } from "../i18n";

export type CharacterProfileCandidate = {
  id: string;
  encoding: string;
  codeTable: number;
};

export type CharacterProfileTestSet = {
  version: 1;
  name: string;
  candidates: CharacterProfileCandidate[];
};

const candidateSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
    encoding: z.string().trim().min(1).max(64),
    codeTable: z.number().int().min(0).max(255),
  })
  .strict();

const testSetSchema = z
  .object({
    version: z.literal(1),
    name: z.string().trim().min(1).max(120),
    candidates: z.array(candidateSchema).min(1).max(20),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = new Set<string>();
    for (const [index, candidate] of value.candidates.entries()) {
      if (ids.has(candidate.id))
        context.addIssue({
          code: "custom",
          path: ["candidates", index, "id"],
          message: "duplicate candidate id",
        });
      ids.add(candidate.id);
    }
  });

export const defaultCharacterProfileTestSet: CharacterProfileTestSet = {
  version: 1,
  name: "Spanish ESC/POS defaults",
  candidates: [
    { id: "CP437-T0", encoding: "CP437", codeTable: 0 },
    { id: "CP850-T2", encoding: "CP850", codeTable: 2 },
    { id: "CP860-T3", encoding: "CP860", codeTable: 3 },
    { id: "WIN1252-T16", encoding: "WINDOWS-1252", codeTable: 16 },
    { id: "CP858-T19", encoding: "CP858", codeTable: 19 },
    { id: "CP858-T2", encoding: "CP858", codeTable: 2 },
  ],
};

export const parseCharacterProfileTestSet = (
  value: unknown,
): CharacterProfileTestSet => {
  const parsed = testSetSchema.safeParse(value);
  if (!parsed.success)
    throw new BridgeError("invalid_character_profile_test_set");
  return {
    ...parsed.data,
    candidates: parsed.data.candidates.map((candidate) => ({
      ...candidate,
      encoding: candidate.encoding.toUpperCase(),
    })),
  };
};

export const validateCharacterProfileCandidate = (
  value: unknown,
  supportsEncoding: (encoding: string) => boolean,
): CharacterProfileCandidate => {
  const candidate = candidateSchema.safeParse(value);
  if (!candidate.success)
    throw new BridgeError("invalid_character_profile_test_set");
  const normalized = {
    ...candidate.data,
    encoding: candidate.data.encoding.toUpperCase(),
  };
  if (!supportsEncoding(normalized.encoding))
    throw new BridgeError("invalid_character_profile_test_set");
  return normalized;
};

export const validateCharacterProfileTestSet = (
  value: unknown,
  supportsEncoding: (encoding: string) => boolean,
) => {
  const testSet = parseCharacterProfileTestSet(value);
  return {
    ...testSet,
    candidates: testSet.candidates.map((candidate) =>
      validateCharacterProfileCandidate(candidate, supportsEncoding),
    ),
  };
};
