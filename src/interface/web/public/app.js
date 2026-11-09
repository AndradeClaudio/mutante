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
    if (response.status === 409 && body.runId) {
      follow(body.runId);
      return;
    }
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

const REVIEWER_NAMES = { '7310045': 'CodeWire', '5530': 'Verity', '20260828': 'PREFLIGHT', 'auto-routed': 'Auto-routing' };
const STAGES = ['planting', 'buying', 'grading'];
const STAGE_TITLES = {
  planting: 'Planting bugs in your function…',
  buying: 'Buying reviews from the miners…',
  grading: 'Grading the answers…',
  finished: 'Done',
};

// "web-shippingfee-boundary-1" → "bug: boundary"; the original is the one with no planted bug.
function caseName(caseId) {
  if (caseId.endsWith('-correct')) return 'your original';
  const kind = caseId.replace(/^web-[a-z0-9]+-/, '').replace(/-\d+$/, '');
  return `bug: ${kind.replace(/-/g, ' ')}`;
}

function showStage(run) {
  const current = STAGES.indexOf(run.stage);
  STAGES.forEach((stage, i) => {
    const item = $(`stage-${stage}`);
    item.className = run.stage === 'finished' || i < current ? 'done' : i === current ? 'active' : '';
  });
  $('stage-title').textContent = STAGE_TITLES[run.stage] ?? 'Working…';
  const expected = run.expectedReviews ?? 0;
  const bought = run.progress.length;
  // Planting is about a tenth of the wait; the purchases are the rest.
  const share = run.stage === 'planting' ? 0.04 : run.stage === 'buying' ? 0.1 + 0.85 * (expected ? bought / expected : 0) : 1;
  $('bar-fill').style.width = `${Math.round(share * 100)}%`;
  $('bar-fill').parentElement.setAttribute('aria-valuenow', String(Math.round(share * 100)));
  $('count').textContent = run.stage === 'planting'
    ? 'Running your tests against each changed version, in a sandbox.'
    : bought === 0
      ? `${run.provenMutants} bugs proven by your tests. Waiting for the first answers (the first ones take the longest)…`
      : run.stage === 'finished'
        ? `${bought} reviews answered · $${(bought * 0.01).toFixed(2)} of test USDC paid · results below`
        : `${bought} of ${expected} reviews answered · $${(bought * 0.01).toFixed(2)} of test USDC paid so far`;
}

async function follow(runId) {
  history.replaceState(null, '', `#run=${runId}`);
  showProblems([]);
  $('run').disabled = true;
  $('progress').hidden = false;
  $('log').replaceChildren();
  $('progress').scrollIntoView({ behavior: 'smooth', block: 'start' });
  let shown = 0;
  let startedAt = Date.now();
  const clock = setInterval(() => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    $('elapsed').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }, 1000);
  for (;;) {
    const response = await fetch(`/api/runs/${runId}`).catch(() => null);
    if (response && response.status === 404) { showProblems(['This run is no longer on the server (runs are kept for 24 hours). Start a new one.']); break; }
    if (response && response.ok) {
      const run = await response.json();
      startedAt = run.startedAt;
      for (const p of run.progress.slice(shown)) {
        const item = el('li');
        const tone = p.outcome === 'Request changes' ? 'good' : p.outcome === 'failed' ? 'bad' : '';
        item.append(el('span', 'who', REVIEWER_NAMES[p.reviewer] ?? p.reviewer), el('span', 'case', caseName(p.caseId)), el('span', `out ${tone}`, p.outcome));
        $('log').prepend(item);
      }
      shown = run.progress.length;
      showStage(run);
      if (run.status === 'done') { render(run.result); break; }
      if (run.status === 'failed') { showProblems([run.error]); break; }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  clearInterval(clock);
  $('run').disabled = false;
}

// A reload, or a shared link, reopens the run instead of starting over.
const linkedRun = /^#run=([0-9a-f-]{36})$/.exec(location.hash);
if (linkedRun) follow(linkedRun[1]);

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
