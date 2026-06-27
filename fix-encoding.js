const fs = require('fs');
const iconv = require('iconv-lite');

const file = 'c:/backend/index.html';
const html = fs.readFileSync(file, 'utf8');
const fixed = iconv.decode(iconv.encode(html, 'win1252'), 'utf8');

fs.writeFileSync(file, fixed, 'utf8');

const icons = [...fixed.matchAll(/class="nicon">([^<]+)/g)].map(m => m[1]);
console.log('Nav icons:', icons.join(' | '));
console.log('Title:', fixed.match(/<title>.*<\/title>/)?.[0]);
console.log('Remaining mojibake:', (fixed.match(/â|ð|ï¼/g) || []).length);
console.log('Done - index.html fixed');
