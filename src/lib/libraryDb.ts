import type { PresetId } from './presets';

export interface LibraryBookMeta {
  id: string;
  name: string;
  fileSize: number;
  totalPages: number;
  lastPage: number;
  presetId: PresetId;
  lastOpenedAt: number;
}

interface StoredBookRecord extends LibraryBookMeta {
  bytes: ArrayBuffer;
}

const DB_NAME = 'vellum-library';
const DB_VERSION = 1;
const STORE_NAME = 'books';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this browser.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('lastOpenedAt', 'lastOpenedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open library database.'));
  });
}

export function makeBookId(name: string, fileSize: number): string {
  return `${name}::${fileSize}`;
}

export async function listLibraryBooks(): Promise<LibraryBookMeta[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = (req.result as StoredBookRecord[]).map((row) => ({
          id: row.id,
          name: row.name,
          fileSize: row.fileSize,
          totalPages: row.totalPages,
          lastPage: row.lastPage,
          presetId: row.presetId,
          lastOpenedAt: row.lastOpenedAt,
        }));
        rows.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
        resolve(rows);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function getLibraryBook(id: string): Promise<{ meta: LibraryBookMeta; bytes: Uint8Array } | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => {
        const rec = req.result as StoredBookRecord | undefined;
        if (!rec) {
          resolve(null);
          return;
        }
        resolve({
          meta: {
            id: rec.id,
            name: rec.name,
            fileSize: rec.fileSize,
            totalPages: rec.totalPages,
            lastPage: rec.lastPage,
            presetId: rec.presetId,
            lastOpenedAt: rec.lastOpenedAt,
          },
          bytes: new Uint8Array(rec.bytes),
        });
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function saveBookToLibrary(
  bytes: Uint8Array,
  meta: Omit<LibraryBookMeta, 'lastOpenedAt'>
): Promise<LibraryBookMeta> {
  const db = await openDb();
  const existing = await getLibraryBook(meta.id);
  const record: StoredBookRecord = {
    ...meta,
    // Keep previously saved progress if re-opening the exact same file
    lastPage: existing ? existing.meta.lastPage : meta.lastPage,
    lastOpenedAt: Date.now(),
    bytes: bytes.slice().buffer,
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return {
    id: record.id,
    name: record.name,
    fileSize: record.fileSize,
    totalPages: record.totalPages,
    lastPage: record.lastPage,
    presetId: record.presetId,
    lastOpenedAt: record.lastOpenedAt,
  };
}

export async function updateBookProgress(
  id: string,
  patch: Partial<Pick<LibraryBookMeta, 'lastPage' | 'presetId'>>
): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const rec = getReq.result as StoredBookRecord | undefined;
        if (!rec) {
          resolve();
          return;
        }
        store.put({
          ...rec,
          ...patch,
          lastOpenedAt: Date.now(),
        });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore storage quota or private-mode errors gracefully
  }
}

export async function removeBookFromLibrary(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore
  }
}
