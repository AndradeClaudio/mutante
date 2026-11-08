import { parse, type Node } from "acorn";
import { ASSERTION_LIMIT, type SubmissionRules } from "../../domain/submission.js";

/**
 * Accepts only the small, pure JavaScript that Mutante needs, by walking the parsed syntax tree against an
 * allow-list. Anything not listed is refused, so a new trick is refused by default rather than missed by a
 * deny-list. This is the first of several layers: what passes here still runs in an isolated interpreter.
 */
export class JavaScriptAllowList implements SubmissionRules {
  functionName(code: string): string | null {
    const program = tryParse(code);
    if (!program || program.body.length !== 1) return null;
    const only = program.body[0] as AnyNode;
    return only.type === "FunctionDeclaration" ? (only.id?.name ?? null) : null;
  }

  problemsInFunction(code: string): readonly string[] {
    const program = tryParse(code);
    if (!program) return [`the function is not valid JavaScript (${parseError(code)})`];
    if (program.body.length !== 1 || (program.body[0] as AnyNode).type !== "FunctionDeclaration") {
      return ["the code must be exactly one function declaration, with its contract in a comment"];
    }
    if (!/^\s*(\/\/|\/\*)/.test(code)) return ["start the code with a comment that states the function's contract"];
    const fn = program.body[0] as AnyNode;
    if (fn.async || fn.generator) return ["the function cannot be async or a generator"];
    const walker = new Walker(code, bindings(fn));
    walker.function(fn);
    return walker.problems();
  }

  problemsInTests(tests: string, functionName: string): readonly string[] {
    const program = tryParse(tests);
    if (!program) return [`the tests are not valid JavaScript (${parseError(tests)})`];
    const walker = new Walker(tests, new Set([...bindings(program), functionName]));
    for (const statement of program.body) walker.node(statement as AnyNode);
    const problems = [...walker.problems()];
    const asserts = countAsserts(program);
    if (asserts === 0) problems.push("the tests must call assert(condition) at least once");
    if (asserts > ASSERTION_LIMIT) problems.push(`the tests call assert ${asserts} times; at most ${ASSERTION_LIMIT} are accepted`);
    if (!tests.includes(`${functionName}(`)) problems.push(`the tests never call ${functionName}()`);
    return problems;
  }
}

// acorn's node shapes are loose; the walker reads them generically.
type AnyNode = Node & Record<string, any>;

const STATEMENTS = new Set([
  "BlockStatement", "ReturnStatement", "IfStatement", "ExpressionStatement", "VariableDeclaration", "VariableDeclarator",
  "ForStatement", "ForOfStatement", "WhileStatement", "BreakStatement", "ContinueStatement", "ThrowStatement",
  "TryStatement", "CatchClause", "EmptyStatement",
]);
const EXPRESSIONS = new Set([
  "Identifier", "Literal", "BinaryExpression", "LogicalExpression", "UnaryExpression", "UpdateExpression",
  "AssignmentExpression", "ConditionalExpression", "ArrayExpression", "ObjectExpression", "Property",
  "MemberExpression", "CallExpression", "NewExpression", "ArrowFunctionExpression", "TemplateLiteral",
  "TemplateElement", "ChainExpression", "SpreadElement", "RestElement", "ArrayPattern", "ObjectPattern", "AssignmentPattern",
]);
// Names that reach the engine, the host or the prototype chain. Refused anywhere: as identifiers, keys or text.
const FORBIDDEN_NAMES = new Set([
  "eval", "Function", "globalThis", "global", "window", "self", "process", "require", "module", "exports", "import",
  "constructor", "__proto__", "prototype", "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__",
  "arguments", "Reflect", "Proxy", "Symbol", "WebAssembly", "Atomics", "SharedArrayBuffer", "setTimeout", "setInterval",
  "setImmediate", "queueMicrotask", "fetch", "XMLHttpRequest", "Worker", "Buffer", "Deno", "Bun", "std", "os",
  // Methods that rebind or reach functions and prototypes rather than compute on data.
  "call", "apply", "bind", "then", "defineProperty", "defineProperties", "getPrototypeOf", "setPrototypeOf",
  "getOwnPropertyDescriptor", "getOwnPropertyDescriptors", "assign", "create", "freeze",
]);
// Global objects a pure function may use, and which of their members.
const GLOBAL_MEMBERS: Record<string, ReadonlySet<string>> = {
  Math: new Set(["min", "max", "floor", "ceil", "round", "abs", "trunc", "sign", "pow", "sqrt", "PI"]),
  Number: new Set(["isInteger", "isFinite", "isNaN", "MAX_SAFE_INTEGER", "MIN_SAFE_INTEGER", "EPSILON"]),
  Array: new Set(["isArray"]),
  Object: new Set(["keys", "values", "entries"]),
  JSON: new Set(["stringify"]),
};
// The only free names a submission may use; everything else must be declared in the submission itself.
const GLOBAL_NAMES = new Set([
  "String", "Number", "Boolean", "parseInt", "parseFloat", "isNaN", "Error", "undefined", "NaN", "Infinity", "assert",
  ...Object.keys(GLOBAL_MEMBERS),
]);
const PLAIN_NAMES: Record<string, string> = {
  ThisExpression: "`this`", FunctionExpression: "a `function` expression (use an arrow function)",
  FunctionDeclaration: "a nested function declaration", ClassDeclaration: "a class", ClassExpression: "a class",
  AwaitExpression: "`await`", YieldExpression: "`yield`", ImportExpression: "`import()`", MetaProperty: "`import.meta` or `new.target`",
  WithStatement: "`with`", TaggedTemplateExpression: "a tagged template", SequenceExpression: "the comma operator",
  LabeledStatement: "a label", DoWhileStatement: "`do … while`", ForInStatement: "`for … in`", SwitchStatement: "`switch`",
  DebuggerStatement: "`debugger`",
};

