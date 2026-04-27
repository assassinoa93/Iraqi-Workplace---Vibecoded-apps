/**
 * Builds the Windows installer icon (assets/icon.ico) from assets/icon.png.
 *
 * Resilient about the source: the project shipped with `icon.png` that was
 * actually a JPEG. Sharp is used as a normaliser — it reads either PNG or
 * JPEG (or any common format) and re-encodes the canonical sizes Windows
 * expects in a multi-size ICO. The seven sizes 16/24/32/48/64/128/256
 * cover every Windows shell context (taskbar → Start tile).
 *
 * Run via `npm run icons` (or directly: `node scripts/build-icon.cjs`).
 * Wired into `electron:build` so every release ships a real icon.
 *
 * Side effect: also writes `assets/icon-256.png` — a clean PNG copy at
 * 256×256. electron-builder's `linux.icon` and Electron's tray API both
 * prefer a real PNG, so the same source produces both a valid .png and .ico.
 */
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const ASSETS = path.join(__dirname, '..', 'assets');
const SRC = path.join(ASSETS, 'icon.png');
const ICO_DST = path.join(ASSETS, 'icon.ico');
const PNG_DST = path.join(ASSETS, 'icon-256.png');

// png-to-ico v3 ships a .default in CJS; v2 was a bare function.
const mod = require('png-to-ico');
const pngToIco = typeof mod === 'function' ? mod : mod.default;

const SIZES = [16, 24, 32, 48, 64, 128, 256];

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error('❌ Source not found at', SRC);
    process.exit(1);
  }

  // Sharp transparently handles JPEG/PNG/WebP input. We force PNG output
  // because png-to-ico needs valid PNG buffers — the historical bug was
  // that the source was actually a JPEG masquerading as .png.
  const buffers = await Promise.all(
    SIZES.map(size =>
      sharp(SRC)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
    )
  );

  // Multi-size ICO — Windows picks whichever resolution best fits the
  // shell context (taskbar 16, Start menu 32/48, jump-list tile 256).
  const icoBuf = await pngToIco(buffers);
  fs.writeFileSync(ICO_DST, icoBuf);
  console.log(`✅ icon.ico (${SIZES.join(', ')}) → ${path.relative(process.cwd(), ICO_DST)} (${(icoBuf.length / 1024).toFixed(1)} KB)`);

  // 256×256 PNG companion — used by Linux builds and the Electron tray.
  const pngBuf = buffers[buffers.length - 1];
  fs.writeFileSync(PNG_DST, pngBuf);
  console.log(`✅ icon-256.png → ${path.relative(process.cwd(), PNG_DST)}`);
}

main().catch(err => {
  console.error('❌ Icon build failed:', err.message);
  process.exit(1);
});
