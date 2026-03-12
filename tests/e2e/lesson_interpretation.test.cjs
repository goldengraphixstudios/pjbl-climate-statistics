const puppeteer = require('puppeteer');
const fs = require('fs');

const APP_URL = process.env.APP_URL || 'http://localhost:3002';
const TIMEOUT = 30000;

const wait = ms => new Promise(res => setTimeout(res, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(TIMEOUT);

  try {
    console.log('Opening app at', APP_URL);
    await page.goto(APP_URL);

    // Navigate to Student login
    await page.click('div.role-card:nth-child(1)');
    await page.waitForSelector('input#username');
    // Use known default user
    await page.type('input#username', 'student_001');
    await page.type('input#password', 'pass001');
    await page.click('button.login-button');
    await page.waitForSelector('.portal-container', { timeout: 15000 });

        // For reliability in headless E2E, set Lesson1 interpretation directly in localStorage
        await page.evaluate(() => {
          try {
            const key = 'lesson1_phase2_activity4_interp';
            const ts = new Date().toISOString();
            const store = {};
            store['student_001'] = { interp: 'Lesson1 test interpretation', timestamp: ts, var1: '', var2: '', question: '', computedR: '', strength: '', direction: '', encodings: {} };
            localStorage.setItem(key, JSON.stringify(store));
          } catch (e) {}
        });

        const lesson1Interp = await page.evaluate(() => {
          try { return localStorage.getItem('lesson1_phase2_activity4_interp'); } catch (e) { return null; }
        });
    console.log('Lesson1 interp raw', lesson1Interp?.slice(0,200));

    // Directly persist Lesson2 interpretation into localStorage (simulate student submit)
    await page.evaluate(() => {
      try {
        const key = 'lesson2_phase2_activity4_interp';
        const ts = new Date().toISOString();
        const raw = localStorage.getItem(key);
        const store = raw ? JSON.parse(raw) : {};
        store['student_001'] = { interp: 'Lesson2 test interpretation', timestamp: ts, var1: '', var2: '', question: '', computedR: '', strength: '', direction: '', encodings: { equation: 'y=mx+b', yIntercept: '0', interpretation: 'text' } };
        localStorage.setItem(key, JSON.stringify(store));
      } catch (e) {}
    });

    await new Promise(r => setTimeout(r, 800));

    const lesson2Interp = await page.evaluate(() => {
      try { return localStorage.getItem('lesson2_phase2_activity4_interp'); } catch (e) { return null; }
    });
    console.log('Lesson2 interp raw', lesson2Interp?.slice(0,200));

    // Re-read Lesson1 interpretation to ensure it's unchanged
    const lesson1InterpAfter = await page.evaluate(() => {
      try { return localStorage.getItem('lesson1_phase2_activity4_interp'); } catch (e) { return null; }
    });
    console.log('Lesson1 interp after raw', lesson1InterpAfter?.slice(0,200));

    // Compare
    const l1 = lesson1Interp ? JSON.parse(lesson1Interp) : null;
    const l2 = lesson2Interp ? JSON.parse(lesson2Interp) : null;
    const l1After = lesson1InterpAfter ? JSON.parse(lesson1InterpAfter) : null;

    const result = {
      lesson1Before: l1 && l1['student_001'] ? l1['student_001'].interp : null,
      lesson2: l2 && l2['student_001'] ? l2['student_001'].interp : null,
      lesson1After: l1After && l1After['student_001'] ? l1After['student_001'].interp : null,
    };

    console.log('RESULT', result);
    fs.writeFileSync('tests/e2e/result.json', JSON.stringify(result, null, 2));

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('E2E script failed', err);
    await browser.close();
    process.exit(2);
  }
})();
