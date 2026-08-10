import { webV4Error } from './errors.js';
import { canonicalSourcePath } from './input-adapter.js';
import { WEB_V4_LIMITS } from './runtime/limits.js';

const supportedName = (name) => {
  const value = String(name ?? '').toLowerCase();
  return value.endsWith('.sol') || value === 'remappings.txt';
};

export function selectSupportedBrowserFiles(files) {
  return [...(files ?? [])].filter((file) => supportedName(file?.name));
}

function droppedFile(file, relativePath) {
  const path = canonicalSourcePath(relativePath);
  return Object.freeze({
    name: String(file?.name ?? path.split('/').at(-1)),
    size: Number(file?.size ?? 0),
    type: String(file?.type ?? ''),
    lastModified: Number(file?.lastModified ?? 0),
    relativePath: path,
    async arrayBuffer() { return file.arrayBuffer(); },
  });
}

function legacyFile(entry) {
  return new Promise((resolve, reject) => entry.file(resolve, () => reject(webV4Error('WEB_V4_INPUT_INVALID', 'A dropped file could not be read.'))));
}

function legacyDirectoryEntries(entry) {
  const reader = entry.createReader();
  const entries = [];
  return new Promise((resolve, reject) => {
    const read = () => reader.readEntries((batch) => {
      if (!batch.length) { resolve(entries); return; }
      entries.push(...batch); read();
    }, () => reject(webV4Error('WEB_V4_INPUT_INVALID', 'A dropped folder could not be read.')));
    read();
  });
}

async function walkLegacyEntry(entry, path, output, limits) {
  const safePath = canonicalSourcePath(path);
  if (entry.isFile === true) {
    const file = await legacyFile(entry);
    if (!supportedName(file.name)) return;
    output.push(droppedFile(file, safePath));
    if (output.length > limits.maxFileCount) throw webV4Error('WEB_V4_INPUT_LIMIT', 'Browser file count exceeds the safe limit.', { limit: limits.maxFileCount });
    return;
  }
  if (entry.isDirectory !== true) throw webV4Error('WEB_V4_INPUT_INVALID', 'Unsupported dropped filesystem entry.');
  const children = await legacyDirectoryEntries(entry);
  children.sort((left, right) => String(left.name) < String(right.name) ? -1 : String(left.name) > String(right.name) ? 1 : 0);
  for (const child of children) await walkLegacyEntry(child, `${safePath}/${child.name}`, output, limits);
}

async function walkFileSystemHandle(handle, path, output, limits) {
  const safePath = canonicalSourcePath(path);
  if (handle.kind === 'file') {
    const file = await handle.getFile();
    if (!supportedName(file.name)) return;
    output.push(droppedFile(file, safePath));
    if (output.length > limits.maxFileCount) throw webV4Error('WEB_V4_INPUT_LIMIT', 'Browser file count exceeds the safe limit.', { limit: limits.maxFileCount });
    return;
  }
  if (handle.kind !== 'directory' || typeof handle.entries !== 'function') throw webV4Error('WEB_V4_INPUT_INVALID', 'Unsupported dropped filesystem entry.');
  const children = [];
  for await (const [name, child] of handle.entries()) children.push([name, child]);
  children.sort(([left], [right]) => String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0);
  for (const [name, child] of children) await walkFileSystemHandle(child, `${safePath}/${name}`, output, limits);
}

async function itemEntry(item) {
  if (item?.kind !== 'file') throw webV4Error('WEB_V4_INPUT_INVALID', 'Only local files and project folders can be dropped.');
  if (typeof item.webkitGetAsEntry === 'function') {
    const entry = item.webkitGetAsEntry();
    if (entry) return { type: 'legacy', value: entry };
  }
  if (typeof item.getAsFileSystemHandle === 'function') {
    const handle = await item.getAsFileSystemHandle();
    if (handle) return { type: 'handle', value: handle };
  }
  const file = typeof item.getAsFile === 'function' ? item.getAsFile() : null;
  if (file) return { type: 'file', value: file };
  throw webV4Error('WEB_V4_DIRECTORY_DROP_UNSUPPORTED', 'This browser cannot read dropped folders safely. Use the Folder picker instead.');
}

export async function collectDroppedBrowserFiles(dataTransfer, { limits = WEB_V4_LIMITS } = {}) {
  const items = [...(dataTransfer?.items ?? [])];
  if (!items.length) {
    const files = [...(dataTransfer?.files ?? [])];
    if (!files.length) throw webV4Error('WEB_V4_INPUT_INVALID', 'The drop did not contain local files.');
    return files;
  }
  const output = [];
  for (const item of items) {
    const entry = await itemEntry(item);
    if (entry.type === 'file') {
      if (supportedName(entry.value.name)) output.push(entry.value);
    } else if (entry.type === 'legacy') {
      const value = entry.value;
      if (value.isFile === true) {
        const file = await legacyFile(value);
        if (supportedName(file.name)) output.push(file);
      } else await walkLegacyEntry(value, value.name, output, limits);
    } else {
      const value = entry.value;
      if (value.kind === 'file') {
        const file = await value.getFile();
        if (supportedName(file.name)) output.push(file);
      } else await walkFileSystemHandle(value, value.name, output, limits);
    }
    if (output.length > limits.maxFileCount) throw webV4Error('WEB_V4_INPUT_LIMIT', 'Browser file count exceeds the safe limit.', { limit: limits.maxFileCount });
  }
  if (!output.length) throw webV4Error('WEB_V4_INPUT_INVALID', 'The dropped selection contains no supported Solidity sources.');
  return output;
}

export function bindV4DropZone(dropZone, { onFiles, onError, limits = WEB_V4_LIMITS }) {
  const activate = (event) => { event.preventDefault(); dropZone.classList.add('dragging'); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; };
  const leave = (event) => { event.preventDefault(); if (!event.relatedTarget || !dropZone.contains(event.relatedTarget)) dropZone.classList.remove('dragging'); };
  const drop = async (event) => {
    event.preventDefault(); dropZone.classList.remove('dragging');
    try { await onFiles(await collectDroppedBrowserFiles(event.dataTransfer, { limits })); }
    catch (error) { await onError(error); }
    finally { dropZone.classList.remove('dragging'); }
  };
  dropZone.addEventListener('dragenter', activate);
  dropZone.addEventListener('dragover', activate);
  dropZone.addEventListener('dragleave', leave);
  dropZone.addEventListener('drop', drop);
  return () => {
    dropZone.removeEventListener('dragenter', activate);
    dropZone.removeEventListener('dragover', activate);
    dropZone.removeEventListener('dragleave', leave);
    dropZone.removeEventListener('drop', drop);
    dropZone.classList.remove('dragging');
  };
}
