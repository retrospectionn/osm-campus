// Renders the viewer in headless Chromium with SYNTHETIC fixture data
// (Overpass requests are intercepted) and checks every layer builds.
// Usage: npm run smoke   (set CHROMIUM_PATH to use a specific browser binary)
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { syntheticCampus } from './fixture.mjs';

const out = process.argv[2] || 'test/smoke.png';
const server = await createServer({ server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const fixture = JSON.stringify(syntheticCampus());
  await page.route(/overpass|mail\.ru\/osm/, (route) => {
    const body = route.request().postData() || '';
    // Discovery query → no results; campus query → fixture.
    const json = body.includes('out%20tags%20bb') || body.includes('out+tags+bb') ? '{"elements":[]}' : fixture;
    route.fulfill({ status: 200, contentType: 'application/json', body: json });
  });
  await page.goto('http://localhost:5199/');
  await page.waitForFunction(() => window.__campus, null, { timeout: 60000 });
  const info = await page.evaluate(() => window.__campus);
  console.log(`built in ${info.ms} ms`);
  for (const l of info.layers) console.log(`  ${l.key.padEnd(24)} ${l.count}`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out });
  // Close-up of the main footway (fixture metres: east, north → x, -z).
  await page.evaluate(() => window.__view([20, 14, 40], [-15, 0, 0]));
  await page.waitForTimeout(800);
  await page.screenshot({ path: out.replace('.png', '-close.png') });
  await page.click('#night');
  await page.waitForTimeout(800);
  await page.screenshot({ path: out.replace('.png', '-night.png') });
  const expected = ['buildings', 'paths', 'areas', 'barriers', 'trees', 'bench', 'street_lamp', 'bicycle_parking', 'fire_hydrant'];
  const missing = expected.filter((k) => !info.layers.some((l) => l.key === k && l.count > 0));
  if (missing.length) { failed = true; console.error('Missing layers:', missing.join(', ')); }
  if (errors.length) { failed = true; console.error('Page errors:\n' + errors.join('\n')); }
} finally {
  await browser.close();
  await server.close();
}
console.log(failed ? 'SMOKE FAILED' : 'SMOKE OK');
process.exit(failed ? 1 : 0);
