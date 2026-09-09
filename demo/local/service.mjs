import http from 'node:http';
import { readFile, appendFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
const [root, port] = process.argv.slice(2);
http
  .createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && path === '/flag') {
        res.end(await readFile(resolve(root, 'flag.json'), 'utf8'));
        return;
      }
      if (req.method === 'POST' && path === '/events') {
        let body = '';
        for await (const part of req) {
          body += part;
          if (body.length > 8192) throw Error('Too large');
        }
        const event = JSON.parse(body);
        if (typeof event.sorted !== 'boolean' || !Number.isFinite(event.count))
          throw Error('Invalid event');
        await appendFile(
          resolve(root, 'events.ndjson'),
          JSON.stringify({ ...event, at: Date.now() }) + '\n',
        );
        res.end('{}');
        return;
      }
      const match = path.match(
        /^\/runs\/([a-zA-Z0-9_-]+)\/artifacts\/([a-z-]+\.json)$/,
      );
      if (req.method === 'GET' && match) {
        res.end(
          await readFile(resolve(dirname(root), match[1], match[2]), 'utf8'),
        );
        return;
      }
      res.statusCode = 404;
      res.end('{}');
    } catch {
      res.statusCode = 404;
      res.end('{}');
    }
  })
  .listen(Number(port), '127.0.0.1');
