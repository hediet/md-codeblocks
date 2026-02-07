import * as vscode from 'vscode';
import * as path from 'path';
import { CodeblockService } from './CodeblockService';

/** Tracks generated files for a single markdown source */
interface SourceFileState {
  /** URI of the source markdown file */
  sourceUri: string;
  /** Output directory (absolute path) */
  outDir: string;
  /** Map of relative path -> last generated content */
  generatedFiles: Map<string, string>;
  /** Timestamp of last update */
  lastUpdated: number;
}

/** Represents a stale (orphaned) file that is no longer referenced */
export interface StaleFile {
  /** Absolute path to the stale file */
  absolutePath: string;
  /** Relative path within the output directory */
  relativePath: string;
  /** Output directory containing this file */
  outDir: string;
  /** Source markdown file URI that originally generated this file */
  sourceUri: string;
}

/**
 * Synchronizes generated files to disk as markdown documents change.
 * Handles debouncing and opening files for TypeScript.
 * Tracks stale files but does not automatically delete them.
 */
export class GeneratedFileSync implements vscode.Disposable {
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _sourceStates = new Map<string, SourceFileState>();
  private readonly _pendingUpdates = new Map<string, ReturnType<typeof setTimeout>>();
  /** Map of file path -> opened TextDocument (keeps them alive) */
  private readonly _openedDocuments = new Map<string, vscode.TextDocument>();
  /** Set of stale files (absolute paths) that are no longer referenced */
  private readonly _staleFiles = new Map<string, StaleFile>();

  private readonly _onDidChangeStaleFiles = new vscode.EventEmitter<void>();
  /** Fired when the set of stale files changes */
  readonly onDidChangeStaleFiles = this._onDidChangeStaleFiles.event;

  /** Debounce delay for file writes (ms) */
  private readonly _debounceDelay = 300;

  constructor(private readonly _service: CodeblockService) {
    this._disposables.push(this._onDidChangeStaleFiles);
  }

  dispose(): void {
    for (const timeout of this._pendingUpdates.values()) {
      clearTimeout(timeout);
    }
    this._pendingUpdates.clear();
    for (const d of this._disposables) {
      d.dispose();
    }
  }

  /** Schedule an update for the given document (debounced) */
  scheduleUpdate(doc: vscode.TextDocument): void {
    const key = doc.uri.toString();

    // Clear any pending update
    const existing = this._pendingUpdates.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    // Schedule new update
    this._pendingUpdates.set(key, setTimeout(() => {
      this._pendingUpdates.delete(key);
      this._performUpdate(doc).catch(err => {
        console.error('Failed to update generated files:', err);
      });
    }, this._debounceDelay));
  }

  /** Perform the actual file sync */
  private async _performUpdate(doc: vscode.TextDocument): Promise<void> {
    const parsed = this._service.getDocument(doc);
    const generated = this._service.getGeneratedFiles(doc);

    if (generated.length === 0) {
      // No generated files - track any existing ones as stale
      this._cleanupSource(doc.uri.toString());
      return;
    }

    const baseDir = path.dirname(doc.uri.fsPath);
    const outDir = parsed.config?.outDir ?? '.examples';
    const fullOutDir = path.resolve(baseDir, outDir);

    // Get or create state for this source
    const sourceKey = doc.uri.toString();
    let state = this._sourceStates.get(sourceKey);
    if (!state) {
      state = {
        sourceUri: sourceKey,
        outDir: fullOutDir,
        generatedFiles: new Map(),
        lastUpdated: Date.now(),
      };
      this._sourceStates.set(sourceKey, state);
    }

    // Track which files are still referenced
    const currentFiles = new Set<string>();

    // Write files that have changed
    const fs = vscode.workspace.fs;
    for (const file of generated) {
      currentFiles.add(file.path);
      const existingContent = state.generatedFiles.get(file.path);

      if (existingContent !== file.content) {
        // Content changed - write to disk
        const filePath = path.join(fullOutDir, file.path);
        const uri = vscode.Uri.file(filePath);

        try {
          // Ensure directory exists
          const dir = path.dirname(filePath);
          await fs.createDirectory(vscode.Uri.file(dir));
        } catch {
          // Directory may already exist
        }

        await fs.writeFile(uri, Buffer.from(file.content, 'utf8'));
        state.generatedFiles.set(file.path, file.content);

        // Open the document so TypeScript sees it
        await this._ensureDocumentOpen(filePath);
      }
    }

    // Find orphaned files and track them as stale
    let staleFilesChanged = false;
    for (const existingPath of state.generatedFiles.keys()) {
      if (!currentFiles.has(existingPath)) {
        const absolutePath = path.join(fullOutDir, existingPath);
        if (!this._staleFiles.has(absolutePath)) {
          this._staleFiles.set(absolutePath, {
            absolutePath,
            relativePath: existingPath,
            outDir: fullOutDir,
            sourceUri: sourceKey,
          });
          staleFilesChanged = true;
        }
        // Remove from generatedFiles since it's no longer managed
        state.generatedFiles.delete(existingPath);
      }
    }

    // Check if any tracked stale files from this source are now referenced again
    for (const [absolutePath, staleFile] of this._staleFiles) {
      if (staleFile.sourceUri === sourceKey && currentFiles.has(staleFile.relativePath)) {
        this._staleFiles.delete(absolutePath);
        staleFilesChanged = true;
      }
    }

    if (staleFilesChanged) {
      this._onDidChangeStaleFiles.fire();
    }

    state.lastUpdated = Date.now();
  }

