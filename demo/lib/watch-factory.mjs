#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { factoryChecks } from './factory-checks.mjs';
import { runEvents } from './run-events.mjs';
const [scenario, repo, pr] = process.argv.slice(2);
if (
  !scenario ||
  !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repo || '') ||
  !/^\d+$/.test(pr || '')
)
  throw new Error('usage: watch-factory.mjs <scenario> <owner/repo> <pr>');
const { emit } = runEvents(scenario);
const env = { ...process.env };
delete env.GH_TOKEN;
delete env.GITHUB_TOKEN;
const gh = (path) =>
  JSON.parse(
    execFileSync('gh', ['api', path], {
      env,
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
const allChecks = (sha) => {
  let page = 1,
    result = [],
    total = Infinity;
  while (result.length < total) {
    const data = gh(
      `repos/${repo}/commits/${sha}/check-runs?per_page=100&page=${page++}`,
    );
    total = data.total_count;
    if (
      !Array.isArray(data.check_runs) ||
      (!data.check_runs.length && result.length < total)
    )
      throw new Error('Incomplete check results');
    result.push(...data.check_runs);
  }
  return result;
};
const url = `https://github.com/${repo}/pull/${pr}`;
emit({ t: 'run-start' });
emit({ t: 'mode', mode: 'factory' });
emit({ t: 'repo', repo });
emit({ t: 'pr', number: Number(pr) });
emit({
  t: 'resource',
  kind: 'pr',
  key: `#${pr}`,
  url,
  station: 'ext-pull-request',
});
emit({
  t: 'resource',
  kind: 'commits',
  key: `#${pr}`,
  url: `${url}/commits`,
  station: 'ext-coding-agent',
});
const deadline =
  Date.now() + (Number(process.env.FACTORY_WATCH_SECS) || 900) * 1000;
let head = '',
  previous = '',
  errors = 0,
  complete = false;
try {
  while (Date.now() < deadline) {
    emit({ t: 'heartbeat' });
    try {
      const pull = gh(`repos/${repo}/pulls/${pr}`);
      if (pull.state === 'closed' && !pull.merged)
        throw new Error('PR closed without merging');
      if (head !== pull.head.sha) {
        head = pull.head.sha;
        emit({ t: 'head', sha: head });
      }
      const result = factoryChecks(
        allChecks(pull.head.sha),
        process.env.FACTORY_CHECK_APP_SLUG,
      );
      // The app may push again while the checks are loading: never accept stale-head success.
      if (gh(`repos/${repo}/pulls/${pr}`).head.sha !== pull.head.sha) continue;
      const snapshot = JSON.stringify({ sha: pull.head.sha, result });
      if (snapshot !== previous) {
        previous = snapshot;
        emit({
          t: 'node',
          key: 'factory-validation',
          status: result.status,
          tags: { head_sha: pull.head.sha },
        });
        for (const check of result.checks) {
          if (check.html_url)
            emit({
              t: 'resource',
              kind: 'run',
              key: String(check.id),
              url: check.html_url,
              label: check.name,
              station: 'factory-validation',
            });
          if (
            check.status === 'completed' &&
            !['neutral', 'skipped'].includes(check.conclusion)
          )
            emit({
              t: 'check',
              key: 'factory-validation',
              name: check.name,
              ok: check.conclusion === 'success',
              detail: `head ${pull.head.sha}: ${check.conclusion}`,
            });
          if (
            /review/i.test(check.name) &&
            check.status === 'completed' &&
            ['success', 'failure'].includes(check.conclusion)
          ) {
            emit({ t: 'verdict', approved: check.conclusion === 'success' });
            if (check.html_url)
              emit({
                t: 'resource',
                kind: 'verdict',
                key: String(check.id),
                url: check.html_url,
              });
          }
        }
        console.log(
          `Factory: ${result.status} · head ${pull.head.sha.slice(0, 7)} · ${result.checks.length} matching checks`,
        );
      }
      errors = 0;
      if (result.status === 'failed')
        throw new Error(
          'Factory checks failed; inspect the linked check results',
        );
      if (result.status === 'done') {
        emit({
          t: 'note',
          level: 'info',
          text: 'Factory checks passed on the current PR head. Merge, deployment, and release still require their own evidence.',
        });
        complete = true;
        break;
      }
      if (pull.state === 'closed')
        throw new Error(
          'PR merged before successful Factory checks were observed',
        );
    } catch (error) {
      const status = error.stderr?.toString() ?? '';
      if (
        /HTTP (401|403|404)/.test(status) ||
        /PR closed|PR merged|Factory checks failed/.test(error.message) ||
        ++errors >= 3
      )
        throw error;
      emit({
        t: 'note',
        level: 'warning',
        text: 'GitHub observation interrupted; retrying without changing observed results.',
      });
    }
    await new Promise((resolve) =>
      setTimeout(resolve, Number(process.env.FACTORY_POLL_MS) || 10000),
    );
  }
  if (!complete)
    throw new Error(
      'Timed out waiting for successful Factory checks. Confirm the App installation and FACTORY_CHECK_APP_SLUG.',
    );
} catch (error) {
  emit({ t: 'note', level: 'error', text: error.message });
  console.error(error.message);
  process.exitCode = 1;
} finally {
  emit({ t: 'run-done' });
}
