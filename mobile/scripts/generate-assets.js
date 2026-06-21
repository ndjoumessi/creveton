/* Génère les icônes/splash de l'app à partir du logo Creveton (carré or + « C »).
 * Aucune image externe : on rasterise un SVG inline via sharp.
 *
 *   node scripts/generate-assets.js
 *
 * Produit :
 *   - assets/icon.png          1024×1024, coins arrondis (rx 180), fond gold
 *   - assets/splash-icon.png    200×200,  même design réduit
 *   - assets/adaptive-icon.png 1024×1024, sans arrondi (Android adaptive)
 */

const path = require('path');
const sharp = require('sharp');

const GOLD = '#d4a017';
const GREEN = '#0b2e1a';
const ASSETS = path.join(__dirname, '..', 'assets');

// SVG du logo. `radius` en proportion de la taille (0 = carré plein).
function logoSvg(size, radius) {
  const rx = Math.round(size * radius);
  // « C » centré : ancrage milieu + baseline ~0.66 de la hauteur.
  const fontSize = Math.round(size * 0.6);
  const y = Math.round(size * 0.665);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${rx}" ry="${rx}" fill="${GOLD}"/>
  <text x="${size / 2}" y="${y}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="${fontSize}" fill="${GREEN}">C</text>
</svg>`;
}

async function render(name, size, radius) {
  const out = path.join(ASSETS, name);
  await sharp(Buffer.from(logoSvg(size, radius))).png().toFile(out);
  console.log(`✓ ${name} (${size}×${size})`);
}

(async () => {
  await render('icon.png', 1024, 0.176); // ~180px d'arrondi
  await render('splash-icon.png', 200, 0.176);
  await render('adaptive-icon.png', 1024, 0); // plein (le masque Android arrondit)
  console.log('Assets générés.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
