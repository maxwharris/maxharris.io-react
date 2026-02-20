import { getObject, putObject } from './s3.js';

let items = [];
let saveTimeout = null;

const STATE_KEY = 'state/canvas.json';

export async function loadState() {
  try {
    const data = await getObject(STATE_KEY);
    items = JSON.parse(data);
    console.log(`Loaded ${items.length} canvas items from S3`);
  } catch {
    items = [];
    console.log('No existing canvas state, starting fresh');
  }
}

function debouncedSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      await putObject(STATE_KEY, JSON.stringify(items), 'application/json');
    } catch (err) {
      console.error('Failed to persist canvas state:', err);
    }
  }, 2000);
}

export function getAllItems() {
  return items;
}

export function addItem(item) {
  items.push(item);
  debouncedSave();
  return item;
}

export function moveItem(id, x, y) {
  const item = items.find((i) => i.id === id);
  if (item) {
    item.x = x;
    item.y = y;
    debouncedSave();
  }
  return item;
}

export function deleteItem(id) {
  items = items.filter((i) => i.id !== id);
  debouncedSave();
}
