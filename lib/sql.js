'use strict'

const sqlite = require('better-sqlite3')

const db = sqlite('cachestorage.db')
db.pragma('journal_mode = WAL')

//   Copyright Deno authors. Licensed under MIT License.
//   Original license at https://github.com/denoland/deno/blob/main/LICENSE.md.

db.exec(`
  CREATE TABLE IF NOT EXISTS cache_storage (
    id INTEGER PRIMARY KEY,
    cache_name TEXT NOT NULL UNIQUE
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS request_response_list (
    id INTEGER PRIMARY KEY,
    cache_id INTEGER NOT NULL,
    request_url TEXT NOT NULL,
    request_headers BLOB NOT NULL,
    response_headers BLOB NOT NULL,
    response_status INTEGER NOT NULL,
    response_status_text TEXT,
    response_body BLOB,
    last_inserted_at INTEGER UNSIGNED NOT NULL,

    FOREIGN KEY (cache_id) REFERENCES cache_storage(id) ON DELETE CASCADE,

    UNIQUE (cache_id, request_url)
  )
`)

module.exports = { db }
