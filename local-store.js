(() => {
  const DATABASE_NAME = 'wochentisch-sync-v1';
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

  async function getKeys(storeName, prefix) {
    const database = await openDatabase();
    const transaction = database.transaction(storeName, 'readonly');
    const range = IDBKeyRange.bound(prefix, prefix + '\uffff', false, true);
    return requestResult(transaction.objectStore(storeName).getAllKeys(range));
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

  // A sync acknowledgement must never persist the new base without also
  // persisting the corresponding app state and removing the completed request.
  async function writeBatch(operations) {
    if (!Array.isArray(operations) || !operations.length) return;
    for (const operation of operations) {
      if (!operation || !STORE_NAMES.includes(operation.store) ||
          !['put', 'remove'].includes(operation.type) || operation.key === undefined) {
        throw new TypeError('Ungültiger lokaler Speicherauftrag.');
      }
    }
    const database = await openDatabase();
    const transaction = database.transaction([...new Set(operations.map(operation => operation.store))], 'readwrite');
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Lokale Speicherung fehlgeschlagen.'));
      transaction.onabort = () => reject(transaction.error || new Error('Lokale Speicherung wurde abgebrochen.'));
      try {
        for (const operation of operations) {
          const store = transaction.objectStore(operation.store);
          if (operation.type === 'put') store.put({ key: operation.key, value: operation.value, updatedAt: Date.now() });
          else store.delete(operation.key);
        }
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    });
  }

  // Compare and apply within one readwrite transaction. This prevents an
  // acknowledgement from overwriting an app-state saved by another tab after
  // the response was prepared. Values must be JSON-compatible app data.
  async function writeBatchIfUnchanged(conditions, operations) {
    if (!Array.isArray(conditions) || !conditions.length || !Array.isArray(operations) || !operations.length) {
      throw new TypeError('Ungültiger bedingter Speicherauftrag.');
    }
    for (const condition of conditions) {
      if (!condition || !STORE_NAMES.includes(condition.store) || condition.key === undefined ||
          typeof condition.exists !== 'boolean' || (condition.exists && !Object.prototype.hasOwnProperty.call(condition, 'value'))) {
        throw new TypeError('Ungültige Speicherbedingung.');
      }
    }
    for (const operation of operations) {
      if (!operation || !STORE_NAMES.includes(operation.store) ||
          !['put', 'remove'].includes(operation.type) || operation.key === undefined) {
        throw new TypeError('Ungültiger lokaler Speicherauftrag.');
      }
    }
    function stable(value) {
      if (Array.isArray(value)) return value.map(stable);
      if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
      return value;
    }
    const expected = conditions.map(condition => condition.exists ? JSON.stringify(stable(condition.value)) : null);
    const database = await openDatabase();
    const stores = [...new Set([...conditions, ...operations].map(entry => entry.store))];
    const transaction = database.transaction(stores, 'readwrite');
    return new Promise((resolve, reject) => {
      let remaining = conditions.length, matches = true, applied = false;
      transaction.oncomplete = () => resolve(applied);
      transaction.onerror = () => reject(transaction.error || new Error('Lokale Speicherung fehlgeschlagen.'));
      transaction.onabort = () => reject(transaction.error || new Error('Lokale Speicherung wurde abgebrochen.'));
      try {
        conditions.forEach((condition, index) => {
          const request = transaction.objectStore(condition.store).get(condition.key);
          request.onsuccess = () => {
            const record = request.result;
            if (Boolean(record) !== condition.exists ||
                (condition.exists && JSON.stringify(stable(record.value)) !== expected[index])) matches = false;
            if (--remaining !== 0 || !matches) return;
            try {
              for (const operation of operations) {
                const store = transaction.objectStore(operation.store);
                if (operation.type === 'put') store.put({ key: operation.key, value: operation.value, updatedAt: Date.now() });
                else store.delete(operation.key);
              }
              applied = true;
            } catch (error) {
              transaction.abort();
              reject(error);
            }
          };
        });
      } catch (error) {
        transaction.abort();
        reject(error);
      }
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

  window.WochentischStore = Object.freeze({ openDatabase, get, getAll, getKeys, put, remove, writeBatch, writeBatchIfUnchanged, migrateLegacyStorage });
})();
