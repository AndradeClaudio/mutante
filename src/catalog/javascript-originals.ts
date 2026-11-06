import type { OriginalCode } from "../domain/mutation/original-code.js";

// Correct originals for the mutation engine. Rules for being here:
// 1) the first-line comment is the contract (without it, a mutant would not be "wrong");
// 2) the tests cover the edges of the contract, so every relevant sabotage is detected;
// 3) the code fits comfortably in 256 bytes, so the mutants fit too.
const original = (id: string, code: string, tests: string): OriginalCode => ({
  id,
  language: "javascript",
  code,
  tests,
});

export const JAVASCRIPT_ORIGINALS: readonly OriginalCode[] = [
  original(
    "can-vote",
    `// Voting is allowed at 18 or older.
function canVote(age) {
  return age >= 18;
}
`,
    `assert(canVote(18) === true); assert(canVote(17) === false); assert(canVote(40) === true);`,
  ),
  original(
    "cart-total",
    `// Sum of the item prices.
function cartTotal(items) {
  let total = 0;
  for (let i = 0; i < items.length; i++) total += items[i].price;
  return total;
}
`,
    `assert(cartTotal([{price: 2}, {price: 3}]) === 5); assert(cartTotal([]) === 0);`,
  ),
  original(
    "token-expired",
    `// True only when now is after expiresAt (still valid at expiresAt).
function isExpired(token, now) {
  return token.expiresAt < now;
}
`,
    `assert(isExpired({expiresAt: 5}, 10) === true); assert(isExpired({expiresAt: 10}, 5) === false);
     assert(isExpired({expiresAt: 7}, 7) === false);`,
  ),
  original(
    "can-delete-post",
    `// Only admins or the post owner may delete a post.
function canDelete(user, post) {
  return user.isAdmin || post.ownerId === user.id;
}
`,
    `assert(canDelete({isAdmin: true, id: 1}, {ownerId: 2}) === true);
     assert(canDelete({isAdmin: false, id: 2}, {ownerId: 2}) === true);
     assert(canDelete({isAdmin: false, id: 1}, {ownerId: 2}) === false);`,
  ),
  original(
    "withdraw",
    `// Withdraws if the balance covers it; otherwise throws.
function withdraw(account, amount) {
  if (amount > account.balance) throw new Error("insufficient funds");
  account.balance -= amount;
  return account.balance;
}
`,
    `assert(withdraw({balance: 10}, 10) === 0); assert(withdraw({balance: 10}, 3) === 7);
     let threw = false; try { withdraw({balance: 5}, 10); } catch { threw = true; } assert(threw);`,
  ),
  original(
    "discount",
    `// Price after a percentage discount, never below zero.
function applyDiscount(price, percent) {
  const result = price - price * percent / 100;
  return Math.max(result, 0);
}
`,
    `assert(applyDiscount(100, 10) === 90); assert(applyDiscount(100, 150) === 0); assert(applyDiscount(50, 0) === 50);`,
  ),
  original(
    "strong-password",
    `// Strong: at least 12 characters and contains a digit.
function isStrongPassword(pw) {
  return pw.length >= 12 && /\\d/.test(pw);
}
`,
    `assert(isStrongPassword("abcdefghijk1") === true); assert(isStrongPassword("abcdefghijkl") === false);
     assert(isStrongPassword("abcdefghij1") === false); assert(isStrongPassword("a1") === false);`,
  ),
  original(
    "pagination",
    `// Items of a 1-based page with \`size\` items per page.
function paginate(items, page, size) {
  const start = (page - 1) * size;
  return items.slice(start, start + size);
}
`,
    `const xs = [1, 2, 3, 4, 5];
     assert(paginate(xs, 1, 2).join() === "1,2"); assert(paginate(xs, 2, 2).join() === "3,4");
     assert(paginate(xs, 3, 2).join() === "5");`,
  ),
  original(
    "rate-limit",
    `// Allows a request while fewer than \`limit\` were made in the window.
function allowRequest(count, limit) {
  return count < limit;
}
`,
    `assert(allowRequest(4, 5) === true); assert(allowRequest(5, 5) === false); assert(allowRequest(6, 5) === false);`,
  ),
  original(
    "authenticated-profile",
    `// Returns the user's profile; anonymous callers are rejected.
function getProfile(session) {
  if (!session.user) throw new Error("unauthenticated");
  return session.user.profile;
}
`,
    `assert(getProfile({user: {profile: 7}}) === 7);
     let threw = false; try { getProfile({}); } catch { threw = true; } assert(threw);`,
  ),
  original(
    "average",
    `// Mean of a non-empty array of numbers.
function average(xs) {
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}
`,
    `assert(average([2, 4]) === 3); assert(average([5]) === 5);`,
  ),
  original(
    "weekend",
    `// day: 0 = Sunday ... 6 = Saturday.
function isWeekend(day) {
  return day === 0 || day === 6;
}
`,
    `assert(isWeekend(0) && isWeekend(6)); assert(!isWeekend(1) && !isWeekend(5));`,
  ),
  original(
    "last-n",
    `// Last n elements of the array (all of them if fewer).
function lastN(arr, n) {
  return arr.slice(Math.max(arr.length - n, 0));
}
`,
    `assert(lastN([1, 2, 3], 2).join() === "2,3"); assert(lastN([1, 2], 5).join() === "1,2");`,
  ),
  original(
    "can-ship-order",
    `// An order ships only if every line is in stock.
function canShip(order, stock) {
  return order.lines.every(l => (stock[l.sku] ?? 0) >= l.qty);
}
`,
    `assert(canShip({lines: [{sku: "a", qty: 2}]}, {a: 2}) === true);
     assert(canShip({lines: [{sku: "a", qty: 3}]}, {a: 2}) === false);
     assert(canShip({lines: [{sku: "b", qty: 1}]}, {}) === false);`,
  ),
  original(
    "find-user",
    `// Finds a user by email with a parameterized query.
function findUser(db, email) {
  return db.query("SELECT * FROM users WHERE email = $1", [email]);
}
`,
    `const calls = []; const db = { query: (sql, params) => calls.push({ sql, params }) };
     findUser(db, "x' OR '1'='1");
     assert(!calls[0].sql.includes("OR '1'='1"), "user input inside the SQL");`,
  ),
  original(
    "discount-age",
    `// Seniors (65+) and children under 12 get a discount.
function hasDiscount(age) {
  return age >= 65 || age < 12;
}
`,
    `assert(hasDiscount(65) && hasDiscount(11)); assert(!hasDiscount(12) && !hasDiscount(64));`,
  ),
];
