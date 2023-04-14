'use strict'

const { Request } = require('undici')
const { webidl } = require('undici/lib/fetch/webidl')
const { db } = require('./sql')
const { Cache } = require('./cache')
const { kConstruct } = require('./symbols')

class CacheStorage {
  constructor () {
    if (arguments[0] !== kConstruct) {
      throw webidl.errors.exception({
        header: 'CacheStorage',
        message: 'Illegal constructor'
      })
    }
  }

  /**
   * @see https://w3c.github.io/ServiceWorker/#dom-cachestorage-open
   * @param {string} cacheName
   */
  open (cacheName) {
    webidl.brandCheck(this, CacheStorage)
    webidl.argumentLengthCheck(arguments, 1, {
      header: 'CacheStorage.open'
    })

    cacheName = webidl.converters.DOMString(cacheName)

    let id = db
      .prepare(`INSERT OR IGNORE INTO cache_storage (cache_name) VALUES (?) RETURNING id;`)
      .get(cacheName)

    id ??= db.prepare(`SELECT id FROM cache_storage WHERE cache_name = ?`).get(cacheName)

    const cache = new Cache(kConstruct, id.id)

    return Promise.resolve(cache)
  }

  /**
   * @see https://w3c.github.io/ServiceWorker/#cache-storage-has
   * @param {string} cacheName
   */
  has (cacheName) {
    webidl.brandCheck(this, CacheStorage)
    webidl.argumentLengthCheck(arguments, 1, {
      header: 'CacheStorage.has'
    })

    cacheName = webidl.converters.DOMString(cacheName)

    const exists = !!db
      .prepare(`SELECT EXISTS(SELECT 1 FROM cache_storage WHERE cache_name = ?) AS \`exists\``)
      .get(cacheName)
      .exists

    return Promise.resolve(exists)
  }

  /**
   * @see https://w3c.github.io/ServiceWorker/#cache-storage-delete
   * @param {string} cacheName
   */
  delete (cacheName) {
    webidl.brandCheck(this, CacheStorage)
    webidl.argumentLengthCheck(arguments, 1, {
      header: 'CacheStorage.delete'
    })

    cacheName = webidl.converters.DOMString(cacheName)

    const deleted = db
      .prepare(`DELETE FROM cache_storage WHERE cache_name = ? RETURNING id`)
      .get(cacheName)?.id

    return Promise.resolve(!!deleted)
  }

  /**
   * @see https://w3c.github.io/ServiceWorker/#cache-storage-keys
   * @returns {Promise<string[]>}
   */
  keys () {
    webidl.brandCheck(this, CacheStorage)

    const keys = db
      .prepare(`SELECT cache_name FROM cache_storage`)
      .all()
      .map(k => k.cache_name)

    return Promise.resolve(keys)
  }

  /**
   * @see https://w3c.github.io/ServiceWorker/#cache-storage-match
   * @type {import('..').CacheStorage['match']}
   */
  match (request, options = {}) {
    webidl.brandCheck(this, CacheStorage)
    webidl.argumentLengthCheck(arguments, 1, {
      header: 'CacheStorage.match'
    })

    request = new Request(webidl.converters.RequestInfo(request))
    options = webidl.converters.MultiCacheQueryOptions(options)

    if (options.cacheName != null) {
      const id = db.prepare(`SELECT id FROM cache_storage WHERE cache_name = ?`).get(options.cacheName)

      if (id) {
        const cache = new Cache(kConstruct, id.id)
        return cache.matchAll.call(cache, request, options)
      }

      return Promise.resolve()
    } else {
      // TODO: wtf is the spec even saying?
    }
  }
}

webidl.converters.MultiCacheQueryOptions = webidl.dictionaryConverter([
  {
    key: 'cacheName',
    converter: webidl.converters.DOMString
  },
  {
    key: 'ignoreSearch',
    converter: webidl.converters.boolean,
    defaultValue: false
  },
  {
    key: 'ignoreMethod',
    converter: webidl.converters.boolean,
    defaultValue: false
  },
  {
    key: 'ignoreVary',
    converter: webidl.converters.boolean,
    defaultValue: false
  }
])

module.exports = {
  CacheStorage
}
