(() => {
  const DATABASE_NAME = 'wochentisch-local';
  const DATABASE_VERSION = 1;
  const STORE_NAMES = ['records', 'catalog', 'imports', 'conflicts'];
  let databasePromise;

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB ist in diesem Browser nicht verfügbar.'));
        return;
      }
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        STORE_NAMES.forEach(name => {
          if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath: 'key' });
        });
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onerror = () => reject(request.error || new Error('Lokaler Speicher konnte nicht geöffnet werden.'));
      request.onblocked = () => reject(new Error('Ein anderer App-Tab blockiert die Aktualisierung des lokalen Speichers.'));
    });
    return databasePromise;
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Lokaler Speicherzugriff fehlgeschlagen.'));
    });
  }

  async function get(storeName, key) {
    const database = await openDatabase();
    const transaction = database.transaction(storeName, 'readonly');
    return requestResult(transaction.objectStore(storeName).get(key)).then(record => record?.value);
  }

  async function getAll(storeName) {
    const database = await openDatabase();
    const transaction = database.transaction(storeName, 'readonly');
    return requestResult(transaction.objectStore(storeName).getAll());
  }

  async function put(storeName, key, value) {
    const database = await openDatabase();
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put({ key, value, updatedAt: Date.now() });
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = () => reject(transaction.error || new Error('Lokaler Speicher konnte nicht aktualisiert werden.'));
      transaction.onabort = () => reject(transaction.error || new Error('Speichern im lokalen Speicher wurde abgebrochen.'));
    });
  }

  async function remove(storeName, key) {
    const database = await openDatabase();
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(key);
    return new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Lokaler Eintrag konnte nicht entfernt werden.'));
      transaction.onabort = () => reject(transaction.error || new Error('Entfernen im lokalen Speicher wurde abgebrochen.'));
    });
  }

  function safelyReadLocalStorage(key) {
    try { return localStorage.getItem(key); } catch (error) { return null; }
  }

  function safelyParse(value) {
    try { return value ? JSON.parse(value) : null; } catch (error) { return null; }
  }

  async function migrateLegacyStorage() {
    const database = await openDatabase();
    const check = database.transaction('records', 'readonly');
    const marker = await requestResult(check.objectStore('records').get('meta:legacy-migration-complete'));
    if (marker?.value === true) return false;

    const values = [];
    const appState = safelyParse(safelyReadLocalStorage('wochentisch-v1'));
    if (appState && Array.isArray(appState.dishes) && appState.plans) {
      values.push({ key: 'app-state', value: appState });
    }

    try {
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (!key || !/^wochentisch-cloud-(?:base|backup)-/.test(key)) continue;
        const value = safelyParse(safelyReadLocalStorage(key));
        if (value) values.push({ key, value });
      }
    } catch (error) {
      // Some privacy modes expose localStorage but deny enumeration.
    }

    const transaction = database.transaction('records', 'readwrite');
    const records = transaction.objectStore('records');
    values.forEach(record => records.put({ ...record, updatedAt: Date.now() }));
    records.put({ key: 'meta:legacy-migration-complete', value: true, updatedAt: Date.now() });
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error || new Error('Vorhandene Offline-Daten konnten nicht migriert werden.'));
      transaction.onabort = () => reject(transaction.error || new Error('Migration lokaler Offline-Daten wurde abgebrochen.'));
    });
  }

  window.WochentischStore = Object.freeze({ openDatabase, get, getAll, put, remove, migrateLegacyStorage });
})();
