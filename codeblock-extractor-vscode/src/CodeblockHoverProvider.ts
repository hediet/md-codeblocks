import * as vscode from 'vscode';
import { CodeblockService } from './CodeblockService';

/**
 * Provides hover information for @codeblock annotations and annotated code blocks.
 * For code inside codeblocks, forwards the request to TypeScript and maps the result back.
 */
export class CodeblockHoverProvider implements vscode.HoverProvider {
  constructor(private readonly _service: CodeblockService) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | null> {
    // Check if we're inside a codeblock's code content
    const codeblock = this._service.getCodeblockAtPosition(document, position);
    if (codeblock?.annotation) {
      // Check if position is within the actual code (not the fence)
      const codeStartLine = codeblock.codeRange.start.line - 1; // 0-based
      const codeEndLine = codeblock.codeRange.end.line - 1;

      if (position.line >= codeStartLine && position.line <= codeEndLine) {
        // Forward to TypeScript language server
        const tsHover = await this._getTypeScriptHover(document, position, codeblock, token);
        if (tsHover) {
          return tsHover;
        }
      }
    }

    // Check if hovering over @codeblock annotation keyword
    const line = document.lineAt(position.line).text;
    if (line.includes('@codeblock-config') && this._isInComment(line, position.character)) {
      return this._createConfigHover();
    }

    if (line.includes('@codeblock') && this._isInComment(line, position.character)) {
      return this._createAnnotationHover();
    }

    return null;
  }

  private async _getTypeScriptHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    codeblock: { codeRange: { start: { line: number } }; annotation?: { prefix?: string } },
    _token: vscode.CancellationToken
  ): Promise<vscode.Hover | null> {
    // Map position to generated file
    const mapped = this._service.mapPositionToGenerated(document, position);
    if (!mapped) return null;

    try {
      // Request hover from TypeScript language server via VS Code's built-in command
      const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        mapped.uri,
        mapped.position
      );

      if (hovers && hovers.length > 0) {
        // Return the first hover, the range will be adjusted by VS Code
        return hovers[0];
      }
    } catch (err) {
      console.error('Failed to get TypeScript hover:', err);
    }

    return null;
  }

  private _isInComment(line: string, character: number): boolean {
    const beforePos = line.substring(0, character);
    const afterPos = line.substring(character);
    
    const commentStartBefore = beforePos.lastIndexOf('<!--');
    const commentEndBefore = beforePos.lastIndexOf('-->');
    
    return commentStartBefore > commentEndBefore || 
           (commentStartBefore >= 0 && !afterPos.includes('-->') && commentEndBefore < commentStartBefore);
  }

  private _createConfigHover(): vscode.Hover {
    const markdown = new vscode.MarkdownString();
    markdown.appendMarkdown(`## @codeblock-config\n\n`);
    markdown.appendMarkdown(`Document-level configuration for codeblock extraction.\n\n`);
    markdown.appendMarkdown(`### Properties\n\n`);
    markdown.appendMarkdown(`- **outDir**: Output directory for generated files (default: \`.examples\`)\n`);
    markdown.appendMarkdown(`- **prefix**: Default prefix prepended to all files\n`);
    markdown.appendMarkdown(`- **postfix**: Default postfix appended to all files\n`);

    return new vscode.Hover(markdown);
  }

  private _createAnnotationHover(): vscode.Hover {
    const markdown = new vscode.MarkdownString();
    markdown.appendMarkdown(`## @codeblock\n\n`);
    markdown.appendMarkdown(`Annotate a code block for extraction.\n\n`);
    markdown.appendMarkdown(`### Properties\n\n`);
    markdown.appendMarkdown(`- **file**: Output filename\n`);
    markdown.appendMarkdown(`- **prefix/postfix**: Code to prepend/append\n`);
    markdown.appendMarkdown(`- **skip**: Skip this block\n`);
    markdown.appendMarkdown(`- **replace**: Replacements to apply\n`);
    markdown.appendMarkdown(`- **additionalFiles**: Generate additional files\n`);

    return new vscode.Hover(markdown);
  }
}
