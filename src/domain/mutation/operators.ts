import type { DefectCategory } from "../answer-key.js";

/** One concrete sabotage applied at one site of the code. */
export interface Mutation {
  readonly operator: string;
  readonly category: DefectCategory;
  readonly description: string;
  readonly code: string;
  /** Clues specific to this site (e.g. the sabotaged expression), added to the category clues. */
  readonly siteClues: readonly string[];
}

export interface MutationOperator {
  readonly name: string;
  readonly category: DefectCategory;
  mutate(code: string): Mutation[];
}

/** Phrases showing the reviewer understood the kind of defect, wherever it sits. */
export const CATEGORY_CLUES: Readonly<Record<DefectCategory, readonly string[]>> = {
  boundary: [
    "off[- ]by[- ]one", "boundary", "edge case", "inclusive", "exclusive", "exactly",
    "strict(ly)? (inequality|comparison|less|greater)", "(less|greater) than or equal",
  ],
  "inverted-comparison": [
    "invert", "revers", "backwards", "opposite", "flipped", "wrong direction",
    "(rejects|accepts)\\b[^.]{0,60}\\b(accepts|rejects)\\b",
    "returns `?(true|false)`? when [^.]{0,40}\\bnot\\b",
  ],
  logic: [
    "logical operator", "should be (&&|\\|\\||and|or|===|!==)", "negat", "invert", "opposite",
    "always (returns? )?`?(true|false)", "both [^.]{0,40}(simultaneously|at the same time)",
    "\\b(and|or)\\b\\W{0,3} instead of", "every [^.]{0,30}except",
  ],
  authorization: ["always (true|truthy|pass|execut|run)", "\\|\\|\\s*true", "bypass", "unconditional", "tautolog"],
  "missing-validation": [
    "missing (check|validation|guard)", "no (check|validation|guard)", "without (check|validat)", "not (checked|validated)",
    "(allows|permits) [^.]{0,40}(exceed|beyond|more than)",
  ],
  arithmetic: [
    "arithmetic", "wrong operator", "should (be )?(add|subtract|multipl|divid)", "sign",
    "subtraction", "addition", "multiplication", "division", "negative of", "increase (rather|instead)",
  ],
  constant: ["magic number", "off[- ]by[- ]one", "wrong (constant|value|threshold|index)", "should be \\d+", "minimum (result|value) of"],
  injection: ["sql injection", "inject", "parameteri[sz]", "concatenat", "interpolat"],
};

// ---------- operators ----------

const boundary = swapOperator({
  name: "boundary",
  category: "boundary",
  pattern: /(?<![=<>!])(>=|<=|>|<)(?![=<>])/g,
  swaps: { ">=": ">", "<=": "<", ">": ">=", "<": "<=" },
  describe: (from, to) => `boundary changed: \`${from}\` became \`${to}\``,
});

const comparisonFlip = swapOperator({
  name: "comparison-flip",
  category: "inverted-comparison",
  pattern: /(?<![=<>!])(>=|<=|>|<)(?![=<>])/g,
  swaps: { ">=": "<=", "<=": ">=", ">": "<", "<": ">" },
  describe: (from, to) => `comparison inverted: \`${from}\` became \`${to}\``,
});

const logicalConnective = swapOperator({
  name: "logical-connective",
  category: "logic",
  pattern: /(&&|\|\|)/g,
  swaps: { "&&": "||", "||": "&&" },
  describe: (from, to) => `logical connective swapped: \`${from}\` became \`${to}\``,
  quote: surroundingCondition,
});

const equalityFlip = swapOperator({
  name: "equality-flip",
  category: "logic",
  pattern: /(===|!==)/g,
  swaps: { "===": "!==", "!==": "===" },
  describe: (from, to) => `equality inverted: \`${from}\` became \`${to}\``,
});

const arithmetic = swapOperator({
  name: "arithmetic",
  category: "arithmetic",
  pattern: /(?<=\s)(\+=|-=|\+|-|\*|\/)(?=\s)/g,
  swaps: { "+=": "-=", "-=": "+=", "+": "-", "-": "+", "*": "/", "/": "*" },
  describe: (from, to) => `arithmetic operator swapped: \`${from}\` became \`${to}\``,
});

