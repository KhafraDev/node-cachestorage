'use strict'

const { Request, Response } = require('undici')
const { webidl } = require('undici/lib/fetch/webidl')
const { kConstruct } = require('./symbols')
const { db } = require('./sql')
const { urlEquals } = require('./util')

class Cache {
  #id

  constructor () {
    if (arguments[0] !== kConstruct) {
      throw webidl.errors.exception({
        header: 'Cache',
        message: 'Illegal constructor'
      })
    }

    this.#id = arguments[1]
  }

  /**
   * @see https://w3c.github.io/ServiceWorker/#cache-matchall
   * @type {import('..').Cache['matchAll']}
   */
  matchAll (request, options) {
    let r = null

    if (arguments.length === 2) {
      if (request instanceof Request || request instanceof globalThis.Request) {
        r = request

        if (r.method !== 'GET' && !options.ignoreMethod) {
          return []
        }
      } else if (typeof request === 'string') {
        r = new Request(request)
      }
    }

    const responses = []

    if (arguments.length === 0) {
      const all = db
        .prepare(`SELECT * FROM request_response_list WHERE id = ?`)
        .all(this.#id)

      responses.push(...all)
    } else {
      const requestResponses = this.#queryCache(r, options)

      for (const { response } of requestResponses) {
        responses.push(response)
      }
    }

    // Skip step 4
    const responseList = []

    for (const response of responseList) {
      responseList.push(new Response(response.response_body, {
        // TODO: serialize response_headers
        headers: response.response_headers,
        status: response.response_status,
        statusText: response.response_status_text
      }))
    }

    return Promise.resolve(Object.freeze(responseList))
  }

  /**
   * @see https://w3c.github.io/ServiceWorker/#query-cache
   * @param {Request} requestQuery
   * @param {import('..').CacheQueryOptions} options
   */
  #queryCache (requestQuery, options) {
    const resultList = []

    const storage = db
      .prepare(`SELECT * FROM request_response_list WHERE id = ?`)
      .all(this.#id)

    for (const requestResponse of storage) {
      const cachedRequest = new Request(requestResponse.request_url, {
        // TODO: serialize
        headers: requestResponse.request_headers
      })

      const cachedResponse = new Response(requestResponse.response_body, {
        // TODO: serialize response_headers
        headers: requestResponse.response_headers,
        status: requestResponse.response_status,
        statusText: requestResponse.response_status_text
      })

      if (this.#requestMatchesCachedItem(requestQuery, cachedRequest, cachedResponse, options)) {
        resultList.push({ request: cachedRequest, response: cachedResponse })
      }
    }

    return resultList
  }

  /**
   * @see https://w3c.github.io/ServiceWorker/#request-matches-cached-item
   * @param {Request} requestQuery
   * @param {Request} request
   * @param {Response | null} response
   * @param {import('..').CacheQueryOptions} options
   */
  #requestMatchesCachedItem (requestQuery, request, response = null, options) {
    if (options?.ignoreMethod === false && request.method !== 'GET') {
      return false
    }

    let queryURL = new URL(requestQuery.url)

    let cachedURL = new URL(request.url)

    if (options?.ignoreSearch) {
      cachedURL.hash = ''
      queryURL.hash = ''
    }

    if (!urlEquals(queryURL, cachedURL, true)) {
      return false
    }

    if (response === null && options.ignoreVary || !response.headers.has('vary')) {
      return true
    }

    // TODO: do vary header stuff?
    return true
  }
}

module.exports = {
  Cache
}
