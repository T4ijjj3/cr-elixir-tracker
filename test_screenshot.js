const puppeteer = require('puppeteer');
(async () => {
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const browser = await puppeteer.launch({args: ['--no-sandbox']});
  const page = await browser.newPage();
  await page.setViewport({width: 1200, height: 800});
  await page.goto('http://localhost:8080');
  
  // Start and pick Mineiro + Valquiria
  await page.click('#btnStart');
  await sleep(500);
  await page.evaluate(() => document.querySelector('.card-btn[data-cost="3"]').click());
  await sleep(500);
  await page.evaluate(() => document.querySelector('#typeTroop').click());
  await sleep(500);
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('.identify-grid-btn'));
    const target = buttons.find(btn => {
      const name = btn.querySelector('.card-grid-name')?.textContent || '';
      return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('mineiro');
    }) || buttons[0];
    if (target) target.click();
  });
  await sleep(500);
  
  await page.evaluate(() => document.querySelector('.card-btn[data-cost="4"]').click());
  await sleep(500);
  await page.evaluate(() => document.querySelector('#typeTroop').click());
  await sleep(500);
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('.identify-grid-btn'));
    const target = buttons.find(btn => {
      const name = btn.querySelector('.card-grid-name')?.textContent || '';
      const norm = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return norm.includes('valquiria');
    }) || buttons[0];
    if (target) target.click();
  });
  await sleep(500);
  
  await page.screenshot({path: '/home/t4i/.gemini/antigravity/brain/075d88f5-f9a1-441b-8300-882d34d04b91/verified_slot_art.png'});
  await browser.close();
})();
