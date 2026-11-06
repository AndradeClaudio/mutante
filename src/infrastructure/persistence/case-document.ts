import {
  annulledCase,
  correctCode,
  plantedBug,
  type AnswerKey,
  type DefectCategory,
} from "../../domain/answer-key.js";
import { createTestCase, type CaseOrigin, type TestCase } from "../../domain/test-case.js";

/** JSON shape of a test case (clues become text, since RegExp does not serialize). */
export interface CaseDocument {
  id: string;
  language: string;
  code: string;
  origin: CaseOrigin;
  answerKey:
    | { kind: "correct-code" }
    | { kind: "annulled"; reason: string }
    | { kind: "planted-bug"; category: DefectCategory; description: string; clues: string[] };
}

export function caseToDocument(testCase: TestCase): CaseDocument {
  return {
    id: testCase.id,
    language: testCase.language,
    code: testCase.code.text,
    origin: testCase.origin,
    answerKey: answerKeyToDocument(testCase.answerKey),
  };
}

export function documentToCase(document: CaseDocument): TestCase {
  return createTestCase({ ...document, answerKey: documentToAnswerKey(document.answerKey) });
}

function answerKeyToDocument(answerKey: AnswerKey): CaseDocument["answerKey"] {
  if (answerKey.kind === "planted-bug") return { ...answerKey, clues: answerKey.clues.map((c) => c.source) };
  return answerKey;
}

function documentToAnswerKey(document: CaseDocument["answerKey"]): AnswerKey {
  switch (document.kind) {
    case "correct-code":
      return correctCode;
    case "annulled":
      return annulledCase(document.reason);
    case "planted-bug":
      return plantedBug(document.category, document.description, document.clues);
  }
}
