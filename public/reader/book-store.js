// 마지막으로 연 책 파일을 브라우저 IndexedDB에 보관해 다음에 다시 열 수 있게 하는 저장소.

const DB_NAME = 'ebook-reader';
const STORE = 'books';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = action(transaction.objectStore(STORE));
    transaction.oncomplete = () => { db.close(); resolve(request.result); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
}

export function saveLastBook(book) {
  return run('readwrite', store => store.put(book, 'last'));
}

export function loadLastBook() {
  return run('readonly', store => store.get('last'));
}
