import puppeteer from 'puppeteer';

(async () => {
  try {
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 }); // iPhone 12 Pro size
    
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
    await page.screenshot({ path: '/Users/kanokpraphakawilo/.gemini/antigravity/brain/b136ba1d-120a-4cee-a77b-7bed776d8eb7/home_screenshot.png' });
    
    // Click join toggle
    const buttons = await page.$$('button');
    for (const btn of buttons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text.includes('เข้าห้องเพื่อน')) {
        await btn.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: '/Users/kanokpraphakawilo/.gemini/antigravity/brain/b136ba1d-120a-4cee-a77b-7bed776d8eb7/home_join_screenshot.png' });
    
    await browser.close();
    console.log("Screenshots saved.");
  } catch (err) {
    console.error("SCRIPT ERROR:", err);
  }
})();
