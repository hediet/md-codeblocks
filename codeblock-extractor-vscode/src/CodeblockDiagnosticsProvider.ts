import * as vscode from 'vscode';
import * as path from 'path';
import { CodeblockService } from './CodeblockService';
import { getAnnotatedCodeBlocks, ConfigNode, GeneratedFile } from '@vscode/codeblock-extractor';

/**
 * Provides diagnostics for @codeblock annotations.
 * Forwards TypeScript diagnostics from generated files back to markdown.
 */
export class CodeblockDiagnosticsProvider implements vscode.Disposable {
  private readonly _diagnosticCollection: vscode.DiagnosticCollection;
  private readonly _tsDiagnosticCollection: vscode.DiagnosticCollection;
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _generatedFileToSource = new Map<string, { sourceUri: string; outDir: string }>();

  constructor(private readonly _service: CodeblockService) {
    this._diagnosticCollection = vscode.languages.createDiagnosticCollection('codeblock-extractor');
    this._tsDiagnosticCollection = vscode.languages.createDiagnosticCollection('codeblock-typescript');
    this._disposables.push(this._diagnosticCollection);
    this._disposables.push(this._tsDiagnosticCollection);

    // Listen for diagnostics changes on any file to forward TS errors
    this._disposables.push(
      vscode.languages.onDidChangeDiagnostics(e => {
        this._forwardTypeScriptDiagnostics(e.uris);
      })
    );
  }

  dispose(): void {
    for (const d of this._disposables) {
      d.dispose();
    }
  }

