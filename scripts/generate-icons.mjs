import sharp from 'sharp';

const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#07182e;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0d2d52;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="trophy" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#ffe066;stop-opacity:1" />
      <stop offset="60%" style="stop-color:#f5a623;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#c8860a;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="stripe1" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#e31837;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#b01228;stop-opacity:1" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="512" height="512" rx="80" fill="url(#bg)" />

  <!-- Decorative color stripes at bottom (host nations) -->
  <rect x="0" y="430" width="171" height="82" rx="0" fill="#c8102e" opacity="0.85"/>
  <rect x="171" y="430" width="170" height="82" fill="#ffffff" opacity="0.15"/>
  <rect x="341" y="430" width="171" height="82" rx="0" fill="#006847" opacity="0.85"/>
  <!-- Round bottom corners -->
  <rect x="0" y="430" width="512" height="82" rx="0" fill="transparent"/>
  <path d="M0 430 L512 430 L512 512 Q512 512 432 512 L80 512 Q0 512 0 512 Z" fill="transparent"/>

  <!-- Trophy body -->
  <!-- Cup bowl -->
  <path d="M188 100 Q188 70 256 70 Q324 70 324 100 L310 220 Q310 250 256 250 Q202 250 202 220 Z" fill="url(#trophy)" />

  <!-- Trophy handles -->
  <path d="M188 120 Q150 120 145 155 Q140 185 170 195 L195 185 Q175 178 178 158 Q180 142 202 140 Z" fill="url(#trophy)" />
  <path d="M324 120 Q362 120 367 155 Q372 185 342 195 L317 185 Q337 178 334 158 Q332 142 310 140 Z" fill="url(#trophy)" />

  <!-- Trophy stem -->
  <rect x="238" y="250" width="36" height="60" fill="url(#trophy)" rx="4"/>

  <!-- Trophy base -->
  <rect x="200" y="305" width="112" height="20" fill="url(#trophy)" rx="6"/>
  <rect x="214" y="320" width="84" height="14" fill="#c8860a" rx="4"/>

  <!-- Star on trophy -->
  <polygon points="256,105 261,119 276,119 264,128 268,142 256,133 244,142 248,128 236,119 251,119" fill="#07182e" opacity="0.5"/>

  <!-- "WORLD CUP" text -->
  <text x="256" y="372" font-family="Arial,Helvetica,sans-serif" font-size="36" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="4">WORLD CUP</text>

  <!-- "2026" text -->
  <text x="256" y="418" font-family="Arial,Helvetica,sans-serif" font-size="44" font-weight="900" fill="#ffe066" text-anchor="middle" letter-spacing="2">2026</text>
</svg>`;

const svgBuffer = Buffer.from(svgIcon);

await sharp(svgBuffer).resize(192, 192).png().toFile('public/icon-192.png');
console.log('Generated icon-192.png');

await sharp(svgBuffer).resize(512, 512).png().toFile('public/icon-512.png');
console.log('Generated icon-512.png');
