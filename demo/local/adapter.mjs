import { execFileSync, spawn } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  unlinkSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
const source = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [action, step] = process.argv.slice(2);
const run = process.env.FACTORY_RUN_ID;
if (
  !/^[\w-]+$/.test(run || '') ||
  process.env.FACTORY_SCENARIO !== 'local-catalog-sort'
)
  throw Error('This adapter implements only local-catalog-sort.');
const root = resolve(source, '.autofactory/local-live', run),
  repo = resolve(root, 'app');
const state = resolve(source, '.autofactory/local-live');
mkdirSync(root, { recursive: true });
process.on('uncaughtException', (error) => {
  writeFileSync(resolve(root, 'error.log'), String(error.stack || error));
  process.exit(1);
});
const route = 'src/app/api/products/route.ts';
const routeTest = 'src/app/api/products/route.test.ts';
function testExpectation(sorted) {
  edit(routeTest, (s) =>
    sorted
      ? s
          .replace('expect(prices).not.toEqual', 'expect(prices).toEqual')
          .replace(
            'keeps the curated order on the control variation',
            'sorts catalog prices in ascending order',
          )
      : s
          .replace('expect(prices).toEqual', 'expect(prices).not.toEqual')
          .replace(
            'sorts catalog prices in ascending order',
            'keeps the curated order on the control variation',
          ),
  );
}
const control = 'http://127.0.0.1:3111',
  store = 'http://127.0.0.1:3110';
const git = (...args) =>
  execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const sha = () => git('rev-parse', 'HEAD');
const file = (name) => resolve(repo, name);
const save = (name, value) =>
  writeFileSync(resolve(root, name + '.json'), JSON.stringify(value, null, 2));
const load = (name) =>
  JSON.parse(readFileSync(resolve(root, name + '.json'), 'utf8'));
const edit = (path, fn) => {
  const p = file(path);
  const before = readFileSync(p, 'utf8');
  const after = fn(before);
  if (before === after) throw Error('Expected code edit absent: ' + path);
  writeFileSync(p, after);
};
const commit = (message) => {
  git('add', 'src');
  git(
    '-c',
    'user.name=Local Factory',
    '-c',
    'user.email=local-factory@example.invalid',
    'commit',
    '-m',
    message,
  );
};
const assert = (ok, message) => {
  if (!ok) throw Error(message);
};
async function json(url, options) {
  const r = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw Error('HTTP ' + r.status);
  return r.json();
}
async function stop(name) {
  const p = resolve(state, name + '.pid');
  if (!existsSync(p)) return;
  const pid = Number(readFileSync(p, 'utf8'));
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {}
  unlinkSync(p);
  await sleep(700);
}
async function start(name, args, port, env = {}) {
  await stop(name);
  // Refuse to replace an unrelated process on the selected port.
  const net = await import('node:net');
  await new Promise((yes, no) => {
    const s = net.createServer();
    s.once('error', no);
    s.listen(port, '127.0.0.1', () => s.close(yes));
  });
  const fs = await import('node:fs');
  const log = fs.openSync(resolve(root, name + '.log'), 'a');
  const child = spawn(process.execPath, args, {
    cwd: repo,
    env: { ...process.env, LD_SDK_KEY: '', LD_API_KEY: '', ...env },
    detached: true,
    stdio: ['ignore', log, log],
  });
  fs.closeSync(log);
  child.unref();
  writeFileSync(resolve(state, name + '.pid'), String(child.pid));
  for (let i = 0; i < 90; i++) {
    try {
      await json(
        `http://127.0.0.1:${port}/${name === 'control' ? 'flag' : 'api/status'}`,
      );
      return;
    } catch {}
    await sleep(500);
  }
  throw Error('Server did not start; inspect ' + root);
}
async function serve(port, dev = false) {
  await start(
    dev ? 'test' : 'store',
    [
      resolve(repo, 'node_modules/next/dist/bin/next'),
      dev ? 'dev' : 'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    port,
    { DEPLOY_SHA: sha(), LOCAL_RELEASE_URL: control },
  );
}
async function check(port, expected) {
  const data = await json(`http://127.0.0.1:${port}/api/products`);
  const prices = data.products.map((p) => p.basePrice);
  assert(
    prices.length >= 2 && prices.every(Number.isFinite),
    'No valid catalog prices',
  );
  const ascending = prices.every((n, i) => i === 0 || prices[i - 1] <= n);
  assert(ascending === expected, 'Catalog ordering did not match treatment');
  const ids = data.products.map((p) => p.id);
  if (existsSync(resolve(root, 'baseline.json')))
    assert(
      JSON.stringify([...ids].sort()) ===
        JSON.stringify([...load('baseline').ids].sort()),
      'Catalog membership changed',
    );
  return { ids, prices, ascending };
}
async function checkout() {
  const catalog = await check(3110, true);
  const order = await json(store + '/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ productId: catalog.ids[0], quantity: 2 }],
      customer: {
        name: 'Local Test',
        email: 'local@example.invalid',
        address: 'Test address',
        city: 'Test city',
        zip: '00000',
      },
    }),
  });
  assert(
    order.orderTotal === catalog.prices[0] * 2 &&
      order.orderId.startsWith('ORD-'),
    'Local checkout total incorrect',
  );
  return { orderId: order.orderId, orderTotal: order.orderTotal };
}
function review() {
  git('diff', '--check', 'baseline', 'HEAD');
  assert(
    git('diff', '--name-only', 'baseline', 'HEAD')
      .split('\n')
      .every((path) => [route, routeTest].includes(path)),
    'Unexpected files changed',
  );
  const diff = git('diff', 'baseline', 'HEAD', '--', route);
  assert(diff.includes('products.sort'), 'Missing implementation');
  assert(!diff.includes('+  eval('), 'Unsafe eval');
  return {
    revision: sha(),
    method: 'Deterministic source review; no AI reviewer',
    diff,
  };
}
async function build() {
  writeFileSync(
    resolve(root, step + '-tests.log'),
    execFileSync('npm', ['test', '--', '--testTimeout=30000'], {
      cwd: repo,
      env: { ...process.env, LD_SDK_KEY: '', LOCAL_RELEASE_URL: '' },
      stdio: 'pipe',
      timeout: 120000,
    }),
  );
  const output = execFileSync('npm', ['run', 'build'], {
    cwd: repo,
    stdio: 'pipe',
    timeout: 240000,
    env: { ...process.env, LD_SDK_KEY: '', LOCAL_RELEASE_URL: '' },
  });
  writeFileSync(resolve(root, step + '-build.log'), output);
}
const sort =
  '  products.sort((a, b) => calculatePrice(a) - calculatePrice(b));\n';