  async updateDiagnostics(document: vscode.TextDocument): Promise<void> {
    const diagnostics: vscode.Diagnostic[] = [];

    try {
      const parsed = this._service.getDocument(document);
      
      // Track generated files for TS diagnostic forwarding
      const generated = this._service.getGeneratedFiles(document);
      const baseDir = path.dirname(document.uri.fsPath);
      const outDir = parsed.config?.outDir ?? '.examples';
      const fullOutDir = path.resolve(baseDir, outDir);

      for (const file of generated) {
        const fullPath = path.join(fullOutDir, file.path);
        this._generatedFileToSource.set(fullPath, {
          sourceUri: document.uri.toString(),
          outDir: fullOutDir,
        });
      }

      // Check for config issues
      const configNodes = parsed.nodes.filter((n): n is ConfigNode => n.type === 'config');
      if (configNodes.length > 1) {
        for (const node of configNodes.slice(1)) {
          const range = this._toVscodeRange(node.range);
          diagnostics.push(new vscode.Diagnostic(
            range,
            'Multiple @codeblock-config directives found. Only the first one is used.',
            vscode.DiagnosticSeverity.Warning
          ));
        }
      }

      // Check annotated code blocks
      const annotated = getAnnotatedCodeBlocks(parsed);

      for (const block of annotated) {
        // Validate additionalFiles
        if (block.annotation?.additionalFiles) {
          for (const additional of block.annotation.additionalFiles) {
            if (!additional.suffix) {
              const range = block.annotationRange 
                ? this._toVscodeRange(block.annotationRange)
                : this._toVscodeRange(block.range);

              diagnostics.push(new vscode.Diagnostic(
                range,
                'additionalFiles entry missing "suffix" property',
                vscode.DiagnosticSeverity.Error
              ));
            }
            if (!additional.content) {
              const range = block.annotationRange 
                ? this._toVscodeRange(block.annotationRange)
                : this._toVscodeRange(block.range);

              diagnostics.push(new vscode.Diagnostic(
                range,
                'additionalFiles entry missing "content" property',
                vscode.DiagnosticSeverity.Error
              ));
            }
          }
        }
      }

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      diagnostics.push(new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 0),
        `Failed to parse codeblock annotations: ${message}`,
        vscode.DiagnosticSeverity.Error
      ));
    }

    this._diagnosticCollection.set(document.uri, diagnostics);
  }

  /** Forward TypeScript diagnostics from generated files to markdown source */
  private _forwardTypeScriptDiagnostics(changedUris: readonly vscode.Uri[]): void {
    for (const uri of changedUris) {
      const filePath = uri.fsPath;
      const sourceInfo = this._generatedFileToSource.get(filePath);
      if (!sourceInfo) continue;

      // This is a generated file - forward its diagnostics to the source markdown
      const tsDiagnostics = vscode.languages.getDiagnostics(uri);
      if (tsDiagnostics.length === 0) continue;

      // Find the source document
      const sourceDoc = vscode.workspace.textDocuments.find(
        d => d.uri.toString() === sourceInfo.sourceUri
      );
      if (!sourceDoc) continue;

      // Map diagnostics back to markdown
      const mappedDiagnostics = this._mapDiagnosticsToSource(
        sourceDoc,
        uri,
        tsDiagnostics,
        sourceInfo.outDir
      );

      // Merge with existing diagnostics for this source
      const existing = this._tsDiagnosticCollection.get(sourceDoc.uri) ?? [];
      const filtered = [...existing].filter(d => {
        // Remove diagnostics that came from this generated file
        const source = (d as any)._generatedFile;
        return source !== filePath;
      });

      this._tsDiagnosticCollection.set(sourceDoc.uri, [...filtered, ...mappedDiagnostics]);
    }
  }

  /** Map diagnostics from generated file back to markdown codeblock */
  private _mapDiagnosticsToSource(
    sourceDoc: vscode.TextDocument,
    generatedUri: vscode.Uri,
    diagnostics: readonly vscode.Diagnostic[],
    outDir: string
  ): vscode.Diagnostic[] {
    const parsed = this._service.getDocument(sourceDoc);
    const generated = this._service.getGeneratedFiles(sourceDoc);
    const relativePath = path.relative(outDir, generatedUri.fsPath);

    // Find which generated file this is
    const genFile = generated.find(g => g.path === relativePath);
    if (!genFile) return [];

    const mapped: vscode.Diagnostic[] = [];

    for (const diag of diagnostics) {
      // Map the line back to a codeblock
      const mappedRange = this._mapRangeToSource(
        sourceDoc,
        parsed,
        genFile,
        diag.range
      );

      if (mappedRange) {
        const newDiag = new vscode.Diagnostic(
          mappedRange,
          diag.message,
          diag.severity
        );
        newDiag.source = 'TypeScript (via codeblock)';
        newDiag.code = diag.code;
        (newDiag as any)._generatedFile = generatedUri.fsPath;
        mapped.push(newDiag);
      }
    }

    return mapped;
  }

  /** Map a range from generated file back to markdown source */
  private _mapRangeToSource(
    sourceDoc: vscode.TextDocument,
    parsed: ReturnType<CodeblockService['getDocument']>,
    genFile: GeneratedFile,
    range: vscode.Range
  ): vscode.Range | null {
    // Calculate prefix lines to subtract
    const configPrefix = parsed.config?.prefix ?? '';
    const configPrefixLines = configPrefix ? configPrefix.trimEnd().split('\n').length : 0;

    // Find which source block this line corresponds to
    let lineInGenerated = range.start.line;
    let currentLine = configPrefixLines;

    for (const block of genFile.sourceBlocks) {
      const blockPrefix = block.annotation?.prefix ?? '';
      const blockPrefixLines = blockPrefix ? blockPrefix.trimEnd().split('\n').length : 0;
      currentLine += blockPrefixLines;

      const codeLines = block.code.split('\n').length;
      
      if (lineInGenerated >= currentLine && lineInGenerated < currentLine + codeLines) {
        // This diagnostic is in this block
        const lineInCode = lineInGenerated - currentLine;
        const codeStartLine = block.codeRange.start.line - 1; // 0-based
        const targetLine = codeStartLine + lineInCode;

        return new vscode.Range(
          targetLine, range.start.character,
          targetLine + (range.end.line - range.start.line), range.end.character
        );
      }

      currentLine += codeLines + 2; // +2 for separator between blocks
    }

    return null;
  }

  private _toVscodeRange(range: { start: { line: number; column: number }; end: { line: number; column: number } }): vscode.Range {
    return new vscode.Range(
      range.start.line - 1,
      range.start.column,
      range.end.line - 1,
      range.end.column
    );
  }
}
