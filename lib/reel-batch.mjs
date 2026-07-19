import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

export function createReelBatchStore({ filePath, reelsDir, now = () => Date.now() }) {
  let items = [];
  let recoveryError = '';

  async function save() {
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.tmp-${process.pid}-${now()}`;
    await writeFile(temporaryPath, JSON.stringify(items, null, 2), 'utf8');
    await rename(temporaryPath, filePath);
  }

  async function load() {
    items = [];
    recoveryError = '';
    if (!existsSync(filePath)) return items;

    let parsed;
    try {
      parsed = JSON.parse(await readFile(filePath, 'utf8'));
      if (!Array.isArray(parsed)) throw new Error('a raiz precisa ser uma lista');
    } catch (error) {
      const preservedPath = `${filePath}.corrupt-${now()}`;
      await rename(filePath, preservedPath);
      recoveryError =
        `A fila de Reels estava corrompida e foi preservada em ${path.basename(preservedPath)}: ${error.message}`;
      return items;
    }

    let changed = false;
    items = parsed.filter((item) => item && typeof item === 'object' && typeof item.file === 'string');
    if (items.length !== parsed.length) changed = true;

    for (const item of items) {
      if (item.status === 'processing') {
        item.status = 'queued';
        item.stage = 'na fila para retomar...';
        item.error = '';
        changed = true;
      }

      if (item.status === 'queued' && !existsSync(path.join(reelsDir, path.basename(item.file)))) {
        item.status = 'error';
        item.stage = '';
        item.error = `O vídeo de origem ${item.file} não foi encontrado.`;
        changed = true;
      }

      if (item.status === 'done') {
        const finalFile = item.result?.file;
        if (!finalFile || !existsSync(path.join(reelsDir, path.basename(finalFile)))) {
          item.status = 'error';
          item.stage = '';
          item.error = 'O vídeo final desse Reel não foi encontrado.';
          changed = true;
        }
      }
    }

    if (changed) await save();
    return items;
  }

  async function upsert(item) {
    const index = items.findIndex((candidate) => candidate.file === item.file);
    if (index === -1) items.push({ ...item });
    else items[index] = { ...items[index], ...item };
    await save();
    return items.find((candidate) => candidate.file === item.file);
  }

  async function patch(file, changes) {
    const item = items.find((candidate) => candidate.file === file);
    if (!item) return null;
    Object.assign(item, changes);
    await save();
    return item;
  }

  async function remove(file) {
    const index = items.findIndex((candidate) => candidate.file === file);
    if (index === -1) return false;
    items.splice(index, 1);
    await save();
    return true;
  }

  return {
    get items() { return items; },
    get recoveryError() { return recoveryError; },
    load,
    save,
    upsert,
    patch,
    remove,
  };
}