  /** Get all stale files */
  getStaleFiles(): StaleFile[] {
    return Array.from(this._staleFiles.values());
  }

  /** Check if there are any stale files */
  hasStaleFiles(): boolean {
    return this._staleFiles.size > 0;
  }

  /** Clean up all stale files */
  async cleanStaleFiles(): Promise<number> {
    const fs = vscode.workspace.fs;
    const filesToDelete = Array.from(this._staleFiles.values());
    let deletedCount = 0;

    for (const staleFile of filesToDelete) {
      try {
        await fs.delete(vscode.Uri.file(staleFile.absolutePath));
        this._staleFiles.delete(staleFile.absolutePath);
        this._openedDocuments.delete(staleFile.absolutePath);
        deletedCount++;
      } catch {
        // File may already be deleted or inaccessible
        this._staleFiles.delete(staleFile.absolutePath);
      }
    }

    if (filesToDelete.length > 0) {
      this._onDidChangeStaleFiles.fire();
    }

    return deletedCount;
  }

  /** Track all generated files for a source as stale when the source is removed */
  private _cleanupSource(sourceKey: string): void {
    const state = this._sourceStates.get(sourceKey);
    if (!state) return;

    let staleFilesChanged = false;
    for (const [relativePath] of state.generatedFiles) {
      const absolutePath = path.join(state.outDir, relativePath);
      if (!this._staleFiles.has(absolutePath)) {
        this._staleFiles.set(absolutePath, {
          absolutePath,
          relativePath,
          outDir: state.outDir,
          sourceUri: sourceKey,
        });
        staleFilesChanged = true;
      }
    }

    this._sourceStates.delete(sourceKey);

    if (staleFilesChanged) {
      this._onDidChangeStaleFiles.fire();
    }
  }

  /** Ensure a document is open in VS Code so TypeScript sees it */
  private async _ensureDocumentOpen(filePath: string): Promise<vscode.TextDocument | undefined> {
    // Check if we have a cached document that's still valid
    const cached = this._openedDocuments.get(filePath);
    if (cached && !cached.isClosed) {
      return cached;
    }

    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      this._openedDocuments.set(filePath, doc);
      return doc;
    } catch {
      // File may not exist yet
      return undefined;
    }
  }

  /** Ensure a generated file is open and return its document */
  async ensureGeneratedFileOpen(filePath: string): Promise<vscode.TextDocument | undefined> {
    return this._ensureDocumentOpen(filePath);
  }

  /** Force immediate sync for a document */
  async forceSync(doc: vscode.TextDocument): Promise<void> {
    // Cancel any pending debounced update
    const key = doc.uri.toString();
    const existing = this._pendingUpdates.get(key);
    if (existing) {
      clearTimeout(existing);
      this._pendingUpdates.delete(key);
    }

    await this._performUpdate(doc);
  }

  /** Get the output directory for a source document */
  getOutDir(doc: vscode.TextDocument): string | undefined {
    const state = this._sourceStates.get(doc.uri.toString());
    return state?.outDir;
  }
}
