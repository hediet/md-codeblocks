import * as vscode from 'vscode';
import * as path from 'path';
import { parse, Document, CodeBlockNode, getAnnotatedCodeBlocks, generate, GeneratedFile } from '@vscode/codeblock-extractor';

/** Cached parse result for a document */
interface ParsedDocument {
  version: number;
  document: Document;
  generatedFiles: GeneratedFile[];
}

/**
 * Service that manages codeblock parsing and generated file mapping.
 * Opens generated files in VS Code so TypeScript language server sees them.
 */
export class CodeblockService {
  private readonly _cache = new Map<string, ParsedDocument>();
  private readonly _openedDocuments = new Set<string>();

  /** Get parsed document, using cache if version matches */
  getDocument(doc: vscode.TextDocument): Document {
    const cached = this._cache.get(doc.uri.toString());
    if (cached && cached.version === doc.version) {
      return cached.document;
    }

    const text = doc.getText();
    const { document: parsed, errors: _errors } = parse(text, doc.uri.fsPath);
    const result = generate(parsed);

    this._cache.set(doc.uri.toString(), {
      version: doc.version,
      document: parsed,
      generatedFiles: [...result.files],
    });

    return parsed;
  }

  /** Get generated files for a document */
  getGeneratedFiles(doc: vscode.TextDocument): GeneratedFile[] {
    this.getDocument(doc); // Ensure cache is populated
    return this._cache.get(doc.uri.toString())?.generatedFiles ?? [];
  }

  /** Find which generated file a codeblock maps to */
  findGeneratedFileForCodeblock(doc: vscode.TextDocument, codeblock: CodeBlockNode): GeneratedFile | undefined {
    const generated = this.getGeneratedFiles(doc);
    // Match by finding the generated file that contains this codeblock's code
    return generated.find(g => g.sourceBlocks.some(b => b === codeblock));
  }

  /** Get codeblock at position */
  getCodeblockAtPosition(doc: vscode.TextDocument, position: vscode.Position): CodeBlockNode | undefined {
    const parsed = this.getDocument(doc);
    const annotated = getAnnotatedCodeBlocks(parsed);
    
    for (const block of annotated) {
      const startLine = block.range.start.line - 1; // Convert to 0-based
      const endLine = block.range.end.line - 1;
      
      if (position.line >= startLine && position.line <= endLine) {
        return block;
      }
    }
    return undefined;
  }

  /** Check if position is inside an @codeblock annotation comment */
  isInAnnotationComment(doc: vscode.TextDocument, position: vscode.Position): boolean {
    const lineText = doc.lineAt(position.line).text;
    const textBefore = lineText.substring(0, position.character);
    
    // Check if we're in an HTML comment that starts with @codeblock
    if (textBefore.includes('<!--') && !textBefore.includes('-->')) {
      const commentStart = textBefore.lastIndexOf('<!--');
      const afterComment = textBefore.substring(commentStart);
      return afterComment.includes('@codeblock');
    }

    // Check multi-line comment - scan backwards
    for (let line = position.line; line >= 0; line--) {
      const text = doc.lineAt(line).text;
      if (text.includes('-->')) break;
      if (text.includes('<!--') && text.includes('@codeblock')) {
        return true;
      }
    }
    
    return false;
  }

  /** Extract files and open them in VS Code so TypeScript sees them */
  async extractAndOpenFiles(doc: vscode.TextDocument): Promise<void> {
    const generated = this.getGeneratedFiles(doc);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('Document must be in a workspace folder');
      return;
    }

    const baseDir = path.dirname(doc.uri.fsPath);
    const parsed = this.getDocument(doc);
    const outDir = parsed.config?.outDir ?? '.examples';
    const fullOutDir = path.resolve(baseDir, outDir);

    // Write files to disk
    const fs = vscode.workspace.fs;
    for (const file of generated) {
      const filePath = path.join(fullOutDir, file.path);
      const uri = vscode.Uri.file(filePath);
      await fs.writeFile(uri, Buffer.from(file.content, 'utf8'));
    }

    vscode.window.showInformationMessage(`Generated ${generated.length} file(s) in ${outDir}`);

    // Open documents in VS Code (hidden) so TypeScript language server indexes them
    await this.openGeneratedDocuments(generated, fullOutDir);
  }

  /** Open generated documents so TypeScript language server sees them */
  async openGeneratedDocuments(files: GeneratedFile[], outDir: string): Promise<void> {
    for (const file of files) {
      const filePath = path.join(outDir, file.path);
      if (this._openedDocuments.has(filePath)) continue;

      try {
        const uri = vscode.Uri.file(filePath);
        // Open the document (this makes TS language server aware of it)
        await vscode.workspace.openTextDocument(uri);
        this._openedDocuments.add(filePath);
      } catch {
        // File may not exist yet, that's ok
      }
    }
  }

  /** Map a position in the markdown to the corresponding position in generated file */
  mapPositionToGenerated(
    doc: vscode.TextDocument,
    position: vscode.Position
  ): { uri: vscode.Uri; position: vscode.Position } | undefined {
    const codeblock = this.getCodeblockAtPosition(doc, position);
    if (!codeblock || !codeblock.annotation) return undefined;

    const generated = this.findGeneratedFileForCodeblock(doc, codeblock);
    if (!generated) return undefined;

    const baseDir = path.dirname(doc.uri.fsPath);
    const parsed = this.getDocument(doc);
    const outDir = parsed.config?.outDir ?? '.examples';
    const fullPath = path.resolve(baseDir, outDir, generated.path);

    // Calculate offset within the codeblock's code content
    const codeStartLine = codeblock.codeRange.start.line - 1; // Convert to 0-based
    const lineInCode = position.line - codeStartLine;

    // Calculate line offset from prefixes in the generated file
    // Generated file structure: config.prefix + annotation.prefix + code + annotation.postfix + config.postfix
    const configPrefix = parsed.config?.prefix ?? '';
    const blockPrefix = codeblock.annotation.prefix ?? '';
    
    const configPrefixLines = configPrefix ? configPrefix.trimEnd().split('\n').length : 0;
    const blockPrefixLines = blockPrefix ? blockPrefix.trimEnd().split('\n').length : 0;
    
    // Find which block this is in the generated file (for multi-block files)
    let linesBeforeThisBlock = 0;
    for (const sourceBlock of generated.sourceBlocks) {
      if (sourceBlock === codeblock) break;
      // Each previous block contributes its code lines plus a separator
      linesBeforeThisBlock += sourceBlock.code.split('\n').length + 2; // +2 for blank line separator
    }

    const targetLine = configPrefixLines + blockPrefixLines + linesBeforeThisBlock + lineInCode;

    return {
      uri: vscode.Uri.file(fullPath),
      position: new vscode.Position(targetLine, position.character),
    };
  }
}
