const vscode = require('vscode');
const { buildIndex, watchWorkspace } = require('./src/indexer');
const { definitionProvider } = require('./src/providers/definition');
const { completionProvider } = require('./src/providers/completion');
const { hoverProvider } = require('./src/providers/hover');
const { diagnosticsRunner } = require('./src/providers/diagnostics');

let index = null;
let diagnostics = null;
let outputChannel = null;

/**
 * Activate the extension
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
  // Create output channel for logs
  outputChannel = vscode.window.createOutputChannel('Awilix Helper');
  context.subscriptions.push(outputChannel);

  outputChannel.appendLine('Awilix Helper extension is now active');
  console.log('Awilix Helper extension is now active');

  // Get configuration
  const config = vscode.workspace.getConfiguration('awilixHelper');
  const ignorePatterns = config.get('indexIgnore', []);

  // Build initial index
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    outputChannel.appendLine('No workspace folder found, Awilix Helper will not activate');
    console.log('No workspace folder found, Awilix Helper will not activate');
    return;
  }

  outputChannel.appendLine('Building Awilix index...');
  console.log('Building Awilix index...');
  index = await buildIndex(workspaceFolders, ignorePatterns, outputChannel);
  outputChannel.appendLine(`Indexed ${index.keys.size} Awilix keys`);
  console.log(`Indexed ${index.keys.size} Awilix keys`);

  // Create diagnostic collection
  diagnostics = vscode.languages.createDiagnosticCollection('awilix');
  context.subscriptions.push(diagnostics);

  // Language selector for JavaScript files
  const selector = [
    { language: 'javascript', scheme: 'file' },
    { language: 'javascriptreact', scheme: 'file' }
  ];

  // Register providers
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      selector,
      definitionProvider(() => index)
    ),
    vscode.languages.registerCompletionItemProvider(
      selector,
      completionProvider(() => index),
      '.', // Trigger on dot (for cradle.)
      "'", // Trigger on quote (for resolve(''))
      '"', // Trigger on double quote
      '{', // Trigger on opening brace (for constructor({...}))
      ','  // Trigger on comma (for multiple params in constructor)
    ),
    vscode.languages.registerHoverProvider(
      selector,
      hoverProvider(() => index)
    )
  );

  // Run initial diagnostics
  diagnosticsRunner(index, diagnostics);

  // Watch for file changes
  const watcher = watchWorkspace(vscode.workspace, async () => {
    outputChannel.appendLine('Files changed, rebuilding Awilix index...');
    console.log('Files changed, rebuilding Awilix index...');
    index = await buildIndex(workspaceFolders, ignorePatterns, outputChannel);
    console.log(`Re-indexed ${index.keys.size} Awilix keys`);
    diagnosticsRunner(index, diagnostics);
  });

  context.subscriptions.push(watcher);

  // Watch for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('awilixHelper')) {
        outputChannel.appendLine('Configuration changed, rebuilding index...');
        console.log('Configuration changed, rebuilding index...');
        const newConfig = vscode.workspace.getConfiguration('awilixHelper');
        const newIgnorePatterns = newConfig.get('indexIgnore', []);
        index = await buildIndex(workspaceFolders, newIgnorePatterns, outputChannel);
        diagnosticsRunner(index, diagnostics);
      }
    })
  );

  // Register command to show index status
  context.subscriptions.push(
    vscode.commands.registerCommand('awilixHelper.showIndexStatus', () => {
      outputChannel.clear();
      outputChannel.appendLine('=== Awilix Helper - Current Index Status ===\n');

      if (!index) {
        outputChannel.appendLine('Index not built yet');
        outputChannel.show();
        return;
      }

      outputChannel.appendLine(`Total keys registered: ${index.keys.size}`);
      outputChannel.appendLine(`Total resolves/usages found: ${index.resolves.length}\n`);

      outputChannel.appendLine('=== Registered Keys ===');
      for (const [key, meta] of index.keys.entries()) {
        const fileUri = typeof meta.fileUri === 'string' ? meta.fileUri : meta.fileUri.fsPath;
        const filePath = fileUri.replace('file://', '');
        outputChannel.appendLine(`\n• ${key}`);
        outputChannel.appendLine(`  Kind: ${meta.kind}`);
        if (meta.lifetime) outputChannel.appendLine(`  Lifetime: ${meta.lifetime}`);
        outputChannel.appendLine(`  File: ${filePath}`);
        if (meta.exportName) outputChannel.appendLine(`  Export: ${meta.exportName}`);
      }

      outputChannel.appendLine('\n=== Usages by Type ===');
      const usagesByType = {};
      for (const resolve of index.resolves) {
        usagesByType[resolve.type] = (usagesByType[resolve.type] || 0) + 1;
      }
      for (const [type, count] of Object.entries(usagesByType)) {
        outputChannel.appendLine(`${type}: ${count}`);
      }

      outputChannel.show();
    })
  );

  outputChannel.appendLine('Awilix Helper is ready!');
  outputChannel.appendLine('\nRun command "Awilix: Show Index Status" to see detailed information');
  console.log('Awilix Helper is ready!');
}

/**
 * Deactivate the extension
 */
function deactivate() {
  console.log('Awilix Helper deactivated');
}

module.exports = { activate, deactivate };
