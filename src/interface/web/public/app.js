// Every value from the server is shown with textContent: miners' answers are third-party text, never HTML.
const $ = (id) => document.getElementById(id);
// Each example is a small business rule whose edge a reviewer has to notice; `why` says what the bugs will touch.
const EXAMPLES = [
  {
    label: 'Free shipping',
    why: 'Pricing rule with a boundary at exactly $50.',
    code: `// Free shipping from $50; otherwise a $5 fee.
function shippingFee(total) {
  return total >= 50 ? 0 : 5;
}
`,
    tests: `assert(shippingFee(50) === 0);
assert(shippingFee(49.99) === 5);
assert(shippingFee(120) === 0);
assert(shippingFee(0) === 5);`,
  },
  {
    label: 'Token expiry',
    why: 'Security rule: a token is still valid at the exact second it expires.',
    code: `// True only when now is after expiresAt (still valid at expiresAt).
function isExpired(token, now) {
  return token.expiresAt < now;
}
`,
    tests: `assert(isExpired({expiresAt: 5}, 10) === true);
assert(isExpired({expiresAt: 10}, 5) === false);
assert(isExpired({expiresAt: 7}, 7) === false);`,
  },
  {
    label: 'Who can delete',
    why: 'Authorization: admins or the owner, nobody else.',
    code: `// Only admins or the post owner may delete a post.
function canDelete(user, post) {
  return user.isAdmin || post.ownerId === user.id;
}
`,
    tests: `assert(canDelete({isAdmin: true, id: 1}, {ownerId: 2}) === true);
assert(canDelete({isAdmin: false, id: 2}, {ownerId: 2}) === true);
assert(canDelete({isAdmin: false, id: 1}, {ownerId: 2}) === false);`,
  },
  {
    label: 'Withdraw',
    why: 'Money: withdrawing the whole balance is allowed, more than it must throw.',
    code: `// Withdraws if the balance covers it; otherwise throws.
function withdraw(account, amount) {
  if (amount > account.balance) throw new Error("insufficient funds");
  account.balance -= amount;
  return account.balance;
}
`,
    tests: `assert(withdraw({balance: 10}, 10) === 0);
assert(withdraw({balance: 10}, 3) === 7);
let threw = false;
try { withdraw({balance: 5}, 10); } catch { threw = true; }
assert(threw);`,
  },
  {
    label: 'Rate limit',
    why: 'Off-by-one territory: the request that reaches the limit is refused.',
    code: `// Allows a request while fewer than \`limit\` were made in the window.
function allowRequest(count, limit) {
  return count < limit;
}
`,
    tests: `assert(allowRequest(4, 5) === true);
assert(allowRequest(5, 5) === false);
assert(allowRequest(6, 5) === false);`,
  },
  {
    label: 'Discount',
    why: 'Arithmetic plus a floor: a discount never makes the price negative.',
    code: `// Price after a percentage discount, never below zero.
function applyDiscount(price, percent) {
  const result = price - price * percent / 100;
  return Math.max(result, 0);
}
`,
    tests: `assert(applyDiscount(100, 10) === 90);
assert(applyDiscount(100, 150) === 0);
assert(applyDiscount(50, 0) === 50);`,
  },
];
const GOOD = new Set(['caught', 'correctly-approved']);
const WARN = new Set(['explained-without-verdict', 'blocked-without-reason']);
const BAD = new Set(['missed', 'false-alarm', 'failed']);
const pct = (x) => `${Math.round(x * 100)}%`;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

$('code').addEventListener('input', () => { $('bytes').textContent = String(new TextEncoder().encode($('code').value).length); });
function loadExample(example, chip) {
  $('code').value = example.code;
  $('tests').value = example.tests;
  $('code').dispatchEvent(new Event('input'));
  $('example-why').textContent = example.why;
  for (const other of $('examples').children) other.setAttribute('aria-pressed', String(other === chip));
}

