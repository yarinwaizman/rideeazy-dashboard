// Persists FileSystemFileHandles (File System Access API, Chrome/Edge only)
// in IndexedDB so "refresh" can silently re-read the same file without
// asking the user to browse to it every time. Keyed by name so multiple
// independent files (the ops Excel, the revenue CSV, ...) can each be
// remembered separately.

const DB_NAME = "rideeazy-dashboard";
const STORE = "handles";

export const EXCEL_HANDLE_KEY = "excel-file-handle";
export const REVENUE_HANDLE_KEY = "revenue-file-handle";

export const supportsFileSystemAccess =
  typeof window !== "undefined" && "showOpenFilePicker" in window;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveFileHandle(key, handle) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(handle, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadFileHandle(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function verifyPermission(handle, mode = "read") {
  const opts = { mode };
  if ((await handle.queryPermission(opts)) === "granted") return true;
  if ((await handle.requestPermission(opts)) === "granted") return true;
  return false;
}
