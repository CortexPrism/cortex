const srcDir = new URL('./src/', import.meta.url);
const distDir = new URL('./dist/', import.meta.url);

try {
  await Deno.mkdir(distDir, { recursive: true });
} catch {
  // directory exists
}

async function readText(filename: string) {
  return await Deno.readTextFile(new URL(filename, srcDir));
}

const html = await readText('index.html');
const css = await readText('app.css');
const js = await readText('app.js');

const inlineHtml = html
  .replace('<link rel="stylesheet" href="app.css" />', `<style>\n${css}\n</style>`)
  .replace('<script src="app.js"></script>', `<script>\n${js}\n</script>`);

await Deno.writeTextFile(new URL('index.html', distDir), inlineHtml);
console.log('Desktop app built: desktop/dist/index.html');
