'use strict'

const { Request, Response } = require('undici')
const { webidl } = require('undici/lib/fetch/webidl')
const { Fetch: FetchController, fetching } = require('undici/lib/fetch/index')
const { createDeferredPromise } = require('undici/lib/fetch/util')
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
   * @see https://w3c.github.io/ServiceWorker/#cache-match
   * @type {import('..').Cache['match']}
   */
  async match (request, options) {
    const p = await this.matchAll(request, options)

    return p[0]
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
   * @see https://w3c.github.io/ServiceWorker/#cache-add
   * @type {import('..').Cache['add']}
   */
  async add (request) {
    const requests = [request]

    return await this.addAll(requests)
  }

  /**
   * @see https://w3c.github.io/ServiceWorker/#cache-addAll
   * @type {import('..').Cache['addAll']}
   */
  async addAll (requests) {
    requests = requests.map(r => new Request(r))

    const responsePromises = []

    const requestList = []

    /** @type {FetchController[]} */
    const fetchControllers = []

    for (const request of requests) {
      const url = request.url

      if (!url.startsWith('http:') && !url.startsWith('https:') || request.method !== 'GET') {
        return Promise.reject(new TypeError('invalid'))
      }

      if (!url.startsWith('http:') && !url.startsWith('https:')) {
        for (const controller of fetchControllers) {
          controller.abort()
        }

        return Promise.reject(new TypeError('aborted'))
      }

      requestList.push(request)

      const responsePromise = createDeferredPromise()

      fetchControllers.push(fetching({
        request,
        processResponse (response) {
          if (response.type === 'error' || response.status === 206 || response.status < 200 || response.status > 299) {
            responsePromise.reject(new TypeError('error'))
            return
          }

          if (response.headersList.contains('vary')) {
            const vary = response.headersList.get('vary').split(/,\s+/g).map(s => s.trim())

            for (const fieldValue of vary) {
              if (fieldValue === '*') {
                responsePromise.reject(new TypeError('*'))

                for (const controller of fetchControllers) {
                  controller.abort()
                }

                return
              }
            }
          }
        },
        processResponseEndOfBody (response) {
          if (response.aborted) {
            responsePromise.reject(new DOMException('aborted', 'AbortError'))
            return
          }

          responsePromise.resolve(response)
        }
      }))

      responsePromises.push(responsePromise.promise)
    }

    const responses = await Promise.all(responsePromises)

    const operations = []
    let index = 0

    for (const response of responses) {
      const operation = {
        type: 'put',
        request: requestList[index],
        response
      }

      operations.push(operation)

      index++
    }
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
