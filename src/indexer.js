const vscode = require('vscode');
const fs = require('fs');
const fg = require('fast-glob');
const path = require('path');
const { parseJs, traverse, isMemberCall, isAwilixAsX, isCradleAccess, getPropName, toRange } = require('./parsers/ast');
const { buildImportMap, resolveSymbolOrigin } = require('./parsers/resolvers');

/**
 * Analyze a registration call to extract kind, lifetime, and symbol
 * @param {import('@babel/types').Node} node - RHS of the registration property
 * @param {any} path - Babel path
 * @returns {{kind: string, lifetime: string|null, symbolNode: any}}
 */
function analyzeRegistration(node, path) {
  const info = { kind: 'value', lifetime: null, symbolNode: null };

  // Handle chained calls like awilix.asClass(X).singleton()
  let currentNode = node;

  // If it's a chained call expression, traverse down to find the asX call
  while (currentNode.type === 'CallExpression') {
    // Check if current node has a lifetime method
    if (currentNode.callee.type === 'MemberExpression') {
      const methodName = currentNode.callee.property.name;
      if (methodName === 'singleton' || methodName === 'scoped' || methodName === 'transient') {
        info.lifetime = methodName;
      }

      // Check if this is the asX call
      if (isAwilixAsX(currentNode.callee)) {
        const asX = currentNode.callee.property.name;
        info.kind = asX === 'asClass' ? 'class' : asX === 'asFunction' ? 'function' : 'value';
        info.symbolNode = currentNode.arguments[0] || null;
        break;
      }

      // Continue down the chain
      currentNode = currentNode.callee.object;
    } else if (isAwilixAsX(currentNode.callee)) {
      // Direct asX call without chaining
      const asX = currentNode.callee.property.name;
      info.kind = asX === 'asClass' ? 'class' : asX === 'asFunction' ? 'function' : 'value';
      info.symbolNode = currentNode.arguments[0] || null;
      break;
    } else {
      break;
    }
  }

  // If not a call expression, it's a direct value
  if (info.symbolNode === null && node.type !== 'CallExpression') {
    info.symbolNode = node;
  }

  return info;
}

/**
 * Index a single file
 * @param {string} fileUri - File URI
 * @param {string} text - File content
 * @param {any} logger - Optional logger
 * @returns {{keys: Array, resolves: Array}}
 */
function indexFile(fileUri, text, logger) {
  const result = { keys: [], resolves: [] };

  try {
    const ast = parseJs(text);
    const importMap = buildImportMap(ast, fileUri.replace('file://', ''));

    if (logger) {
      logger.appendLine(`  Parsing: ${fileUri.replace('file://', '')}`);
    }

    traverse(ast, {
      CallExpression(path) {
        const { callee, arguments: args } = path.node;

        // container.register({ ... })
        if (isMemberCall(callee, 'register')) {
          const [obj] = args;
          if (obj && obj.type === 'ObjectExpression') {
            for (const prop of obj.properties) {
              if (prop.type !== 'ObjectProperty') continue;

              const key = getPropName(prop.key);
              if (!key) continue;

              const regInfo = analyzeRegistration(prop.value, path);
              const def = resolveSymbolOrigin(fileUri, regInfo.symbolNode, ast, importMap);

              result.keys.push({
                key,
                fileUri: def.fileUri,
                exportName: def.exportName,
                range: def.range || toRange(prop.key),
                kind: regInfo.kind,
                lifetime: regInfo.lifetime
              });

              if (logger) {
                logger.appendLine(`    ✓ Registered key: "${key}" (${regInfo.kind}${regInfo.lifetime ? ', ' + regInfo.lifetime : ''})`);
              }
            }
          }
        }

        // container.resolve('key')
        if (isMemberCall(callee, 'resolve') && args[0]?.type === 'StringLiteral') {
          result.resolves.push({
            uri: fileUri,
            range: toRange(args[0]),
            key: args[0].value,
            type: 'resolveCall'
          });
        }
      },

      MemberExpression(path) {
        // container.cradle.key
        if (isCradleAccess(path.node)) {
          const key = path.node.property.name;
          result.resolves.push({
            uri: fileUri,
            range: toRange(path.node.property),
            key,
            type: 'cradleMember'
          });
        }
      },

      // Track constructor dependency injection patterns
      ClassMethod(path) {
        if (path.node.kind === 'constructor' && path.node.params.length > 0) {
          const param = path.node.params[0];

          // Check for destructuring pattern: constructor({key1, key2})
          if (param.type === 'ObjectPattern') {
            for (const prop of param.properties) {
              if (prop.type === 'ObjectProperty' && prop.key.type === 'Identifier') {
                const key = prop.key.name;
                result.resolves.push({
                  uri: fileUri,
                  range: toRange(prop.key),
                  key,
                  type: 'constructorInjection'
                });
              }
            }
          }
        }
      },

      // Also support function constructors (non-class)
      FunctionDeclaration(path) {
        if (path.node.params.length > 0) {
          const param = path.node.params[0];

          if (param.type === 'ObjectPattern') {
            for (const prop of param.properties) {
              if (prop.type === 'ObjectProperty' && prop.key.type === 'Identifier') {
                const key = prop.key.name;
                result.resolves.push({
                  uri: fileUri,
                  range: toRange(prop.key),
                  key,
                  type: 'constructorInjection'
                });
              }
            }
          }
        }
      }
    });
  } catch (error) {
    console.error(`Error parsing ${fileUri}:`, error.message);
  }

  return result;
}

