const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

/**
 * Parse JavaScript code into an AST
 * @param {string} text - JavaScript source code
 * @returns {import('@babel/types').File} AST
 */
function parseJs(text) {
  return parser.parse(text, {
    sourceType: 'unambiguous',
    plugins: ['jsx', 'classProperties', 'dynamicImport', 'topLevelAwait']
  });
}

/**
 * Check if a node is a member call expression (e.g., container.register)
 * @param {import('@babel/types').Node} callee
 * @param {string} methodName
 * @returns {boolean}
 */
function isMemberCall(callee, methodName) {
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    callee.property.name === methodName
  );
}

/**
 * Check if a callee is an Awilix asX function (asClass, asFunction, asValue)
 * @param {import('@babel/types').Node} callee
 * @returns {boolean}
 */
function isAwilixAsX(callee) {
  if (callee.type !== 'MemberExpression') return false;
  const prop = callee.property;
  return (
    prop.type === 'Identifier' &&
    (prop.name === 'asClass' || prop.name === 'asFunction' || prop.name === 'asValue')
  );
}

/**
 * Check if a member expression is accessing cradle (e.g., container.cradle.key)
 * @param {import('@babel/types').Node} node
 * @returns {boolean}
 */
function isCradleAccess(node) {
  if (node.type !== 'MemberExpression') return false;
  const { object, property } = node;

  // Check for container.cradle.key pattern
  if (object.type === 'MemberExpression' &&
      object.property.type === 'Identifier' &&
      object.property.name === 'cradle' &&
      property.type === 'Identifier') {
    return true;
  }

  return false;
}

/**
 * Get property name from an object property key
 * @param {import('@babel/types').Node} key
 * @returns {string|null}
 */
function getPropName(key) {
  if (key.type === 'Identifier') return key.name;
  if (key.type === 'StringLiteral') return key.value;
  return null;
}

/**
 * Convert a Babel node location to a VS Code Range
 * @param {import('@babel/types').Node} node
 * @returns {{start: {line: number, character: number}, end: {line: number, character: number}}|null}
 */
function toRange(node) {
  if (!node.loc) return null;
  return {
    start: {
      line: node.loc.start.line - 1, // VS Code is 0-indexed
      character: node.loc.start.column
    },
    end: {
      line: node.loc.end.line - 1,
      character: node.loc.end.column
    }
  };
}

module.exports = {
  parseJs,
  traverse,
  isMemberCall,
  isAwilixAsX,
  isCradleAccess,
  getPropName,
  toRange
};
