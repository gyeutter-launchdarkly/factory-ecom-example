import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  LIVE_STEPS,
  executeSequence,
  verifiedReceipt,
  validateLiveConfig,
  command,
} from '../../demo/lib/live-sequence.mjs';
const revision = 'a'.repeat(40);
const config = () => ({
  version: 1,
  workspace: '.',
  repo: 'test/demo',
  steps: Object.fromEntries(
    LIVE_STEPS.map((key) => [
      key,
      {
        execute: ['execute', key],
        verify: ['verify', key],
        timeoutSeconds: 10,
      },
    ]),
  ),
});
const receipt = (step: string, run = 'test-run') =>
  JSON.stringify({
    ok: true,
    run,
    step,
    revision,
    artifacts: [
      { url: 'https://example.com/evidence', label: 'Verified artifact' },
    ],
  });
describe('live execution sequencing', () => {
  it('waits for each real subprocess and independent verifier before starting the next', async () => {
    const dir = await mkdtemp(`${tmpdir()}/live-sequence-`);
    try {
      const adapter = `${dir}/adapter.cjs`;
      await writeFile(
        adapter,
        String.raw`const fs = require('node:fs'); const [action, key, log] = process.argv.slice(2);
const prior = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
if (action === 'verify' && !prior.endsWith('execute:' + key + '\n')) process.exit(1);
fs.appendFileSync(log, action + ':' + key + '\n');
if (action === 'verify') console.log(JSON.stringify({ok:true,run:process.env.FACTORY_RUN_ID,step:key,revision:'${revision}',artifacts:[{url:'https://example.com/'+key,label:'Evidence'}]}));`,
      );
      const cfg = config();
      for (const key of LIVE_STEPS)
        for (const action of ['execute', 'verify'] as const)
          cfg.steps[key][action] = [
            process.execPath,
            adapter,
            action,
            key,
            `${dir}/calls`,
          ];
      const events: any[] = [];
      const result = await executeSequence({
        config: cfg,
        run: 'test-run',
        scenario: 'demo',
        mode: 'local',
        root: `${dir}/receipts`,
        emit: (e: any) => events.push(e),
        signal: undefined,
      });
      expect(result).toHaveLength(11);
      expect(
        (await readFile(`${dir}/calls`, 'utf8')).trim().split('\n'),
      ).toEqual(
        LIVE_STEPS.flatMap((key) => [`execute:${key}`, `verify:${key}`]),
      );
      expect(
        events
          .filter((e) => e.t === 'node' && e.status === 'done')
          .map((e) => e.key),
      ).toEqual(['live-sequence-v1', ...LIVE_STEPS]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  for (const failure of ['execute', 'verify'])
    it(`stops on ${failure} failure and does not run later tasks`, async () => {
      const root = await mkdtemp(`${tmpdir()}/live-stop-`);
      const calls: string[] = [];
      const events: any[] = [];
      try {
        await expect(
          executeSequence({
            config: config(),
            run: 'test-run',
            scenario: 'demo',
            mode: 'hosted',
            root,
            emit: (e: any) => events.push(e),
            signal: undefined,
            invoke: async ([action, key]: string[]) => {
              calls.push(`${action}:${key}`);
              if (key === 'write-design' && action === failure)
                throw new Error('failure');
              return receipt(key);
            },
          }),
        ).rejects.toThrow('failure');
        expect(calls.some((call) => call.includes('write-code'))).toBe(false);
        expect(events).toContainEqual({
          t: 'node',
          key: 'write-design',
          status: 'failed',
        });
        expect(
          events.some((e) => e.key === 'write-design' && e.status === 'done'),
        ).toBe(false);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  it('requires all adapters before starting', () => {
    const cfg = config();
    delete cfg.steps.production;
    expect(() => validateLiveConfig(cfg)).toThrow('production');
  });
  it('rejects stale, unsuccessful, and unlinked verification', () => {
    expect(() =>
      verifiedReceipt(
        receipt('write-plan', 'old-run'),
        'test-run',
        'write-plan',
      ),
    ).toThrow();
    expect(() =>
      verifiedReceipt(receipt('write-design'), 'test-run', 'write-plan'),
    ).toThrow();
    expect(() =>
      verifiedReceipt(
        receipt('write-plan').replace('"ok":true', '"ok":false'),
        'test-run',
        'write-plan',
      ),
    ).toThrow();
    expect(() =>
      verifiedReceipt(
        receipt('write-plan').replace(
          'https://example.com/evidence',
          'javascript:alert(1)',
        ),
        'test-run',
        'write-plan',
      ),
    ).toThrow();
  });
  it('kills a timed-out subprocess', async () => {
    await expect(
      command([process.execPath, '-e', 'setInterval(()=>{},1000)'], {
        cwd: '.',
        env: process.env,
        timeoutSeconds: 0.05,
        signal: undefined,
      }),
    ).rejects.toThrow('timed out');
  });
});

it('refuses a review of a different code revision', async () => {
  const root = await mkdtemp(`${tmpdir()}/live-revision-`);
  const calls: string[] = [];
  try {
    await expect(
      executeSequence({
        config: config(),
        run: 'test-run',
        scenario: 'demo',
        mode: 'hosted',
        root,
        emit: () => {},
        signal: undefined,
        invoke: async ([action, key]: string[]) => {
          calls.push(key);
          return key === 'write-review'
            ? receipt(key).replace(revision, 'b'.repeat(40))
            : receipt(key);
        },
      }),
    ).rejects.toThrow('different revision');
    expect(calls).not.toContain('write-validate');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
