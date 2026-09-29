const DATABASE_NAME = "attendly-college-timetables";
const DATABASE_VERSION = 1;
const STORE_NAME = "pdfs";

interface CachedTimetablePdf {
  key: string;
  bytes: ArrayBuffer;
  sourceUrl?: string | null;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }

    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("The timetable cache could not be opened."));
    request.onblocked = () => reject(new Error("The timetable cache is blocked."));
  });
}

export async function readCachedCollegeTimetable(key: string): Promise<{ bytes: ArrayBuffer; sourceUrl: string | null } | null> {
  let database: IDBDatabase | undefined;
  try {
    database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);
    const record = await new Promise<CachedTimetablePdf | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as CachedTimetablePdf | undefined);
      request.onerror = () => reject(request.error ?? new Error("The timetable cache could not be read."));
    });
    return record?.bytes instanceof ArrayBuffer
      ? { bytes: record.bytes, sourceUrl: typeof record.sourceUrl === "string" ? record.sourceUrl : null }
      : null;
  } catch {
    return null;
  } finally {
    database?.close();
  }
}

export async function writeCachedCollegeTimetable(key: string, bytes: ArrayBuffer, sourceUrl: string | null): Promise<void> {
  let database: IDBDatabase | undefined;
  try {
    database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("The timetable cache could not be saved."));
      transaction.onabort = () => reject(transaction.error ?? new Error("The timetable cache write was interrupted."));
      transaction.objectStore(STORE_NAME).put({ key, bytes: bytes.slice(0), sourceUrl } satisfies CachedTimetablePdf);
    });
  } catch {
    // The timetable can still be viewed when browser storage is unavailable.
  } finally {
    database?.close();
  }
}
