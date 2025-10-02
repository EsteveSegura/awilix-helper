const vscode = require('vscode');
const { findKeyUnderCursor } = require('./definition');

/**
 * Create hover provider
 * @param {Function} getIndex - Function to get current index
 * @returns {vscode.HoverProvider}
 */
function hoverProvider(getIndex) {
  return {
    provideHover(doc, pos) {
      const ref = findKeyUnderCursor(doc, pos);
      if (!ref) return undefined;

      const index = getIndex();
      const def = index.keys.get(ref.key);
      if (!def) return undefined;

      const md = new vscode.MarkdownString();

      // Title with key name
      md.appendMarkdown(`**${ref.key}**\n\n`);

      // Kind and lifetime
      const lifetimeStr = def.lifetime ? ` • ${def.lifetime}` : '';
      md.appendMarkdown(`_${def.kind}${lifetimeStr}_\n\n`);

      // File path
      const fileUri = typeof def.fileUri === 'string' ? def.fileUri : def.fileUri.fsPath;
      const filePath = fileUri.replace('file://', '');
      md.appendCodeblock(filePath, 'text');

      // Export name if available
      if (def.exportName) {
        md.appendMarkdown(`\n**Export:** \`${def.exportName}\``);
      }

      md.isTrusted = true;
      md.supportHtml = true;

      return new vscode.Hover(md, ref.range);
    }
  };
}

module.exports = { hoverProvider };
