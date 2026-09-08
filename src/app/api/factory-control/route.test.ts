import { beforeEach, describe, expect, it, vi } from 'vitest';
const fs = vi.hoisted(() => ({
  readFile: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
}));
vi.mock('node:fs/promises', () => fs);
vi.mock('@/lib/demo-pack', () => ({
  demoPack: async () => ({ id: 'default' }),
  scenarioBelongsToPack: () => true,
}));
import { POST } from './route';
const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/factory-control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
const run = {
  action: 'run',
  mode: 'factory',
  scenario: 'express-checkout',
  strategy: 'new',
  pack: 'default',
};
beforeEach(() => {
  vi.clearAllMocks();
  fs.readFile.mockRejectedValue(new Error('absent'));
  fs.mkdir.mockResolvedValue(undefined);
  fs.writeFile.mockResolvedValue(undefined);
  fs.rename.mockResolvedValue(undefined);
});
describe('controller requests', () => {
  it('refuses to queue work without a live controller', async () => {
    expect((await post(run)).status).toBe(503);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
  it.each([
    null,
    {},
    { ...run, mode: 'shell' },
    { ...run, mode: undefined },
    { ...run, scenario: '../secret' },
  ])('rejects malformed settings', async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
  it('sends the chosen Factory App mode atomically with the run', async () => {
    fs.readFile.mockResolvedValue(JSON.stringify({ at: Date.now() }));
    expect((await post(run)).status).toBe(200);
    expect(JSON.parse(fs.writeFile.mock.calls[0][1])).toMatchObject(run);
    expect(fs.rename).toHaveBeenCalledOnce();
  });
  it('rejects an unsafe release repository without writing a request', async () => {
    fs.readFile.mockResolvedValue(JSON.stringify({ at: Date.now() }));
    expect(
      (
        await post({
          action: 'observe-release',
          runId: 'test',
          repo: '../repo',
          pr: 1,
          scenario: 'express-checkout',
        })
      ).status,
    ).toBe(400);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});
