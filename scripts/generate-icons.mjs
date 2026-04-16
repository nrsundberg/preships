import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import pngToIco from "png-to-ico";
import sharp from "sharp";

const projectRoot = process.cwd();
const sourceLogoPath = path.join(projectRoot, "preships_logo.jpg");
const outputRoot = path.join(projectRoot, "apps/web/public");
const iconsDir = path.join(outputRoot, "icons");

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const maskableBackground = { r: 15, g: 23, b: 42, alpha: 1 };

async function ensureDirectories() {
  await mkdir(iconsDir, { recursive: true });
}

async function writeSquarePng(relativePath, size) {
  const outputPath = path.join(outputRoot, relativePath);
  await sharp(sourceLogoPath)
    .resize(size, size, { fit: "contain", background: transparent })
    .png()
    .toFile(outputPath);
}

async function writeMaskablePng(relativePath, size) {
  const innerSize = Math.round(size * 0.8);
  const inset = Math.floor((size - innerSize) / 2);
  const iconLayer = await sharp(sourceLogoPath)
    .resize(innerSize, innerSize, { fit: "contain", background: transparent })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: maskableBackground,
    },
  })
    .composite([{ input: iconLayer, left: inset, top: inset }])
    .png()
    .toFile(path.join(outputRoot, relativePath));
}

async function writeFavicon() {
  const faviconSizes = [16, 32, 48];
  const faviconPngPaths = [];

  for (const size of faviconSizes) {
    const relativePath = `icons/favicon-${size}x${size}.png`;
    await writeSquarePng(relativePath, size);
    faviconPngPaths.push(path.join(outputRoot, relativePath));
  }

  const faviconBuffer = await pngToIco(faviconPngPaths);
  await writeFile(path.join(outputRoot, "favicon.ico"), faviconBuffer);
}

async function main() {
  await ensureDirectories();
  await writeFavicon();
  await writeSquarePng("icons/apple-touch-icon.png", 180);
  await writeSquarePng("icons/icon-192.png", 192);
  await writeSquarePng("icons/icon-512.png", 512);
  await writeMaskablePng("icons/icon-512-maskable.png", 512);

  process.stdout.write("Generated Preships icons in apps/web/public.\n");
}

main().catch((error) => {
  process.stderr.write(
    `Icon generation failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
