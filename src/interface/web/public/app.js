// Every value from the server is shown with textContent: miners' answers are third-party text, never HTML.
const $ = (id) => document.getElementById(id);
const EXAMPLE_CODE = `// Free shipping from $50; otherwise a $5 fee.
function shippingFee(total) {
  return total >= 50 ? 0 : 5;
}
`;
const EXAMPLE_TESTS = `assert(shippingFee(50) === 0);
assert(shippingFee(49.99) === 5);
assert(shippingFee(120) === 0);
assert(shippingFee(0) === 5);`;
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
$('example').addEventListener('click', () => {
  $('code').value = EXAMPLE_CODE;
  $('tests').value = EXAMPLE_TESTS;
  $('code').dispatchEvent(new Event('input'));
});

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
