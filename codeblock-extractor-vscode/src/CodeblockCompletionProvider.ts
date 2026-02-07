import * as vscode from 'vscode';
import { CodeblockService } from './CodeblockService';
import type { GeneratedFileSync } from './GeneratedFileSync';

/**
 * Provides completion items for @codeblock annotations and forwards TypeScript completions.
 */
export class CodeblockCompletionProvider implements vscode.CompletionItemProvider {
  constructor(
    private readonly _service: CodeblockService,
    private readonly _fileSync: GeneratedFileSync
  ) {}

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[] | vscode.CompletionList | undefined> {
    // First check if we're inside a code block - forward to TypeScript
    const tsCompletions = await this._getTypeScriptCompletions(document, position, context);
    if (tsCompletions) {
      return tsCompletions;
    }

    const line = document.lineAt(position.line).text;
    const textBefore = line.substring(0, position.character);

    // Check if we're in an HTML comment
    if (!this._isInHtmlComment(document, position)) {
      // Offer to start an annotation comment before a code block
      if (this._isBeforeCodeBlock(document, position)) {
        return this._getAnnotationStartCompletions();
      }
      return [];
    }

    // Check what to complete based on context
    if (textBefore.includes('@codeblock-config')) {
      return this._getConfigPropertyCompletions(textBefore);
    }

    if (textBefore.includes('@codeblock')) {
      return this._getAnnotationPropertyCompletions(textBefore);
    }

    // Start of annotation
    if (textBefore.includes('<!--') && textBefore.includes('@')) {
      return this._getDirectiveCompletions();
    }

    if (textBefore.includes('<!--')) {
      return [this._createDirectiveCompletion('@codeblock', 'Annotate a code block for extraction')];
    }

    return [];
  }

  private async _getTypeScriptCompletions(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.CompletionContext
  ): Promise<vscode.CompletionList | undefined> {
    const mapped = this._service.mapPositionToGenerated(document, position);
    if (!mapped) {
      return undefined;
    }

    // Ensure the generated file is open so TypeScript can analyze it
    const generatedDoc = await this._fileSync.ensureGeneratedFileOpen(mapped.uri.fsPath);
    if (!generatedDoc) {
      return undefined;
    }

    // Execute completion provider on the generated file
    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      mapped.uri,
      mapped.position,
      context.triggerCharacter
    );

    if (!completions || completions.items.length === 0) {
      return undefined;
    }

    // Clear ranges from completion items - they point to the generated file,
    // not the markdown file. VS Code will use the default range at cursor position.
    for (const item of completions.items) {
      item.range = undefined;
    }

    return completions;
  }

  private _isInHtmlComment(document: vscode.TextDocument, position: vscode.Position): boolean {
    const text = document.getText(new vscode.Range(
      new vscode.Position(Math.max(0, position.line - 10), 0),
      position
    ));

    // Count comment markers
    const openCount = (text.match(/<!--/g) || []).length;
    const closeCount = (text.match(/-->/g) || []).length;

    return openCount > closeCount;
  }

  private _isBeforeCodeBlock(document: vscode.TextDocument, position: vscode.Position): boolean {
    // Check if next non-empty line is a code fence
    for (let i = position.line + 1; i < document.lineCount && i < position.line + 3; i++) {
      const line = document.lineAt(i).text.trim();
      if (line === '') continue;
      return line.startsWith('```');
    }
    return false;
  }

  private _getAnnotationStartCompletions(): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];

    // Simple annotation
    const simple = new vscode.CompletionItem('@codeblock', vscode.CompletionItemKind.Snippet);
    simple.insertText = new vscode.SnippetString('<!-- @codeblock ${1:file.tsx} -->\n');
    simple.documentation = 'Add @codeblock annotation with filename';
    simple.detail = 'Codeblock annotation';
    items.push(simple);

    // Full annotation with YAML
    const full = new vscode.CompletionItem('@codeblock (full)', vscode.CompletionItemKind.Snippet);
    full.insertText = new vscode.SnippetString(
      '<!-- @codeblock\nfile: ${1:filename.tsx}\n${2:prefix: |\n  }\n-->\n'
    );
    full.documentation = 'Add @codeblock annotation with YAML config';
    full.detail = 'Codeblock annotation with config';
    items.push(full);

    // Config directive
    const config = new vscode.CompletionItem('@codeblock-config', vscode.CompletionItemKind.Snippet);
    config.insertText = new vscode.SnippetString(
      '<!-- @codeblock-config\noutDir: ${1:.examples}\n-->\n'
    );
    config.documentation = 'Add document-level @codeblock-config';
    config.detail = 'Codeblock configuration';
    items.push(config);

    return items;
  }

  private _getDirectiveCompletions(): vscode.CompletionItem[] {
    return [
      this._createDirectiveCompletion('@codeblock', 'Annotate a code block for extraction'),
      this._createDirectiveCompletion('@codeblock-config', 'Document-level configuration'),
    ];
  }

  private _createDirectiveCompletion(directive: string, description: string): vscode.CompletionItem {
    const item = new vscode.CompletionItem(directive, vscode.CompletionItemKind.Keyword);
    item.documentation = description;
    item.detail = 'Codeblock directive';
    return item;
  }

  private _getConfigPropertyCompletions(textBefore: string): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];
    const usedProps = this._extractUsedProperties(textBefore);

    const properties: Array<{ name: string; description: string; snippet: string }> = [
      { name: 'outDir', description: 'Output directory for generated files', snippet: 'outDir: ${1:.examples}' },
      { name: 'prefix', description: 'Default prefix prepended to all files', snippet: 'prefix: |\n  ${1}' },
      { name: 'postfix', description: 'Default postfix appended to all files', snippet: 'postfix: |\n  ${1}' },
    ];

    for (const prop of properties) {
      if (usedProps.has(prop.name)) continue;

      const item = new vscode.CompletionItem(prop.name, vscode.CompletionItemKind.Property);
      item.documentation = prop.description;
      item.insertText = new vscode.SnippetString(prop.snippet);
      item.detail = '@codeblock-config property';
      items.push(item);
    }

    return items;
  }

  private _getAnnotationPropertyCompletions(textBefore: string): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];
    const usedProps = this._extractUsedProperties(textBefore);

    const properties: Array<{ name: string; description: string; snippet: string }> = [
      { name: 'file', description: 'Output filename', snippet: 'file: ${1:filename.tsx}' },
      { name: 'prefix', description: 'Code to prepend to this file', snippet: 'prefix: |\n  ${1}' },
      { name: 'postfix', description: 'Code to append to this file', snippet: 'postfix: |\n  ${1}' },
      { name: 'skip', description: 'Skip this block (documentation only)', snippet: 'skip: true' },
      { name: 'replace', description: 'Array of replacements to apply', snippet: 'replace:\n  - find: ${1:pattern}\n    with: ${2:replacement}' },
      { name: 'additionalFiles', description: 'Generate additional files', snippet: 'additionalFiles:\n  - suffix: ${1:.spec.tsx}\n    content: |\n      ${2}' },
    ];

    for (const prop of properties) {
      if (usedProps.has(prop.name)) continue;

      const item = new vscode.CompletionItem(prop.name, vscode.CompletionItemKind.Property);
      item.documentation = prop.description;
      item.insertText = new vscode.SnippetString(prop.snippet);
      item.detail = '@codeblock property';
      items.push(item);
    }

    return items;
  }

  private _extractUsedProperties(text: string): Set<string> {
    const used = new Set<string>();
    const matches = text.matchAll(/^(\w+):/gm);
    for (const match of matches) {
      used.add(match[1]);
    }
    return used;
  }
}
