const vscode = require('vscode');

/**
 * Detect if we're in an Awilix context where completion should trigger
 * @param {vscode.TextDocument} doc
 * @param {vscode.Position} pos
 * @returns {'inResolveString'|'afterCradleDot'|'inConstructorDestructuring'|null}
 */
function detectAwilixContext(doc, pos) {
  const line = doc.lineAt(pos.line).text;
  const textBefore = line.substring(0, pos.character);

  // Check if we're inside a resolve('...') string
  if (/\.resolve\s*\(\s*['"][^'"]*$/.test(textBefore)) {
    return 'inResolveString';
  }

  // Check if we just typed cradle.
  if (/\.cradle\.$/.test(textBefore)) {
    return 'afterCradleDot';
  }

  // Check if we're in a constructor destructuring parameter
  // Pattern: constructor({key, <cursor>
  if (/constructor\s*\(\s*\{[^}]*$/.test(textBefore)) {
    return 'inConstructorDestructuring';
  }

  // Check if we're in a function destructuring parameter
  // Pattern: function name({key, <cursor> or const name = ({key, <cursor>
  if (/(?:function\s+\w+\s*\(|^\s*(?:const|let|var)?\s*\w+\s*=\s*(?:function)?\s*\()\s*\{[^}]*$/.test(textBefore)) {
    return 'inConstructorDestructuring';
  }

  return null;
}

/**
 * Create completion provider
 * @param {Function} getIndex - Function to get current index
 * @returns {vscode.CompletionItemProvider}
 */
function completionProvider(getIndex) {
  return {
    provideCompletionItems(doc, pos) {
      const ctx = detectAwilixContext(doc, pos);
      if (!ctx) return undefined;

      const items = [];
      const index = getIndex();

      for (const [key, meta] of index.keys.entries()) {
        const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property);

        // Build detail string
        const lifetimeStr = meta.lifetime ? ` • ${meta.lifetime}` : '';
        item.detail = `${meta.kind}${lifetimeStr}`;

        // Show file path in documentation
        const fileUri = typeof meta.fileUri === 'string' ? meta.fileUri : meta.fileUri.fsPath;
        item.documentation = fileUri.replace('file://', '');

        // Sort by key name
        item.sortText = key;

        items.push(item);
      }

      return items;
    }
  };
}

module.exports = { completionProvider, detectAwilixContext };
