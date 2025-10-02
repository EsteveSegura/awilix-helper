const path = require('path');
const fs = require('fs');
const { parseJs, traverse } = require('./ast');

/**
 * Build a map of imports/requires in a file
 * @param {import('@babel/types').File} ast
 * @param {string} currentFilePath
 * @returns {Map<string, {source: string, isDefault: boolean}>}
 */
function buildImportMap(ast, currentFilePath) {
  const imports = new Map();

  traverse(ast, {
    ImportDeclaration(path) {
      const source = path.node.source.value;
      for (const spec of path.node.specifiers) {
        if (spec.type === 'ImportDefaultSpecifier') {
          imports.set(spec.local.name, { source, isDefault: true });
        } else if (spec.type === 'ImportSpecifier') {
          imports.set(spec.local.name, { source, isDefault: false, imported: spec.imported.name });
        } else if (spec.type === 'ImportNamespaceSpecifier') {
          imports.set(spec.local.name, { source, isNamespace: true });
        }
      }
    },

    VariableDeclarator(path) {
      // Handle require() calls
      const init = path.node.init;
      if (init && init.type === 'CallExpression' &&
          init.callee.type === 'Identifier' &&
          init.callee.name === 'require' &&
          init.arguments[0] &&
          init.arguments[0].type === 'StringLiteral') {
        const source = init.arguments[0].value;
        const id = path.node.id;

        if (id.type === 'Identifier') {
          imports.set(id.name, { source, isDefault: true });
        } else if (id.type === 'ObjectPattern') {
          // const { foo, bar } = require('...')
          for (const prop of id.properties) {
            if (prop.type === 'ObjectProperty' && prop.key.type === 'Identifier') {
              imports.set(prop.value.name || prop.key.name, {
                source,
                isDefault: false,
                imported: prop.key.name
              });
            }
          }
        }
      }
    }
  });

  return imports;
}

/**
 * Resolve a module path to an absolute file path
 * @param {string} modulePath
 * @param {string} fromFile
 * @returns {string|null}
 */
function resolveModulePath(modulePath, fromFile) {
  const fromDir = path.dirname(fromFile);

  // Handle relative paths
  if (modulePath.startsWith('.')) {
    const resolved = path.resolve(fromDir, modulePath);

    // Try with extension
    if (fs.existsSync(resolved)) {
      if (fs.statSync(resolved).isFile()) return resolved;
      // Try index.js if directory
      const indexPath = path.join(resolved, 'index.js');
      if (fs.existsSync(indexPath)) return indexPath;
    }

    // Try adding .js extension
    if (fs.existsSync(resolved + '.js')) return resolved + '.js';

    return null;
  }

  // Handle node_modules (basic support)
  try {
    const resolved = require.resolve(modulePath, { paths: [fromDir] });
    return resolved;
  } catch (e) {
    return null;
  }
}

/**
 * Resolve the origin of a symbol (identifier) in the code
 * @param {string} currentFileUri - Current file URI as string
 * @param {import('@babel/types').Node} symbolNode - The symbol node to resolve
 * @param {import('@babel/types').File} ast - The AST of the current file
 * @param {Map<string, {source: string, isDefault: boolean}>} importMap - Map of imports
 * @returns {{fileUri: string, exportName: string|null, range: any, kind: string}}
 */
function resolveSymbolOrigin(currentFileUri, symbolNode, ast, importMap) {
  const currentFilePath = currentFileUri.replace('file://', '');

  // If symbolNode is an Identifier, check if it's imported
  if (symbolNode && symbolNode.type === 'Identifier') {
    const name = symbolNode.name;
    const importInfo = importMap.get(name);

    if (importInfo) {
      // It's imported, try to resolve the source file
      const resolvedPath = resolveModulePath(importInfo.source, currentFilePath);

      if (resolvedPath) {
        return {
          fileUri: 'file://' + resolvedPath,
          exportName: importInfo.imported || null,
          range: null, // We'd need to parse the target file to get the exact range
          kind: 'unknown'
        };
      }
    }

    // Not imported or couldn't resolve, return local position
    return {
      fileUri: currentFileUri,
      exportName: name,
      range: symbolNode.loc ? {
        start: { line: symbolNode.loc.start.line - 1, character: symbolNode.loc.start.column },
        end: { line: symbolNode.loc.end.line - 1, character: symbolNode.loc.end.column }
      } : null,
      kind: 'unknown'
    };
  }

  // For inline values or other expressions
  return {
    fileUri: currentFileUri,
    exportName: null,
    range: symbolNode && symbolNode.loc ? {
      start: { line: symbolNode.loc.start.line - 1, character: symbolNode.loc.start.column },
      end: { line: symbolNode.loc.end.line - 1, character: symbolNode.loc.end.column }
    } : null,
    kind: 'value'
  };
}

module.exports = {
  buildImportMap,
  resolveModulePath,
  resolveSymbolOrigin
};
