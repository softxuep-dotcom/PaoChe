import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = resolve(import.meta.dirname, '../dist');
let html = await readFile(resolve(directory, 'index.html'), 'utf8');
const script = html.match(/<script\s+type="module"\s+crossorigin\s+src="\.\/assets\/(index-[\w-]+\.js)"><\/script>/);
const style = html.match(/<link\s+rel="stylesheet"\s+crossorigin\s+href="\.\/assets\/(index-[\w-]+\.css)">/);
if (!script || !style) throw new Error('Local bundle requires one Vite entry script and one stylesheet.');
const [js, css] = await Promise.all([
  readFile(resolve(directory, 'assets', script[1]), 'utf8'),
  readFile(resolve(directory, 'assets', style[1]), 'utf8'),
]);
html = html.replace(script[0], () => '<script type="module">' + js.replace(/<\/script/gi, '<\\/script') + '</script>');
html = html.replace(style[0], () => '<style>' + css.replace(/<\/style/gi, '<\\/style') + '</style>');
await writeFile(resolve(directory, '拖炮小队.html'), html, 'utf8');
console.log('Offline playable: dist/拖炮小队.html (' + (Buffer.byteLength(html) / 1024 / 1024).toFixed(2) + ' MiB)');
