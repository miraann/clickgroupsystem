// usage: node render.js stills 16x9 2,7,12   → stills/16x9-t-*.png
//        node render.js video 16x9|9x16      → frames piped to ffmpeg → video-<ar>.mp4 (silent) + sfx.json
// FFMPEG env var must point to an ffmpeg with libx264 (e.g. from `pip install imageio-ffmpeg`).
const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const FPS = 30;
const [mode, ar = '16x9', arg] = process.argv.slice(2);
const [VW, VH] = ar === '9x16' ? [1080, 1920] : [1920, 1080];
const url = 'file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/') + `?render=1&ar=${ar}`;

(async () => {
  const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--hide-scrollbars'] });
  const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  page.on('pageerror', e => { console.error('PAGE ERROR:', e.message); process.exitCode = 1; });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all([...document.images].map(i => i.complete || new Promise(r => (i.onload = r)))));
  const clip = { x: 0, y: 0, width: VW, height: VH };

  if (mode === 'stills') {
    fs.mkdirSync(path.join(__dirname, 'stills'), { recursive: true });
    for (const t of arg.split(',').map(Number)) {
      await page.evaluate(t => window.renderAt(t), t);
      await page.screenshot({ path: path.join(__dirname, 'stills', `${ar}-t-${t}.png`), clip });
    }
  } else {
    const dur = await page.evaluate(() => window.DURATION);
    fs.writeFileSync(path.join(__dirname, 'sfx.json'), JSON.stringify(await page.evaluate(() => window.SFX)));
    const ff = spawn(process.env.FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      // Chrome JPEGs are full-range BT.601; social platforms expect limited-range BT.709 yuv420p
      '-vf', 'scale=in_range=full:out_range=limited:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p',
      '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-r', String(FPS), path.join(__dirname, `video-${ar}.mp4`)],
      { stdio: ['pipe', 'ignore', 'inherit'] });
    const n = Math.round(dur * FPS), t0 = Date.now();
    for (let i = 0; i < n; i++) {
      await page.evaluate(t => window.renderAt(t), i / FPS);
      let buf;
      for (let k = 0; ; k++) {   // retry: a slow/stalled compositor frame shouldn't kill a 15-min render
        try { buf = await page.screenshot({ type: 'jpeg', quality: 95, clip, timeout: 60000 }); break; }
        catch (e) { if (k >= 2) throw e; console.log(`[${ar}] retry frame ${i}`); await page.evaluate(t => window.renderAt(t), i / FPS); }
      }
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (i % 300 === 0) console.log(`[${ar}] frame ${i}/${n}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    ff.stdin.end();
    await new Promise(r => ff.on('close', r));
    console.log(`[${ar}] done`);
  }
  await browser.close();
})();