const flag =
  "  const localRelease = process.env.LOCAL_RELEASE_URL;\n  const localFlag = localRelease ? await (await fetch(localRelease + '/flag', { cache: 'no-store' })).json() : { enabled: false };\n  if (localFlag.enabled) products.sort((a, b) => calculatePrice(a) - calculatePrice(b));\n";
const metrics =
  "  if (process.env.LOCAL_RELEASE_URL) await fetch(process.env.LOCAL_RELEASE_URL + '/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sorted: products.every((p, i) => i === 0 || calculatePrice(products[i - 1]) <= calculatePrice(p)), count: products.length }) });\n";
if (action === 'execute') {
  switch (step) {
    case 'write-plan':
      await stop('store');
      await stop('control');
      await stop('test');
      execFileSync('git', ['clone', '--quiet', '--no-hardlinks', source, repo]);
      git('branch', 'baseline');
      git('checkout', '-b', 'local/catalog-sort');
      execFileSync('npm', ['ci', '--no-audit', '--no-fund'], {
        cwd: repo,
        stdio: 'pipe',
        timeout: 180000,
      });
      save('flag', { enabled: false });
      save('write-plan', {
        request: 'Show products from lowest to highest price',
        criteria: [
          'Treatment returns ascending prices',
          'Control retains original catalog order',
          'All products remain present',
          'Cleanup removes temporary local flag',
        ],
        revision: sha(),
      });
      await start(
        'control',
        [resolve(source, 'demo/local/service.mjs'), root, '3111'],
        3111,
      );
      await serve(3112, true);
      try {
        save('baseline', await check(3112, false));
      } finally {
        await stop('test');
      }
      break;
    case 'write-design':
      save(step, {
        revision: sha(),
        design:
          'Sort the response copy with calculatePrice, add a local flag, collect actual request outcomes, verify both paths, then remove the flag after successful controlled traffic.',
      });
      break;
    case 'write-code':
      edit(route, (s) =>
        s.replace(
          "  if (sortOrder === 'v1')",
          sort + "\n  if (sortOrder === 'v1')",
        ),
      );
      testExpectation(true);
      commit('Implement ascending catalog price order');
      save(step, {
        revision: sha(),
        diff: git('diff', 'baseline', 'HEAD', '--', route),
      });
      break;
    case 'write-review':
      save(step, review());
      break;
    case 'write-validate':
      await serve(3112, true);
      try {
        save(step, { revision: sha(), http: await check(3112, true) });
      } finally {
        await stop('test');
      }
      await build();
      break;
    case 'release-classify':
      save(step, {
        revision: sha(),
        risk: 'Low: presentation ordering only',
        required: [
          'both flag paths',
          'catalog membership',
          'HTTP success',
          'post-cleanup deployment',
        ],
        traffic: 'Controlled local HTTP probes, not customer traffic',
      });
      break;
    case 'release-flag':
      save('flag', { enabled: false });
      edit(route, (s) => s.replace(sort, flag));
      testExpectation(false);
      commit('Wire local release flag with control default');
      save(step, {
        revision: sha(),
        provider: 'Local file-backed flag service',
        enabled: false,
      });
      break;
    case 'release-instrument':
      edit(route, (s) =>
        s.replace('  return withShopper(', metrics + '\n  return withShopper('),
      );
      commit('Record actual catalog request outcomes');
      save(step, {
        revision: sha(),
        event: 'catalog response ordering and product count',
        provider: 'Local event collector',
      });
      break;
    case 'release-guard':
      save('pre-release-review', review());
      await build();
      await serve(3110);
      const probes = [];
      try {
        for (const enabled of [false, true]) {
          save('flag', { enabled });
          for (let i = 0; i < 5; i++) probes.push(await check(3110, enabled));
        }
        save(step, {
          revision: sha(),
          probes,
          traffic: '10 actual controlled requests, not customer statistics',
          outcome: 'passed',
        });
      } catch (e) {
        save('flag', { enabled: false });
        throw e;
      }
      break;
    case 'release-cleanup':
      assert(load('release-guard').outcome === 'passed', 'Guard required');
      edit(route, (s) => s.replace(flag, sort));
      testExpectation(true);
      commit('Remove temporary catalog sort flag');
      save('cleanup-review', review());
      await stop('store');
      await build();
      await serve(3110);
      unlinkSync(resolve(root, 'flag.json'));
      save(step, {
        revision: sha(),
        http: await check(3110, true),
        temporaryFlagRemoved: true,
      });
      break;
    case 'production':
      save(step, {
        revision: sha(),
        deployment: await json(store + '/api/status'),
        http: await check(3110, true),
        checkout: await checkout(),
        scope: 'Local deployment; no cloud release',
      });
      break;
    default:
      throw Error('Unknown stage');
  }
} else if (action === 'verify') {
  const evidence = load(step);
  assert(evidence.revision === sha(), 'Stale revision');
  const code = readFileSync(file(route), 'utf8');
  const reports = [];
  if (['write-validate', 'release-guard', 'release-cleanup'].includes(step)) {
    for (const kind of ['tests', 'build']) {
      const output = readFileSync(
        resolve(root, step + '-' + kind + '.log'),
        'utf8',
      );
      save(step + '-' + kind, { revision: sha(), exitCode: 0, output });
      reports.push({
        label: kind === 'tests' ? 'Test output' : 'Build output',
        url:
          control +
          '/runs/' +
          run +
          '/artifacts/' +
          step +
          '-' +
          kind +
          '.json',
      });
    }
  }
  if (step === 'write-plan')
    assert(evidence.criteria.length === 4, 'Acceptance criteria missing');
  if (step === 'write-design')
    assert(evidence.design.includes('both paths'), 'Design missing test plan');
  if (step === 'write-code')
    assert(
      git('diff', 'baseline', 'HEAD', '--', route).includes(sort.trim()),
      'No actual code diff',
    );
  if (step === 'write-review') review();
  if (step === 'write-validate') {
    await serve(3112, true);
    try {
      await check(3112, true);
    } finally {
      await stop('test');
    }
  }
  if (step === 'release-classify')
    assert(evidence.required.includes('both flag paths'), 'No release policy');
  if (step === 'release-flag') {
    assert(code.includes(flag), 'Flag not wired');
    assert(
      (await json(control + '/flag')).enabled === false,
      'Flag not default off',
    );
    await serve(3112, true);
    try {
      await check(3112, false);
      save('flag', { enabled: true });
      await check(3112, true);
    } finally {
      save('flag', { enabled: false });
      await stop('test');
    }
  }
  if (step === 'release-instrument') {
    assert(code.includes(metrics), 'Instrumentation not wired');
    await serve(3112, true);
    try {
      await check(3112, false);
      const events = readFileSync(resolve(root, 'events.ndjson'), 'utf8')
        .trim()
        .split('\n')
        .map(JSON.parse);
      assert(events.at(-1).sorted === false, 'No actual control event');
    } finally {
      await stop('test');
    }
  }
  if (step === 'release-guard') {
    assert(
      (await json(store + '/api/status')).version === sha(),
      'Wrong deployment SHA',
    );
    await check(3110, true);
    const events = readFileSync(resolve(root, 'events.ndjson'), 'utf8')
      .trim()
      .split('\n')
      .map(JSON.parse);
    assert(
      events.some((e) => !e.sorted) &&
        events.filter((e) => e.sorted).length >= 5,
      'Missing measured control and treatment traffic',
    );
  }
  if (step === 'release-cleanup' || step === 'production') {
    assert(
      !existsSync(resolve(root, 'flag.json')),
      'Temporary flag resource remains',
    );
    assert(
      !code.includes('localFlag') && !code.includes("'/flag'"),
      'Flag code remains',
    );
    assert(
      (await json(store + '/api/status')).version === sha(),
      'Wrong final SHA',
    );
    await check(3110, true);
  }
  if (step === 'production') await checkout();
  console.log(
    JSON.stringify({
      ok: true,
      run,
      step,
      revision: sha(),
      artifacts: [
        ...reports,
        {
          label:
            step === 'production' ? 'Local storefront' : 'Actual step output',
          url:
            step === 'production'
              ? store
              : control + '/runs/' + run + '/artifacts/' + step + '.json',
        },
      ],
    }),
  );
} else throw Error('Unknown action');
