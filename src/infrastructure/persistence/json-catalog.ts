import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { TestCase } from "../../domain/test-case.js";
import { caseToDocument, documentToCase, type CaseDocument } from "./case-document.js";

export async function saveCatalog(path: string, cases: readonly TestCase[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(cases.map(caseToDocument), null, 2));
}

export async function loadCatalog(path: string): Promise<TestCase[]> {
  const documents = JSON.parse(await readFile(path, "utf8")) as CaseDocument[];
  return documents.map(documentToCase);
}
