import { chromium, type BrowserContext, type Page } from 'playwright';
import { resolve } from 'node:path';

export const DOTS_URL = 'https://dots.ai/chat/home/new';
const profilePath = resolve(process.cwd(), '.browser_data');

export class DotsBrowser {
  private context?: BrowserContext;
  page?: Page;

  async start(headless: boolean): Promise<Page> {
    this.context = await chromium.launchPersistentContext(profilePath, {
      channel: 'chrome',
      headless,
      viewport: { width: 1280, height: 900 },
    });
    this.page = this.context.pages()[0] ?? await this.context.newPage();
    await this.page.goto(DOTS_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    return this.page;
  }

  async isLoggedIn(timeoutMs = 15_000): Promise<boolean> {
    if (!this.page) return false;
    const deadline = Date.now() + timeoutMs;
    do {
      try {
        const loggedIn = await this.page.evaluate(() => {
          const token = localStorage.getItem('auth_token');
          const input = document.querySelector('textarea[placeholder*="点点"], textarea[placeholder*="消息"]');
          return Boolean(token && input);
        });
        if (loggedIn) return true;
      } catch {
        // The page can navigate while its login state is settling.
      }
      if (Date.now() >= deadline) return false;
      await this.page.waitForTimeout(500);
    } while (true);
  }

  async diagnosticState(): Promise<Record<string, unknown>> {
    if (!this.page || !this.context) throw new Error('Browser is not started');
    const page = this.page;
    const cookies = await this.context.cookies('https://dots.ai');
    const dom = await page.evaluate(() => ({
      authTokenPresent: Boolean(localStorage.getItem('auth_token')),
      authUserIdPresent: Boolean(localStorage.getItem('auth_user_id')),
      textareaCount: document.querySelectorAll('textarea').length,
      messageInputCount: document.querySelectorAll('textarea[placeholder*="点点"], textarea[placeholder*="消息"]').length,
      loginTextVisible: /扫码|手机号登录|获取验证码/.test(document.body.innerText),
    }));
    const url = new URL(page.url());
    return {
      origin: url.origin,
      route: url.pathname.replace(/[a-f0-9]{16,}/gi, '<id>'),
      acwCookiePresent: cookies.some(cookie => cookie.name === 'acw_tc'),
      ...dom,
    };
  }

  async close(): Promise<void> {
    await this.context?.close();
    this.context = undefined;
    this.page = undefined;
  }
}
