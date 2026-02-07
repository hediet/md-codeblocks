import * as vscode from 'vscode';
import { CodeblockService } from './CodeblockService';
import { CodeblockHoverProvider } from './CodeblockHoverProvider';
import { CodeblockCompletionProvider } from './CodeblockCompletionProvider';
import { CodeblockDefinitionProvider } from './CodeblockDefinitionProvider';
import { CodeblockDiagnosticsProvider } from './CodeblockDiagnosticsProvider';
import { GeneratedFileSync } from './GeneratedFileSync';

export function activate(context: vscode.ExtensionContext): void {
  const service = new CodeblockService();
  const fileSync = new GeneratedFileSync(service);
  context.subscriptions.push(fileSync);

  // Update context for toolbar button visibility
  const updateStaleFilesContext = () => {
    vscode.commands.executeCommand(
      'setContext',
      'codeblockExtractor.hasStaleFiles',
      fileSync.hasStaleFiles()
    );
  };

  // Listen for stale files changes
  context.subscriptions.push(
    fileSync.onDidChangeStaleFiles(() => {
      updateStaleFilesContext();
    })
  );
  
  // Register hover provider for markdown files
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { language: 'markdown' },
      new CodeblockHoverProvider(service)
    )
  );

  // Register completion provider for markdown files
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: 'markdown' },
      new CodeblockCompletionProvider(service, fileSync),
      '@', ':', ' ', '\n', '.', '<', '/', '"', "'"
    )
  );

  // Register definition provider for markdown files
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      { language: 'markdown' },
      new CodeblockDefinitionProvider(service, fileSync)
    )
  );

  // Register diagnostics
  const diagnosticsProvider = new CodeblockDiagnosticsProvider(service);
  context.subscriptions.push(diagnosticsProvider);

  // Update generated files and diagnostics on document changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.languageId === 'markdown') {
        // Sync generated files (debounced)
        fileSync.scheduleUpdate(e.document);
        // Update diagnostics
        diagnosticsProvider.updateDiagnostics(e.document);
      }
    })
  );

  // Handle markdown files being opened
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(async doc => {
      if (doc.languageId === 'markdown') {
        // Force immediate sync when file is opened
        await fileSync.forceSync(doc);
        diagnosticsProvider.updateDiagnostics(doc);
      }
    })
  );

  // Initial sync for all open markdown files
  for (const doc of vscode.workspace.textDocuments) {
    if (doc.languageId === 'markdown') {
      fileSync.forceSync(doc);
      diagnosticsProvider.updateDiagnostics(doc);
    }
  }

  // Register command to extract codeblocks
  context.subscriptions.push(
    vscode.commands.registerCommand('codeblockExtractor.extract', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'markdown') {
        vscode.window.showWarningMessage('Open a markdown file to extract codeblocks');
        return;
      }
      await fileSync.forceSync(editor.document);
      vscode.window.showInformationMessage('Codeblocks extracted');
    })
  );

  // Register command to go to generated file
  context.subscriptions.push(
    vscode.commands.registerCommand('codeblockExtractor.goToGenerated', async (uri: vscode.Uri) => {
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc);
    })
  );

  // Register command to clean stale files
  context.subscriptions.push(
    vscode.commands.registerCommand('codeblockExtractor.cleanStaleFiles', async () => {
      const staleFiles = fileSync.getStaleFiles();
      if (staleFiles.length === 0) {
        vscode.window.showInformationMessage('No stale files to clean');
        return;
      }

      const deletedCount = await fileSync.cleanStaleFiles();
      vscode.window.showInformationMessage(`Cleaned ${deletedCount} stale file(s)`);
    })
  );
}

export function deactivate(): void {
  // Cleanup handled by disposables
}