for (const example of EXAMPLES) {
  const chip = el('button', 'chip', example.label);
  chip.type = 'button';
  chip.addEventListener('click', () => loadExample(example, chip));
  $('examples').append(chip);
}
// The page opens with a working example, so a judge only needs the access code to see a run.
loadExample(EXAMPLES[0], $('examples').firstElementChild);
// Editing the code means it is no longer the example, so no chip stays highlighted.
for (const id of ['code', 'tests']) {
  $(id).addEventListener('input', (event) => {
    if (!event.isTrusted) return;
    for (const chip of $('examples').children) chip.setAttribute('aria-pressed', 'false');
    $('example-why').textContent = '';
  });
}

$('form').addEventListener('submit', async (event) => {
  event.preventDefault();
  showProblems([]);
  $('run').disabled = true;
  $('results').hidden = true;
  try {
    const response = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessCode: $('access').value, code: $('code').value, tests: $('tests').value }),
    });
    const body = await response.json();
    if (!response.ok) {
      showProblems(body.problems ?? [body.error ?? 'The run could not start.']);
      $('run').disabled = false;
      return;
    }
    follow(body.runId);
  } catch {
    showProblems(['The service did not answer. Try again in a moment.']);
    $('run').disabled = false;
  }
});

function showProblems(problems) {
  const list = $('problems');
  list.replaceChildren(...problems.map((p) => el('li', '', p)));
  list.hidden = problems.length === 0;
}

async function follow(runId) {
  $('progress').hidden = false;
  $('log').replaceChildren();
  let shown = 0;
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    const response = await fetch(`/api/runs/${runId}`);
    if (!response.ok) { showProblems(['The run was lost. Start it again.']); break; }
    const run = await response.json();
    for (const p of run.progress.slice(shown)) {
      const item = el('li');
      item.append(el('span', 'who', p.reviewer), el('span', 'case', p.caseId), el('span', `out ${p.outcome === 'Request changes' ? 'good' : p.outcome === 'failed' ? 'bad' : ''}`, p.outcome));
      $('log').prepend(item);
    }
    shown = run.progress.length;
    $('count').textContent = String(shown);
    if (run.status === 'done') { render(run.result); break; }
    if (run.status === 'failed') { showProblems([run.error]); break; }
  }
  $('run').disabled = false;
}

function render(result) {
  $('results').hidden = false;
  const names = new Map(result.reviewers.map((r) => [r.id, r.name]));
  $('scoreboard').replaceChildren(...result.scoreboard.map((row) => {
    const tr = el('tr');
    tr.append(
      el('td', '', row.name),
      el('td', 'num', row.costPerCatchUsdc === null ? 'none caught' : `$${row.costPerCatchUsdc.toFixed(3)}`),
      el('td', 'num', pct(row.explained)),
      el('td', 'num', pct(row.counted)),
      el('td', 'num', pct(row.falseAlarms)),
    );
    return tr;
  }));
  $('summary').textContent = `${result.provenMutants} bugs proven by your tests; reviews bought for ${result.cases.length - 1} of them and for your correct original, $${result.spentUsdc.toFixed(2)} in test USDC.`;
  $('cases').replaceChildren(...result.cases.map((c) => {
    const card = el('article', 'card case');
    card.append(el('h3', '', c.planted ? `Planted bug: ${c.planted}` : 'Your correct original'));
    card.append(el('pre', 'code', c.code));
    const answers = el('div', 'answers');
    for (const a of c.answers) {
      const box = el('div', 'answer');
      const head = el('header');
      head.append(el('b', '', names.get(a.reviewer) ?? a.reviewer));
      const pill = el('span', `pill ${GOOD.has(a.grade) ? 'good' : WARN.has(a.grade) ? 'warn' : BAD.has(a.grade) ? 'bad' : ''}`, a.verdict ? `${a.grade} · ${a.verdict}` : a.grade);
      head.append(pill);
      box.append(head);
      if (a.servedBy) box.append(el('small', 'muted', `answered by ${a.servedBy}`));
      box.append(el('p', 'text', a.text));
      if (a.tx && /^0x[0-9a-fA-F]{64}$/.test(a.tx)) {
        const link = el('a', 'tx', 'payment on Sepolia Etherscan');
        link.href = `https://sepolia.etherscan.io/tx/${a.tx}`;
        link.target = '_blank';
        link.rel = 'noopener';
        box.append(link);
      }
      answers.append(box);
    }
    card.append(answers);
    return card;
  }));
  $('results').scrollIntoView({ behavior: 'smooth' });
}
