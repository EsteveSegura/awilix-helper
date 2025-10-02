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
  const textAfter = line.substring(pos.character);

  // Check if we're inside a resolve('...') string - more flexible pattern
  // Matches: .resolve('|'), .resolve("|"), .resolve('abc|')
  const resolveMatch = textBefore.match(/\.resolve\s*\(\s*(['"])([^'"]*?)$/);
  if (resolveMatch) {
    // Make sure the string isn't closed yet
    const quote = resolveMatch[1];
    const closingQuote = textAfter.indexOf(quote);
    if (closingQuote === -1 || closingQuote > 0) {
      return 'inResolveString';
    }
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
    provideCompletionItems(doc, pos, token, context) {
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

        // For resolve strings, replace the entire string content
        if (ctx === 'inResolveString') {
          const line = doc.lineAt(pos.line).text;
          const textBefore = line.substring(0, pos.character);
          const match = textBefore.match(/\.resolve\s*\(\s*(['"])([^'"]*?)$/);

          if (match) {
            const quote = match[1];
            const startPos = textBefore.lastIndexOf(quote) + 1;
            const textAfter = line.substring(pos.character);
            const endQuoteIndex = textAfter.indexOf(quote);

            // Replace range from opening quote to closing quote (or end of string)
            item.range = new vscode.Range(
              pos.line,
              startPos,
              pos.line,
              endQuoteIndex >= 0 ? pos.character + endQuoteIndex : pos.character
            );
          }
        }

        items.push(item);
      }

      return items;
    }
  };
}

module.exports = { completionProvider, detectAwilixContext };
