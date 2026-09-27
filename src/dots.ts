import type { Page } from 'playwright';
import { DOTS_URL } from './browser.js';

export interface Source { title: string; url: string }
export interface Reply { content: string; images: string[]; sources: Source[] }

const ASSISTANT = '.assistant-message-item, [class*="assistant-message-item"]';

export async function assistantCount(page: Page): Promise<number> {
  return page.locator(ASSISTANT).count();
}

export async function extractReply(page: Page, fromIndex = 0): Promise<Reply> {
  return page.evaluate(({ selector, fromIndex }) => {
    const items = [...document.querySelectorAll<HTMLElement>(selector)];
    const current = items.slice(fromIndex);
    const text: string[] = [];
    const images = new Set<string>();
    const sources = new Map<string, { title: string; url: string }>();
    for (const item of current) {
      const card = item.querySelector<HTMLElement>('.assistant-message-card, [class*="assistant-message-card"]') ?? item;
      const value = card.innerText?.trim();
      if (value && value.length > 3 && !text.includes(value) && !/^\d+$/.test(value)) text.push(value);
      for (const img of item.querySelectorAll<HTMLImageElement>('img')) {
        const url = img.currentSrc || img.src || img.getAttribute('data-src') || '';
        if (url && (img.naturalWidth || img.width) > 50 && !/avatar|icon|data:image\/svg/i.test(url)) images.add(url);
      }
      for (const anchor of item.querySelectorAll<HTMLAnchorElement>('a[href]')) {
        const url = anchor.href;
        if (!/^https?:\/\//.test(url)) continue;
        if (!/(xiaohongshu\.com|rednote\.com|xhslink\.com)/i.test(url)) continue;
        sources.set(url, { title: anchor.innerText.trim() || anchor.getAttribute('title') || url, url });
      }
    }
    return { content: text.join('\n'), images: [...images], sources: [...sources.values()] };
  }, { selector: ASSISTANT, fromIndex });
}

export class DotsClient {
  constructor(private readonly page: Page) {}

  async ask(prompt: string, newChat = false, timeoutMs = 180_000): Promise<Reply> {
    if (!prompt.trim()) throw new Error('Prompt is empty');
    if (newChat) await this.page.goto(DOTS_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const beforeCount = await assistantCount(this.page);
    const input = this.page.locator('textarea[placeholder*="点点"], textarea[placeholder*="消息"], textarea, .ProseMirror, [contenteditable="true"]').first();
    await input.waitFor({ state: 'visible', timeout: 15_000 });
    await input.fill(prompt);

    // Dots currently submits from the arrow button; Enter is a fallback for older layouts.
    const send = this.page.locator('button[aria-label*="发送"], button[title*="发送"], button:has(svg[class*="arrow"])').first();
    if (await send.isVisible().catch(() => false)) await send.click();
    else await input.press('Enter');

    const deadline = Date.now() + timeoutMs;
    let last = '';
    let stable = 0;
    let changed: Reply | undefined;
    while (Date.now() < deadline) {
      await this.page.waitForTimeout(1_500);
      const current = await extractReply(this.page, beforeCount);
      const signature = JSON.stringify(current);
      if (!current.content && !current.images.length) continue;
      changed = current;
      if (signature === last) stable += 1;
      else { stable = 0; last = signature; }
      if (stable >= 2) return current;
    }
    if (changed) return changed;
    throw new Error(`Dots did not reply within ${timeoutMs} ms`);
  }
}