/** Walks one parsed submission and collects every rule it breaks. */
class Walker {
  private readonly found = new Set<string>();

  constructor(
    private readonly source: string,
    private readonly declared: ReadonlySet<string>,
  ) {}

  problems(): readonly string[] {
    return [...this.found];
  }

  function(fn: AnyNode): void {
    for (const param of fn.params) this.node(param);
    this.node(fn.body);
  }

  node(node: AnyNode): void {
    if (!STATEMENTS.has(node.type) && !EXPRESSIONS.has(node.type)) {
      this.refuse(`${PLAIN_NAMES[node.type] ?? `\`${node.type}\``} is not allowed`, node);
      return;
    }
    switch (node.type) {
      case "Identifier":
        this.identifier(node);
        return;
      case "Literal":
        if (typeof node.value === "string" && FORBIDDEN_NAMES.has(node.value)) this.refuse(`the text "${node.value}" is not allowed`, node);
        if (node.bigint !== undefined) this.refuse("BigInt literals are not allowed", node);
        return;
      case "MemberExpression":
        this.member(node);
        return;
      case "Property":
        if (node.kind !== "init") this.refuse("getters and setters are not allowed", node);
        if (node.computed) this.node(node.key);
        else if (node.key.type === "Identifier" && FORBIDDEN_NAMES.has(node.key.name)) this.refuse(`the key \`${node.key.name}\` is not allowed`, node);
        this.node(node.value);
        return;
      case "VariableDeclaration":
        if (node.kind === "var") this.refuse("use const or let instead of var", node);
        break;
      case "UnaryExpression":
        if (node.operator === "delete") this.refuse("`delete` is not allowed", node);
        break;
      case "ArrowFunctionExpression":
        if (node.async) this.refuse("async functions are not allowed", node);
        break;
      case "NewExpression":
        if (node.callee.type !== "Identifier" || node.callee.name !== "Error") this.refuse("only `new Error(...)` is allowed", node);
        break;
    }
    this.children(node);
  }

  private identifier(node: AnyNode): void {
    if (FORBIDDEN_NAMES.has(node.name)) this.refuse(`\`${node.name}\` is not allowed`, node);
    else if (!this.declared.has(node.name) && !GLOBAL_NAMES.has(node.name)) {
      this.refuse(`\`${node.name}\` is not defined in your code and is not an allowed global`, node);
    }
  }

  private member(node: AnyNode): void {
    this.node(node.object);
    if (node.computed) {
      // obj[key] is fine for data; a computed key spelled as a forbidden word is the classic escape.
      this.node(node.property);
      return;
    }
    const name = node.property.name as string;
    if (FORBIDDEN_NAMES.has(name)) this.refuse(`\`.${name}\` is not allowed`, node);
    else if (node.object.type === "Identifier" && GLOBAL_MEMBERS[node.object.name] && !GLOBAL_MEMBERS[node.object.name]!.has(name)) {
      this.refuse(`\`${node.object.name}.${name}\` is not allowed`, node);
    }
    // Other data properties and methods on values (user.role, xs.filter, a test fake's db.query) only compute.
  }

  private children(node: AnyNode): void {
    for (const key of Object.keys(node)) {
      if (key === "type" || key === "start" || key === "end") continue;
      const value = node[key];
      if (Array.isArray(value)) for (const child of value) { if (child && typeof child.type === "string") this.node(child); }
      else if (value && typeof value.type === "string") this.node(value);
    }
  }

  private refuse(problem: string, node: AnyNode): void {
    this.found.add(`${problem} (line ${this.source.slice(0, node.start).split("\n").length})`);
  }
}

/** Every name the submission declares: function name, parameters, variables, catch parameters, destructured names. */
function bindings(root: AnyNode): Set<string> {
  const names = new Set<string>();
  const addPattern = (pattern: AnyNode | null | undefined): void => {
    if (!pattern) return;
    if (pattern.type === "Identifier") names.add(pattern.name);
    else if (pattern.type === "ObjectPattern") pattern.properties.forEach((p: AnyNode) => addPattern(p.type === "RestElement" ? p.argument : p.value));
    else if (pattern.type === "ArrayPattern") pattern.elements.forEach((e: AnyNode | null) => addPattern(e));
    else if (pattern.type === "AssignmentPattern") addPattern(pattern.left);
    else if (pattern.type === "RestElement") addPattern(pattern.argument);
  };
  visitAll(root, (node) => {
    if (node.type === "FunctionDeclaration") { addPattern(node.id); node.params.forEach(addPattern); }
    if (node.type === "ArrowFunctionExpression") node.params.forEach(addPattern);
    if (node.type === "VariableDeclarator") addPattern(node.id);
    if (node.type === "CatchClause") addPattern(node.param);
  });
  return names;
}

function countAsserts(program: AnyNode): number {
  let count = 0;
  visitAll(program, (node) => {
    if (node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "assert") count++;
  });
  return count;
}

function visitAll(node: AnyNode, visit: (node: AnyNode) => void): void {
  visit(node);
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (Array.isArray(value)) for (const child of value) { if (child && typeof child.type === "string") visitAll(child, visit); }
    else if (value && typeof value.type === "string") visitAll(value, visit);
  }
}

function tryParse(source: string): AnyNode | null {
  try {
    return parse(source, { ecmaVersion: 2022, sourceType: "script" }) as AnyNode;
  } catch {
    return null;
  }
}

function parseError(source: string): string {
  try {
    parse(source, { ecmaVersion: 2022, sourceType: "script" });
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
