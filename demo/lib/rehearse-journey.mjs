import { setTimeout } from 'node:timers/promises';
import { runEvents } from './run-events.mjs';
const scenario = process.argv[2] || 'express-checkout';
const delay = Number(process.argv[3] ?? 2) * 1000;
if (!Number.isFinite(delay) || delay < 0)
  throw new Error('Invalid step duration');
const { emit } = runEvents(scenario);
const steps = [
  ['Plan', ['write-plan']],
  ['Design', ['write-design']],
  ['Code', ['write-code']],
  ['Review', ['autofactory-code-reviewer']],
  ['Validate', ['autofactory-flag-testing']],
  ['Classify', ['autofactory-research-planner']],
  ['Flag', ['autofactory-flag-implementer']],
  ['Instrument', ['autofactory-metrics-author']],
  ['Guard release', ['ld-guarded-release']],
  ['Cleanup', ['release-cleanup']],
  ['Production', ['ext-deploy', 'ld-outcome']],
];
emit({ t: 'run-start' });
emit({
  t: 'mode',
  mode: process.env.FACTORY_SIMULATION_REASON ? 'simulation' : 'rehearsal',
});
for (const [title, keys] of steps) {
  console.log(`Rehearsal: ${title}`);
  emit({
    t: 'log',
    text: `Simulating ${title}; no external work is performed.`,
  });
  for (const key of keys) {
    emit({ t: 'node', key, status: 'running' });
    emit({
      t: 'resource',
      kind: 'run',
      key,
      station: key,
      label: 'Source',
      url: 'https://github.com/gyeutter-launchdarkly/factory-ecom-example/blob/main/demo/lib/rehearse-journey.mjs',
    });
  }
  await setTimeout(delay);
  for (const key of keys) emit({ t: 'node', key, status: 'done' });
}
emit({ t: 'run-done' });
console.log('Rehearsal complete: all eleven steps.');
