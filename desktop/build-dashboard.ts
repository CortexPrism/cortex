import { serveUi } from '../src/server/ui/mod.ts';

const distDir = new URL('./dist/', import.meta.url);
try {
  await Deno.mkdir(distDir, { recursive: true });
} catch {
  // directory exists
}

const response = serveUi('en');
const html = await response.text();
await Deno.writeTextFile(new URL('./index.html', distDir), html);
console.log('Dashboard built: desktop/dist/index.html');
