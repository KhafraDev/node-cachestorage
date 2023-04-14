'use strict'

const { URLSerializer } = require('undici/lib/fetch/dataURL')

/**
 * @see https://url.spec.whatwg.org/#concept-url-equals
 * @param {URL} A
 * @param {URL} B
 */
function urlEquals (A, B, excludeFragment = false) {
  const serializedA = URLSerializer(A, excludeFragment)

  const serializedB = URLSerializer(B, excludeFragment)

  return serializedA === serializedB
}

module.exports = {
  urlEquals
}
