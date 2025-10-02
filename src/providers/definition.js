const vscode = require('vscode');

/**
 * Find the Awilix key under the cursor
 * @param {vscode.TextDocument} doc
 * @param {vscode.Position} pos
 * @returns {{key: string, range: vscode.Range}|null}
 */
function findKeyUnderCursor(doc, pos) {
  const line = doc.lineAt(pos.line).text;
  const wordRange = doc.getWordRangeAtPosition(pos);

  if (!wordRange) return null;

  const word = doc.getText(wordRange);

  // Check if we're in a resolve('key') string literal
  const resolveMatch = line.match(/\.resolve\s*\(\s*['"]([^'"]+)['"]\s*\)/);
  if (resolveMatch && line.indexOf(resolveMatch[1]) <= pos.character &&
      pos.character <= line.indexOf(resolveMatch[1]) + resolveMatch[1].length) {
    const keyStart = line.indexOf(resolveMatch[1]);
    return {
      key: resolveMatch[1],
      range: new vscode.Range(pos.line, keyStart, pos.line, keyStart + resolveMatch[1].length)
    };
  }

  // Check if we're accessing cradle.key
  const cradleMatch = line.match(/\.cradle\.(\w+)/);
  if (cradleMatch && cradleMatch[1] === word) {
    return {
      key: word,
      range: wordRange
    };
  }

  // Check if we're in a constructor parameter (destructuring)
  // Pattern: constructor({key, otherKey})
  const constructorMatch = line.match(/constructor\s*\(\s*\{([^}]+)\}/);
  if (constructorMatch) {
    const params = constructorMatch[1].split(',').map(p => p.trim());
    if (params.includes(word)) {
      return {
        key: word,
        range: wordRange
      };
    }
  }

  // Check if we're in a function parameter (destructuring)
  // Pattern: function name({key, otherKey}) or ({key, otherKey}) =>
  const functionMatch = line.match(/(?:function\s+\w+\s*\(|^\s*(?:const|let|var)?\s*\w+\s*=\s*)\s*\{([^}]+)\}/);
  if (functionMatch) {
    const params = functionMatch[1].split(',').map(p => p.trim());
    if (params.includes(word)) {
      return {
        key: word,
        range: wordRange
      };
    }
  }

  return null;
}

/**
 * Create definition provider
 * @param {Function} getIndex - Function to get current index
 * @returns {vscode.DefinitionProvider}
 */
function definitionProvider(getIndex) {
  return {
    provideDefinition(doc, pos) {
      const index = getIndex();
      const ref = findKeyUnderCursor(doc, pos);

      if (!ref) return undefined;

      const def = index.keys.get(ref.key);
      if (!def) return undefined;

      const uri = typeof def.fileUri === 'string'
        ? vscode.Uri.parse(def.fileUri)
        : def.fileUri;

      const range = def.range
        ? new vscode.Range(
            new vscode.Position(def.range.start.line, def.range.start.character),
            new vscode.Position(def.range.end.line, def.range.end.character)
          )
        : new vscode.Position(0, 0);

      return new vscode.Location(uri, range);
    }
  };
}

module.exports = { definitionProvider, findKeyUnderCursor };
