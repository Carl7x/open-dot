#!/usr/bin/env node
import { DotsBrowser } from './browser.js';
import { DotsClient } from './dots.js';
import { makeServer } from './server.js';

const [command, ...args] = process.argv.slice(2);
const browser = new DotsBrowser();

async function main(): Promise<void> {
  if (command === 'login') {
    await browser.start(false);
    console.log('请在弹出的浏览器中登录 dots.ai。登录态保存在本项目的 .browser_data/。');
    const deadline = Date.now() + 300_000;
    while (Date.now() < deadline) {
      if (await browser.isLoggedIn(0)) {
        console.log('已检测到登录。');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 2_000));
    }
    throw new Error('5 分钟内未检测到登录；请重试 npm run login');
  }

  if (command === 'ask') {
    const json = args.includes('--json');
    const newChat = args.includes('--new');
    const prompt = args.filter(arg => !arg.startsWith('--')).join(' ').trim();
    if (!prompt) throw new Error('用法: npm run ask -- "问题" [--new] [--json]');
    await browser.start(process.env.HEADLESS !== '0');
    if (!await browser.isLoggedIn()) throw new Error('尚未登录；先运行 npm run login');
    const reply = await new DotsClient(browser.page!).ask(prompt, newChat, Number(process.env.DOTS_TIMEOUT_MS) || 180_000);
    if (json) console.log(JSON.stringify(reply, null, 2));
    else {
      console.log(reply.content);
      for (const source of reply.sources) console.log(`\n- ${source.title}: ${source.url}`);
    }
    return;
  }

  if (command === 'doctor') {
    await browser.start(process.env.HEADLESS !== '0');
    const loggedIn = await browser.isLoggedIn();
    console.log(JSON.stringify({ loggedIn, ...await browser.diagnosticState() }, null, 2));
    return;
  }

  if (command === 'serve') {
    await browser.start(process.env.HEADLESS !== '0');
    if (!await browser.isLoggedIn()) throw new Error('尚未登录；先运行 npm run login');
    const client = new DotsClient(browser.page!);
    const server = makeServer((prompt, newChat) => client.ask(prompt, newChat, Number(process.env.DOTS_TIMEOUT_MS) || 180_000));
    const port = Number(process.env.PORT) || 8000;
    const host = process.env.HOST || '127.0.0.1';
    server.listen(port, host, () => console.log(`dots2api-ts: http://${host}:${port}`));
    await new Promise<void>(resolve => {
      const stop = () => server.close(() => resolve());
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    });
    return;
  }

  console.log('用法: open-dot login | doctor | ask "问题" [--new] [--json] | serve');
  process.exitCode = 2;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => browser.close());
