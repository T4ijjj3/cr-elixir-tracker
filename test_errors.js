const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({args:['--no-sandbox']});
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.stack || String(err)));
    await page.goto('http://localhost:8080');
    console.log('DOM OK?', await page.evaluate(() => !!document.getElementById('btnStart')));
    console.log('ERRORS:', JSON.stringify(errors));
    await browser.close();
})();
