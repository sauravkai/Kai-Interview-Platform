import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER_CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE_ERROR:', err.message));

  await page.goto('http://localhost:3001/interviewer/dashboard', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1500);

  const buttons = await page.locator('button').allTextContents();
  console.log('button texts sample', buttons.filter((text) => text && text.includes('Schedule')).slice(0, 20));

  const btn = page.locator('button').filter({ hasText: 'Schedule New Interview' }).first();
  console.log('btn count', await btn.count());
  if (await btn.count()) {
    await btn.click({ force: true });
    await page.waitForTimeout(1500);
    console.log('modal count', await page.locator('text=Schedule Candidate Interview').count());
    console.log('form count', await page.locator('form').count());
    const body = await page.locator('body').innerText();
    console.log('contains schedule modal text?', body.includes('Schedule Candidate Interview'));
    console.log('body short', body.slice(0, 500));
  }

  await browser.close();
})();
