import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { makeServer } from './server.js';

const calls: Array<{ prompt: string; newChat: boolean }> = [];
const server = makeServer(async (prompt, newChat) => {
  calls.push({ prompt, newChat });
  return { content: '测试回答', images: [], sources: [{ title: '笔记', url: 'https://www.xiaohongshu.com/explore/123' }] };
});
let base: string;

before(async () => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server address');
  base = `http://127.0.0.1:${address.port}`;
});
after(() => new Promise<void>(resolve => server.close(() => resolve())));

test('non-streaming completion returns answer and sources', async () => {
  const response = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'dots-ai', user: 'new', messages: [{ role: 'user', content: '问题' }] }),
  });
  assert.equal(response.status, 200);
  const data = await response.json() as any;
  assert.equal(data.choices[0].message.content, '测试回答');
  assert.equal(data.sources[0].title, '笔记');
  assert.deepEqual(calls.at(-1), { prompt: '问题', newChat: true });
});

test('streaming completion ends with DONE', async () => {
  const response = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: '问题' }] }),
  });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /data: \[DONE\]/);
});

test('bad request is rejected before browser call', async () => {
  const beforeCalls = calls.length;
  const response = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  assert.equal(response.status, 400);
  assert.equal(calls.length, beforeCalls);
});
