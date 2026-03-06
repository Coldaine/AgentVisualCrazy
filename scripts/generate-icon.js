#!/usr/bin/env node

/**
 * Generate app icon PNG from SVG source.
 * Requires `sharp` (devDependency).
 *
 * Usage: node scripts/generate-icon.js
 */

const sharp = require('sharp');
const path = require('path');

const svgPath = path.join(__dirname, '..', 'electron', 'assets', 'icon.svg');
const pngPath = path.join(__dirname, '..', 'electron', 'assets', 'icon.png');

sharp(svgPath)
  .resize(512, 512)
  .png()
  .toFile(pngPath)
  .then(() => console.log('Generated icon.png (512x512)'))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