/**
 * Build index from workspace
 * @param {vscode.WorkspaceFolder[]} workspaceFolders
 * @param {string[]} ignorePatterns
 * @param {any} logger - Optional logger
 * @returns {Promise<{keys: Map, resolves: Array}>}
 */
async function buildIndex(workspaceFolders, ignorePatterns = [], logger) {
  const index = {
    keys: new Map(),
    resolves: []
  };

  if (!workspaceFolders || workspaceFolders.length === 0) {
    if (logger) logger.appendLine('No workspace folders found');
    return index;
  }

  const defaultIgnore = [
    '**/node_modules/**',
    '**/dist/**',
    '**/out/**',
    '**/.git/**',
    '**/data/**',
    '**/.vscode/**',
    '**/.idea/**'
  ];
  const ignore = [...defaultIgnore, ...ignorePatterns];

  if (logger) {
    logger.appendLine('=== Starting Awilix Index Build ===');
    logger.appendLine(`Workspace folders: ${workspaceFolders.length}`);
    logger.appendLine(`Ignore patterns: ${ignore.join(', ')}`);
  }

  for (const folder of workspaceFolders) {
    if (logger) logger.appendLine(`\nScanning folder: ${folder.uri.fsPath}`);

    try {
      const files = await fg('**/*.js', {
        cwd: folder.uri.fsPath,
        absolute: true,
        ignore,
        suppressErrors: true,
        onlyFiles: true,
        followSymbolicLinks: false
      });

      if (logger) logger.appendLine(`Found ${files.length} JavaScript files`);

      if (files.length === 0) {
        if (logger) logger.appendLine('WARNING: No JavaScript files found. Check if the folder path is correct.');
      }

      for (const file of files) {
        const fileUri = 'file://' + file;

        try {
          const text = fs.readFileSync(file, 'utf-8');
          const fileIndex = indexFile(fileUri, text, logger);

          // Merge keys
          for (const keyInfo of fileIndex.keys) {
            index.keys.set(keyInfo.key, keyInfo);
          }

          // Merge resolves
          index.resolves.push(...fileIndex.resolves);
        } catch (fileError) {
          if (logger) logger.appendLine(`  ERROR reading file ${file}: ${fileError.message}`);
        }
      }
    } catch (globError) {
      if (logger) logger.appendLine(`ERROR during file search: ${globError.message}`);
      if (logger) logger.appendLine(`Stack: ${globError.stack}`);
    }
  }

  if (logger) {
    logger.appendLine('\n=== Index Build Complete ===');
    logger.appendLine(`Total keys registered: ${index.keys.size}`);
    logger.appendLine(`Total resolves found: ${index.resolves.length}`);
    logger.appendLine('\nRegistered keys:');
    for (const [key, meta] of index.keys.entries()) {
      logger.appendLine(`  - ${key}: ${meta.kind}${meta.lifetime ? ' (' + meta.lifetime + ')' : ''}`);
    }
  }

  return index;
}

/**
 * Watch workspace for changes
 * @param {vscode.workspace} workspace
 * @param {Function} onUpdate - Callback when files change
 */
function watchWorkspace(workspace, onUpdate) {
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.js');

  watcher.onDidChange(() => onUpdate());
  watcher.onDidCreate(() => onUpdate());
  watcher.onDidDelete(() => onUpdate());

  return watcher;
}

module.exports = {
  buildIndex,
  watchWorkspace,
  indexFile
};
