import { createRequire } from "node:module";
import type { ReviewMarket } from "../../domain/ports.js";
import type { Review } from "../../domain/review.js";
import type { Reviewer } from "../../domain/round.js";
import type { TestCase } from "../../domain/test-case.js";

// The analyzers live in tools/static-analyzers with their own node_modules: SonarJS needs
// TypeScript 5, while this project compiles with TypeScript 7.
const requireAnalyzer = createRequire(new URL("../../../tools/static-analyzers/package.json", import.meta.url));

/**
 * Rules that only fire because each sample is a lone function nobody calls. They say nothing
 * about the planted bug, and a real project would not report them.
 */
const SNIPPET_ONLY_RULES = new Set(["no-unused-vars", "sonarjs/no-unused-vars", "sonarjs/unused-import"]);

interface LintMessage {
  ruleId: string | null;
  message: string;
  line: number;
}
interface Linter {
  lintText(code: string): Promise<{ messages: LintMessage[] }[]>;
}

/**
 * Static analyzers as a free, local "market": the same cases go through the same use case and
 * grading as the paid miners, which makes them a baseline for "why not just use a linter?".
 */
export class StaticAnalysisMarket implements ReviewMarket {
  readonly intent = "LOCAL_STATIC_ANALYSIS";
  readonly estimatedPriceMicroUsdc = 0;
  private readonly linters: ReadonlyMap<string, Linter>;

  constructor() {
    const { ESLint } = requireAnalyzer("eslint") as { ESLint: new (options: object) => Linter };
    const javascript = requireAnalyzer("@eslint/js") as { configs: { recommended: object } };
    const sonarjs = requireAnalyzer("eslint-plugin-sonarjs") as { configs: { recommended: object } };
    const linterWith = (config: object) =>
      new ESLint({
        overrideConfigFile: true,
        overrideConfig: [config, { languageOptions: { ecmaVersion: 2024, sourceType: "script" } }],
      });
    this.linters = new Map([
      ["eslint-recommended", linterWith(javascript.configs.recommended)],
      ["sonarjs-recommended", linterWith(sonarjs.configs.recommended)],
    ]);
  }

  async listReviewers(): Promise<Reviewer[]> {
    const { version: eslintVersion } = requireAnalyzer("eslint/package.json") as { version: string };
    const { version: sonarVersion } = requireAnalyzer("eslint-plugin-sonarjs/package.json") as { version: string };
    return [
      { id: "eslint-recommended", name: `ESLint ${eslintVersion} (recommended rules)` },
      { id: "sonarjs-recommended", name: `SonarJS ${sonarVersion} (Sonar way rules)` },
    ];
  }

  async buyReview(reviewer: Reviewer, testCase: TestCase): Promise<Review> {
    const base = { reviewerId: reviewer.id, caseId: testCase.id, receipt: null };
    const linter = this.linters.get(reviewer.id);
    if (!linter) throw new Error(`Unknown static analyzer: ${reviewer.id}`);
    if (testCase.language !== "javascript") {
      return { ...base, kind: "failed", reason: `Only JavaScript is analyzed; this case is ${testCase.language}.`, latencyMs: 0 };
    }

    const start = Date.now();
    const [result] = await linter.lintText(testCase.code.text);
    const issues = (result?.messages ?? []).filter((m) => !SNIPPET_ONLY_RULES.has(m.ruleId ?? ""));
    return {
      ...base,
      kind: "delivered",
      verdict: issues.length > 0 ? "Request changes" : "Approve",
      verdictRejectedByNetwork: false,
      findings: issues.map((m) => `${m.ruleId ?? "parse-error"}: ${m.message} (line ${m.line})`),
      summary: issues.length > 0 ? `${issues.length} issue(s) reported.` : "No issues reported.",
      latencyMs: Date.now() - start,
      rawResponse: JSON.stringify(result?.messages ?? []),
    };
  }
}
