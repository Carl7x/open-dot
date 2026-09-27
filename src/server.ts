import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { Reply } from './dots.js';

type Message = { role: string; content: string };
type CompletionRequest = { model?: string; messages?: Message[]; stream?: boolean; user?: string };
export type Ask = (prompt: string, newChat: boolean) => Promise<Reply>;

export function completionPayload(prompt: string, reply: Reply, model = 'dots-ai') {
  const content = reply.content + reply.images.map(url => `\n\n![image](${url})`).join('');
  return {
    id: `chatcmpl-${randomUUID().replaceAll('-', '').slice(0, 12)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1_000),
    model,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    sources: reply.sources,
  };
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<CompletionRequest> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > 1_000_000) throw new Error('Request body too large');
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as CompletionRequest;
}

export function makeServer(ask: Ask) {
  let pending: Promise<unknown> = Promise.resolve();
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = pending.then(fn, fn);
    pending = next.catch(() => undefined);
    return next;
  }

  return createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/health') {
      json(res, 200, { status: 'ok' });
      return;
    }
    if (req.method === 'GET' && path === '/v1/models') {
      json(res, 200, { object: 'list', data: [{ id: 'dots-ai', object: 'model', created: 0, owned_by: 'dots' }] });
      return;
    }
    if (req.method !== 'POST' || path !== '/v1/chat/completions') {
      json(res, 404, { error: { message: 'Not found' } });
      return;
    }
    let body: CompletionRequest;
    try { body = await readJson(req); }
    catch (error) {
      json(res, 400, { error: { message: error instanceof Error ? error.message : 'Invalid JSON' } });
      return;
    }
    const prompt = [...(Array.isArray(body.messages) ? body.messages : [])]
      .reverse().find(m => m?.role === 'user' && typeof m.content === 'string')?.content.trim();
    if (!prompt) {
      json(res, 400, { error: { message: 'No user message found' } });
      return;
    }
    if (body.model && body.model !== 'dots-ai') {
      json(res, 400, { error: { message: 'Only dots-ai is supported' } });
      return;
    }
    try {
      const reply = await serial(() => ask(prompt, body.user === 'new'));
      const result = completionPayload(prompt, reply);
      if (!body.stream) { json(res, 200, result); return; }
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' });
      const common = { id: result.id, object: 'chat.completion.chunk', created: result.created, model: result.model };
      res.write(`data: ${JSON.stringify({ ...common, choices: [{ index: 0, delta: { content: result.choices[0].message.content }, finish_reason: null }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ ...common, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
      res.end('data: [DONE]\n\n');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Dots request failed';
      json(res, /timeout|within/i.test(message) ? 504 : 502, { error: { message } });
    }
  });
}
