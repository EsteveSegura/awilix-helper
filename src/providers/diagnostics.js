const vscode = require('vscode');

/**
 * Run diagnostics on the index and update the diagnostic collection
 * @param {{keys: Map, resolves: Array}} index - The current index
 * @param {vscode.DiagnosticCollection} collection - VS Code diagnostic collection
 */
function diagnosticsRunner(index, collection) {
  const byFile = new Map();

  // Check all resolve calls and cradle accesses
  for (const ref of index.resolves) {
    const uriString = typeof ref.uri === 'string' ? ref.uri : ref.uri.toString();
    const fsPath = uriString.replace('file://', '');

    if (!byFile.has(fsPath)) {
      byFile.set(fsPath, []);
    }

    const arr = byFile.get(fsPath);

    // Check if the key exists in the index
    if (!index.keys.has(ref.key)) {
      const range = new vscode.Range(
        new vscode.Position(ref.range.start.line, ref.range.start.character),
        new vscode.Position(ref.range.end.line, ref.range.end.character)
      );

      const diagnostic = new vscode.Diagnostic(
        range,
        `Awilix: key "${ref.key}" is not registered in the container`,
        vscode.DiagnosticSeverity.Error
      );

      diagnostic.source = 'awilix';
      diagnostic.code = 'unregistered-key';

      arr.push(diagnostic);
    }
  }

  // Clear previous diagnostics
  collection.clear();

  // Set new diagnostics per file
  for (const [fsPath, diags] of byFile) {
    collection.set(vscode.Uri.file(fsPath), diags);
  }
}

module.exports = { diagnosticsRunner };
