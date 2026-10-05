// Renders the clickgroup.site homepage slider images from slides.html
//   node render.js            → out/NN-<id>-character.webp + out/NN-<id>-background.jpg + out/preview/*.jpg
//   node render.js preview    → only re-shoot the previews (uses the files already in out/)
//   node render.js product    → only the /admin/products image (out/product-restaurant-pos.jpg) + its previews
const { chromium } = require('../promo-video/node_modules/playwright-core');
const sharp = require('../../node_modules/sharp');
const fs = require('fs');
const path = require('path');

const SLIDES = ['all-in-one', 'pos', 'kds', 'qr-menu', 'delivery', 'reports'];
const OUT = path.join(__dirname, 'out');
const PREV = path.join(OUT, 'preview');
const fileUrl = (f, q = '') => 'file:///' + path.join(__dirname, f).replace(/\\/g, '/') + q;
const tag = (i, id) => `${String(i + 1).padStart(2, '0')}-${id}`;

async function ready(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all([...document.images].map(i => i.complete || new Promise(r => (i.onload = i.onerror = r)))));
}

(async () => {
  const mode = process.argv[2];
  fs.mkdirSync(PREV, { recursive: true });
  const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--hide-scrollbars'] });

  // Product card image for /admin/products: 1600×1000 scene at 1.25x → 2000×1250 JPG
  if (!mode || mode === 'product') {
    const page = await browser.newPage({ viewport: { width: 2000, height: 1080 }, deviceScaleFactor: 1.25 });
    await page.goto(fileUrl('slides.html'), { waitUntil: 'load' });
    await ready(page);
    const png = await (await page.$('#product-restaurant-pos')).screenshot();
    const file = path.join(OUT, 'product-restaurant-pos.jpg');
    await sharp(png).jpeg({ quality: 86, mozjpeg: true }).toFile(file);
    console.log(file, (fs.statSync(file).size / 1024).toFixed(0) + ' KB');
    await page.close();
    // the card at laptop / tablet / phone width, Kurdish (site default) and English
    for (const v of [{ n: 'desktop', w: 1440, dsf: 1 }, { n: 'tablet', w: 820, dsf: 1 }, { n: 'mobile', w: 390, dsf: 2 }]) {
      const pv = await browser.newPage({ viewport: { width: v.w, height: 900 }, deviceScaleFactor: v.dsf });
      for (const ku of v.n === 'desktop' ? [1, 0] : [1]) {
        await pv.goto(fileUrl('product-preview.html', `?ku=${ku}`), { waitUntil: 'load' });
        await ready(pv);
        await (await pv.$('#card')).screenshot({ path: path.join(PREV, `product-${v.n}${ku ? '' : '-en'}.jpg`), type: 'jpeg', quality: 82 });
      }
      await pv.close();
    }
  }
  if (mode === 'product') { await browser.close(); return; }

  if (mode !== 'preview') {
    // Character images: 1000×1000 CSS px at 1.6x → 1600×1600, transparent
    const page = await browser.newPage({ viewport: { width: 2000, height: 1080 }, deviceScaleFactor: 1.6 });
    await page.goto(fileUrl('slides.html'), { waitUntil: 'load' });
    await ready(page);
    for (const [i, id] of SLIDES.entries()) {
      const png = await (await page.$(`#char-${id}`)).screenshot({ omitBackground: true });
      const file = path.join(OUT, `${tag(i, id)}-character.webp`);
      await sharp(png).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(file);
      console.log(file, (fs.statSync(file).size / 1024).toFixed(0) + ' KB');
    }
    await page.close();

    // Background images: 1920×1080 JPG
    const bgPage = await browser.newPage({ viewport: { width: 2000, height: 1080 }, deviceScaleFactor: 1 });
    await bgPage.goto(fileUrl('slides.html'), { waitUntil: 'load' });
    await ready(bgPage);
    for (const [i, id] of SLIDES.entries()) {
      const png = await (await bgPage.$(`#bg-${id}`)).screenshot();
      const file = path.join(OUT, `${tag(i, id)}-background.jpg`);
      await sharp(png).jpeg({ quality: 86, mozjpeg: true }).toFile(file);
      console.log(file, (fs.statSync(file).size / 1024).toFixed(0) + ' KB');
    }
    await bgPage.close();
  }

  // Previews: the same layer stack HeroSlider.tsx uses, desktop + phone
  const views = [
    { name: 'desktop', width: 1440, height: 810, dsf: 1 },
    { name: 'mobile', width: 390, height: 844, dsf: 2 },
  ];
  for (const v of views) {
    const page = await browser.newPage({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.dsf });
    for (const [i, id] of SLIDES.entries()) {
      await page.goto(fileUrl('preview.html', `?i=${i}`), { waitUntil: 'load' });
      await ready(page);
      await page.screenshot({ path: path.join(PREV, `${tag(i, id)}-${v.name}.jpg`), type: 'jpeg', quality: 80 });
    }
    await page.close();
  }
  console.log('previews →', PREV);
  await browser.close();
})();
