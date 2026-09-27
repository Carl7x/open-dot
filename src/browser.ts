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

  async isLoggedIn(): Promise<boolean> {
    if (!this.page) return false;
    return this.page.evaluate(() => {
      const token = localStorage.getItem('auth_token');
      const input = document.querySelector('textarea[placeholder*="点点"], textarea[placeholder*="消息"]');
      return Boolean(token && input);
    });
  }

  async close(): Promise<void> {
    await this.context?.close();
    this.context = undefined;
    this.page = undefined;
  }
}
