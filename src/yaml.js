/**
 * Copyright 2021-2026, Pablo Loschi
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const fs = require('fs');
const YAML = require('yaml');

function parseDocuments(content) {
  if (typeof content !== 'string') {
    return [];
  }
  return YAML.parseAllDocuments(content, { keepSourceTokens: true });
}

function dumpDocuments(docs) {
  if (!docs || docs.length === 0) return '';
  return docs
    .map((doc, idx) => {
      if (!doc) return '';
      let str;
      if (YAML.isDocument(doc)) {
        str = doc.toString();
      } else {
        str = YAML.stringify(doc);
      }
      if (idx > 0 && !str.startsWith('---')) {
        return '---\n' + str;
      }
      return str;
    })
    .join('');
}

function readFile(path) {
  const fileContent = fs.readFileSync(path, 'utf8');
  return parseDocuments(fileContent);
}

function writeFile(path, docsOrString) {
  const content = typeof docsOrString === 'string' ? docsOrString : dumpDocuments(docsOrString);
  fs.writeFileSync(path, content, 'utf8');
}

function toPlainObject(doc) {
  if (!doc) return doc;
  if (typeof doc.toJS === 'function') {
    return doc.toJS();
  }
  return doc;
}

module.exports = {
  parseDocuments,
  dumpDocuments,
  readFile,
  writeFile,
  toPlainObject,
};