const negationRemoved: MutationOperator = {
  name: "negation-removed",
  category: "logic",
  mutate(code) {
    return matchesOutsideText(code, /!(?!=)(?=[\w(])/g).map(({ index }) => ({
      operator: this.name,
      category: this.category,
      description: "negation `!` removed",
      code: replaceAt(code, index, 1, ""),
      siteClues: ["missing (!|not|negation)", "should be negated", "without (the )?(!|not)"],
    }));
  },
};

const alwaysTrueCondition: MutationOperator = {
  name: "always-true-condition",
  category: "authorization",
  mutate(code) {
    return matchesOutsideText(code, /\bif \(/g).flatMap(({ index }) => {
      const closing = closingParenthesis(code, index + 3);
      if (closing === null) return [];
      return [
        {
          operator: this.name,
          category: this.category,
          description: "`if` condition made always true (`|| true`)",
          code: replaceAt(code, closing, 0, " || true"),
          siteClues: ["\\|\\|\\s*true"],
        },
      ];
    });
  },
};

const guardRemoved: MutationOperator = {
  name: "guard-removed",
  category: "missing-validation",
  mutate(code) {
    const lines = code.split("\n");
    return lines.flatMap((line, i) => {
      const guard = /^\s*if \((.+)\) (throw|return)\b/.exec(line);
      if (!guard) return [];
      return [
        {
          operator: this.name,
          category: this.category,
          description: `guard removed: \`${line.trim()}\``,
          code: [...lines.slice(0, i), ...lines.slice(i + 1)].join("\n"),
          siteClues: [asFlexibleRegex(guard[1]!.trim())],
        },
      ];
    });
  },
};

const constantChanged: MutationOperator = {
  name: "constant-changed",
  category: "constant",
  mutate(code) {
    return matchesOutsideText(code, /(?<![\w.$\\])\d+(?![\w.])/g).map(({ index, text }) => {
      const replacement = String(Number(text) + 1);
      const mutated = replaceAt(code, index, text.length, replacement);
      return {
        operator: this.name,
        category: this.category,
        description: `constant changed: \`${text}\` became \`${replacement}\``,
        code: mutated,
        // Reviewers who spot a wrong constant tend to quote the new value in a phrase ("shorter than 13", "treats `7` as").
        siteClues: [
          quotableExpression(mutated, index),
          `(than|of|as|at|treats|\\?\\?)\\s*\`?${replacement}\\b`,
          `\`${replacement}\``,
        ],
      };
    });
  },
};

const sqlConcatenation: MutationOperator = {
  name: "sql-concatenation",
  category: "injection",
  mutate(code) {
    const parameterized = /"([^"]*)\$1"\s*,\s*\[(\w+)\]/g;
    return [...code.matchAll(parameterized)].map((m) => ({
      operator: this.name,
      category: this.category,
      description: "parameterized query replaced by SQL concatenated with user input",
      code: replaceAt(code, m.index!, m[0].length, `"${m[1]}'" + ${m[2]} + "'"`),
      siteClues: [],
    }));
  },
};

export const DEFAULT_OPERATORS: readonly MutationOperator[] = [
  boundary,
  comparisonFlip,
  logicalConnective,
  equalityFlip,
  arithmetic,
  negationRemoved,
  alwaysTrueCondition,
  guardRemoved,
  constantChanged,
  sqlConcatenation,
];

// ---------- support ----------

function swapOperator(definition: {
  name: string;
  category: DefectCategory;
  pattern: RegExp;
  swaps: Record<string, string>;
  describe: (from: string, to: string) => string;
  /** How a reviewer would quote the sabotaged site; by default, the smallest surrounding expression. */
  quote?: (code: string, index: number, length: number) => string;
}): MutationOperator {
  const quote = definition.quote ?? ((code: string, index: number) => quotableExpression(code, index));
  return {
    name: definition.name,
    category: definition.category,
    mutate(code) {
      return matchesOutsideText(code, definition.pattern).flatMap(({ index, text }) => {
        const replacement = definition.swaps[text];
        if (replacement === undefined) return [];
        const mutated = replaceAt(code, index, text.length, replacement);
        return [
          {
            operator: definition.name,
            category: definition.category,
            description: definition.describe(text, replacement),
            code: mutated,
            siteClues: [quote(mutated, index, replacement.length)],
          },
        ];
      });
    },
  };
}

/** Matches outside comments and string literals (the contract lives in the comments). */
function matchesOutsideText(code: string, pattern: RegExp): { index: number; text: string }[] {
  const protectedChars = textMask(code);
  return [...code.matchAll(pattern)]
    .filter((m) => !protectedChars[m.index!])
    .map((m) => ({ index: m.index!, text: m[0] }));
}

