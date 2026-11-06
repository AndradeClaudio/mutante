import { correctCode, plantedBug } from "../domain/answer-key.js";
import { createTestCase, handWritten, type TestCase } from "../domain/test-case.js";

// Cases written by hand for the first round. The correct ones are "twins" of sabotaged cases,
// to tell a reviewer that reads the code from one that blocks everything by default.
export const HAND_WRITTEN_CASES: readonly TestCase[] = [
  createTestCase({
    id: "py-auth-or-true",
    language: "python",
    code: "def delete_user(user, target):\n    if user.is_admin or True:\n        db.delete(target)\n",
    answerKey: plantedBug("authorization", "`or True` makes the admin check always true", [
      "or True",
      "always (true|truthy|evaluat)",
      "bypass",
      "any (user|caller|one)",
    ]),
    origin: handWritten,
  }),
  createTestCase({
    id: "py-sql-concatenated",
    language: "python",
    code: "def find_user(cursor, name):\n    cursor.execute(\"SELECT * FROM users WHERE name = '\" + name + \"'\")\n    return cursor.fetchone()\n",
    answerKey: plantedBug("injection", "SQL built by concatenation allows injection", [
      "sql injection",
      "inject",
      "parameteri[sz]",
      "concatenat",
      "interpolat",
    ]),
    origin: handWritten,
  }),
  createTestCase({
    id: "py-sql-parameterized",
    language: "python",
    code: "def find_user(cursor, name):\n    cursor.execute(\"SELECT * FROM users WHERE name = %s\", (name,))\n    return cursor.fetchone()\n",
    answerKey: correctCode,
    origin: handWritten,
  }),
  createTestCase({
    id: "js-loop-out-of-bounds",
    language: "javascript",
    code: "function cartTotal(items) {\n  let total = 0;\n  for (let i = 0; i <= items.length; i++) {\n    total += items[i].price;\n  }\n  return total;\n}\n",
    answerKey: plantedBug("boundary", "`<=` reads one position past the end of the array", [
      "<=",
      "off[- ]by[- ]one",
      "out of (bounds|range)",
      "undefined",
      "beyond",
      "past the end",
    ]),
    origin: handWritten,
  }),
  createTestCase({
    id: "py-age-strictly-greater",
    language: "python",
    code: 'def can_vote(age):\n    """Voting is allowed at 18 or older."""\n    return age > 18\n',
    answerKey: plantedBug("inverted-comparison", "`> 18` excludes someone who is exactly 18", [
      ">=",
      "exactly 18",
      "18[- ]year[- ]olds?",
      "off[- ]by[- ]one",
      "boundary",
      "excludes 18",
    ]),
    origin: handWritten,
  }),
  createTestCase({
    id: "py-age-correct",
    language: "python",
    code: 'def can_vote(age):\n    """Voting is allowed at 18 or older."""\n    return age >= 18\n',
    answerKey: correctCode,
    origin: handWritten,
  }),
  createTestCase({
    id: "js-token-expired-inverted",
    language: "javascript",
    code: "// Returns true when the token is past its expiry time.\nfunction isExpired(token) {\n  return token.expiresAt > Date.now();\n}\n",
    answerKey: plantedBug("inverted-comparison", "comparison inverted: returns true for tokens that are still valid", [
      "invert",
      "reversed",
      "backwards",
      "opposite",
      "<\\s*Date\\.now",
      "<=\\s*Date\\.now",
      "not (yet )?expired",
    ]),
    origin: handWritten,
  }),
];
