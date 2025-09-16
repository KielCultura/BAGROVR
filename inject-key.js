const fs = require('fs');
const apiKey = process.env.GOOGLE_MAPS_API_KEY;
if (!apiKey) throw new Error('Missing GOOGLE_MAPS_API_KEY env var!');
let html = fs.readFileSync('index.html', 'utf-8');
html = html.replace(/GOOGLE_MAPS_API_KEY/g, apiKey);
fs.writeFileSync('index.html', html);
console.log('Injected Google Maps API key into index.html');