function textMask(code: string): boolean[] {
  const mask = new Array<boolean>(code.length).fill(false);
  const literals = /\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/(?![/*])(?:\\.|[^/\\\n])+\/[gimsuy]*(?=\.)/g;
  for (const m of code.matchAll(literals)) mask.fill(true, m.index!, m.index! + m[0].length);
  return mask;
}

function closingParenthesis(code: string, opening: number): number | null {
  let depth = 0;
  for (let i = opening; i < code.length; i++) {
    if (code[i] === "(") depth++;
    if (code[i] === ")" && --depth === 0) return i;
  }
  return null;
}

const TOKEN = /[\w.$]+(?:\[[^\]]*\])*|===|!==|>=|<=|\+=|-=|&&|\|\||\?\?|[<>+\-*/=]/g;
const MAX_QUOTE_LENGTH = 40;

/**
 * Smallest expression a reviewer would quote when pointing at the sabotaged site: `operand operator operand`.
 * E.g. in `const start = (page - 2) * size;`, for the `2`, returns the regex for `page - 2`.
 */
function quotableExpression(code: string, index: number): string {
  const lineStart = code.lastIndexOf("\n", index - 1) + 1;
  const lineEnd = code.indexOf("\n", index);
  const line = code.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
  const position = index - lineStart;

  const tokens = [...line.matchAll(TOKEN)].map((m) => ({ text: m[0], start: m.index! }));
  const k = tokens.findIndex((t) => position >= t.start && position < t.start + t.text.length);
  if (k === -1) return asFlexibleRegex(line.trim());

  const isOperator = (i: number) => tokens[i] !== undefined && !/^[\w.$]/.test(tokens[i]!.text);
  const [first, last] = isOperator(k) ? [k - 1, k + 1] : isOperator(k - 1) ? [k - 2, k] : isOperator(k + 1) ? [k, k + 2] : [k, k];
  if (first === last) return asFlexibleRegex(enclosingCall(line, position) ?? line.trim());
  const from = tokens[Math.max(first, 0)]!;
  const to = tokens[Math.min(last, tokens.length - 1)]!;
  return asFlexibleRegex(withoutDanglingParentheses(line.slice(from.start, to.start + to.text.length)));
}

/** E.g. the `1` in `Math.max(result, 1)` is quoted as the whole call. */
function enclosingCall(line: string, position: number): string | null {
  const opening = line.lastIndexOf("(", position);
  if (opening === -1) return null;
  const start = opening - (/[\w.$]+$/.exec(line.slice(0, opening))?.[0].length ?? 0);
  let depth = 0;
  for (let i = opening; i < line.length; i++) {
    if (line[i] === "(") depth++;
    if (line[i] === ")" && --depth === 0) return line.slice(start, i + 1);
  }
  return null;
}

/** E.g. `0) >= l.qty` becomes `>= l.qty`, because a reviewer would not quote half a parenthesis. */
function withoutDanglingParentheses(excerpt: string): string {
  let result = excerpt;
  const danglingClose = result.lastIndexOf(")");
  if (danglingClose !== -1 && !result.slice(0, danglingClose).includes("(")) result = result.slice(danglingClose + 1);
  const danglingOpen = result.indexOf("(");
  if (danglingOpen !== -1 && !result.slice(danglingOpen).includes(")")) result = result.slice(0, danglingOpen);
  return result.trim();
}

/** For logical connectives reviewers tend to quote the whole condition (e.g. `age >= 65 && age < 12`). */
function surroundingCondition(code: string, index: number, length: number): string {
  const delimiter = /[(){},;\n]/;
  let start = index;
  while (start > 0 && !delimiter.test(code[start - 1]!)) start--;
  let end = index + length;
  while (end < code.length && !delimiter.test(code[end]!)) end++;

  const excerpt = code.slice(start, end).replace(/^\s*return\s*/, "").trim();
  return excerpt.length > MAX_QUOTE_LENGTH ? quotableExpression(code, index) : asFlexibleRegex(excerpt);
}

function asFlexibleRegex(excerpt: string): string {
  return escapeRegex(excerpt.trim()).replace(/\s+/g, "\\s*");
}

function replaceAt(text: string, index: number, length: number, replacement: string): string {
  return text.slice(0, index) + replacement + text.slice(index + length);
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
