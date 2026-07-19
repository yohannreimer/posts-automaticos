import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRAND_FILE = path.join(__dirname, '..', 'data', 'brand.json');

export const DEFAULT_BRAND = {
  handle: '',        // ex: @reimeryohann
  signature: '',     // assinatura padrão sugerida nos slides
  accent: '',        // cor de destaque (hex); vazio = padrão de cada estilo
  grain: true,       // granulado sutil nos fundos
};

export async function readBrand() {
  if (!existsSync(BRAND_FILE)) return { ...DEFAULT_BRAND };
  try {
    const data = JSON.parse(await readFile(BRAND_FILE, 'utf8'));
    return { ...DEFAULT_BRAND, ...data };
  } catch {
    return { ...DEFAULT_BRAND };
  }
}

export async function writeBrand(brand) {
  await mkdir(path.dirname(BRAND_FILE), { recursive: true });
  const clean = {
    handle: String(brand.handle || '').trim(),
    signature: String(brand.signature || '').trim(),
    accent: /^#[0-9a-fA-F]{6}$/.test(brand.accent || '') ? brand.accent : '',
    grain: brand.grain !== false,
  };
  await writeFile(BRAND_FILE, JSON.stringify(clean, null, 2), 'utf8');
  return clean;
}
