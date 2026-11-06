import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RoundRepository } from "../../domain/ports.js";
import type { RoundSnapshot } from "../../domain/round.js";
import { caseToDocument, documentToCase, type CaseDocument } from "./case-document.js";

/** Stores each round as a readable JSON file (it becomes public evidence for the submission). */
export class JsonRoundRepository implements RoundRepository {
  constructor(
    private readonly folder: string,
    private readonly historyFolder: string,
  ) {}

  async save(round: RoundSnapshot): Promise<void> {
    await mkdir(this.folder, { recursive: true });
    const document: RoundDocument = { ...round, cases: round.cases.map(caseToDocument) };
    await writeFile(this.pathOf(round.id), JSON.stringify(document, null, 2));
  }

  async find(id: string): Promise<RoundSnapshot | null> {
    try {
      const document = JSON.parse(await readFile(this.pathOf(id), "utf8")) as RoundDocument;
      return { ...document, cases: document.cases.map(documentToCase) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async latest(): Promise<RoundSnapshot | null> {
    const files = await readdir(this.folder).catch(() => [] as string[]);
    const last = files.filter((f) => f.endsWith(".json")).sort().at(-1);
    return last ? this.find(last.replace(/\.json$/, "")) : null;
  }

  async archive(id: string, now: Date): Promise<string> {
    await mkdir(this.historyFolder, { recursive: true });
    const copy = join(this.historyFolder, `${id}-before-${now.toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`);
    await copyFile(this.pathOf(id), copy);
    return copy;
  }

  private pathOf(id: string): string {
    return join(this.folder, `${id}.json`);
  }
}

type RoundDocument = Omit<RoundSnapshot, "cases"> & { cases: CaseDocument[] };
