import * as vscode from 'vscode';
import * as path from 'path';
import { CodeblockService } from './CodeblockService';
import type { GeneratedFileSync } from './GeneratedFileSync';

/**
 * Provides go-to-definition for @codeblock annotations and code inside codeblocks.
 * - From @codeblock annotation: goes to the generated file
 * - From code inside a codeblock: forwards to TypeScript
 */
export class CodeblockDefinitionProvider implements vscode.DefinitionProvider {
  constructor(
    private readonly _service: CodeblockService,
    private readonly _fileSync: GeneratedFileSync
  ) {}

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Definition | vscode.LocationLink[] | undefined> {
    // Check if we're inside a codeblock's code content - forward to TypeScript
    const codeblock = this._service.getCodeblockAtPosition(document, position);
    if (codeblock?.annotation) {
      const codeStartLine = codeblock.codeRange.start.line - 1; // 0-based
      const codeEndLine = codeblock.codeRange.end.line - 1;

      if (position.line >= codeStartLine && position.line <= codeEndLine) {
        return this._getTypeScriptDefinition(document, position);
      }
    }

    // Check if we're on a @codeblock annotation - go to generated file
    const line = document.lineAt(position.line).text;
    if (line.includes('@codeblock') && !line.includes('@codeblock-config')) {
      return this._getGeneratedFileLocation(document, position);
    }

    return undefined;
  }

  private async _getTypeScriptDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Definition | vscode.LocationLink[] | undefined> {
    const mapped = this._service.mapPositionToGenerated(document, position);
    if (!mapped) {
      return undefined;
    }

    // Ensure the generated file is open
    const generatedDoc = await this._fileSync.ensureGeneratedFileOpen(mapped.uri.fsPath);
    if (!generatedDoc) {
      return undefined;
    }

    // Execute definition provider on the generated file
    const definitions = await vscode.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>(
      'vscode.executeDefinitionProvider',
      mapped.uri,
      mapped.position
    );

    return definitions;
  }

  private _getGeneratedFileLocation(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Location | undefined {
    // Find the codeblock that this annotation belongs to
    // Look for the next code fence after this position
    for (let i = position.line; i < document.lineCount; i++) {
      const line = document.lineAt(i).text;
      if (line.trim().startsWith('```') && i > position.line) {
        // Found the code fence, find the codeblock
        const codeblock = this._service.getCodeblockAtPosition(
          document,
          new vscode.Position(i + 1, 0)
        );
        if (codeblock?.annotation) {
          const generated = this._service.findGeneratedFileForCodeblock(document, codeblock);
          if (generated) {
            // Compute full path
            const baseDir = path.dirname(document.uri.fsPath);
            const parsed = this._service.getDocument(document);
            const outDir = parsed.config?.outDir ?? '.examples';
            const fullPath = path.resolve(baseDir, outDir, generated.path);
            
            return new vscode.Location(vscode.Uri.file(fullPath), new vscode.Position(0, 0));
          }
        }
        break;
      }
    }

    return undefined;
  }
}
