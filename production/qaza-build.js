#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const qazaDir = path.join(rootDir, 'qaza');
const htmlPath = path.join(qazaDir, 'qaza.html');
const sharedCssPath = path.join(rootDir, 'shared', 'style.css');
const qazaCssPath = path.join(qazaDir, 'css', 'qaza.css');
const jsPath = path.join(qazaDir, 'app.js');
const outPath = path.join(qazaDir, 'production.html');

console.log('📦 Building Qaza production bundle...');

if (!fs.existsSync(htmlPath)) {
  console.error(`Error: Cannot find ${htmlPath}`);
  process.exit(1);
}
if (!fs.existsSync(sharedCssPath)) {
  console.error(`Error: Cannot find ${sharedCssPath}`);
  process.exit(1);
}
if (!fs.existsSync(qazaCssPath)) {
  console.error(`Error: Cannot find ${qazaCssPath}`);
  process.exit(1);
}
if (!fs.existsSync(jsPath)) {
  console.error(`Error: Cannot find ${jsPath}`);
  process.exit(1);
}

// Minify CSS
let sharedCssMin = '';
let qazaCssMin = '';
try {
  sharedCssMin = execSync(`npx esbuild "${sharedCssPath}" --minify`, { encoding: 'utf8' }).trim();
  qazaCssMin = execSync(`npx esbuild "${qazaCssPath}" --minify`, { encoding: 'utf8' }).trim();
} catch (e) {
  console.error('Error minifying CSS:', e.message);
  process.exit(1);
}
const cssMin = [sharedCssMin, qazaCssMin].filter(Boolean).join('\n');

// Minify JS
let jsMin;
try {
  jsMin = execSync(`npx esbuild "${jsPath}" --minify`, { encoding: 'utf8' }).trim();
} catch (e) {
  console.error('Error minifying JS:', e.message);
  process.exit(1);
}

// Read HTML
let html = fs.readFileSync(htmlPath, 'utf8');

// Inline minified CSS
html = html.replace(/<link\s+rel=["']stylesheet["']\s+href=["'][^"']*style\.css["']\s*\/?>/i, `<style>${cssMin}</style>`);
html = html.replace(/<link\s+rel=["']stylesheet["']\s+href=["'][^"']*qaza\.css["']\s*\/?>\s*/i, '');

// Inline minified JS
html = html.replace(/<script\s+src=["']app\.js["']\s*><\/script>/i, `<script>${jsMin}</script>`);

// Strip HTML comments (preserving Knockout <!-- ko --> comments)
html = html.replace(/<!--(?!\s*ko|\s*\/ko)[\s\S]*?-->/g, '');

// Collapse whitespace lines
const lines = html.split('\n').map(l => l.trim()).filter(Boolean);
const output = lines.join('\n') + '\n';

fs.writeFileSync(outPath, output, 'utf8');
const sizeKb = (Buffer.byteLength(output) / 1024).toFixed(1);
console.log(`✅ Production build created: ${outPath} (${sizeKb} KB)`);
