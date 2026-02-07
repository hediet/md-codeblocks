/**
 * Mock of vscode module for testing.
 * Only includes types/functions needed by the extension.
 */

export class Position {
  constructor(public readonly line: number, public readonly character: number) {}
}

export class Range {
  readonly start: Position;
  readonly end: Position;

  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number);
  constructor(start: Position, end: Position);
  constructor(
    startOrStartLine: number | Position,
    endOrStartCharacter: number | Position,
    endLine?: number,
    endCharacter?: number,
  ) {
    if (typeof startOrStartLine === 'number') {
      this.start = new Position(startOrStartLine, endOrStartCharacter as number);
      this.end = new Position(endLine!, endCharacter!);
    } else {
      this.start = startOrStartLine;
      this.end = endOrStartCharacter as Position;
    }
  }
}

export class Uri {
  constructor(
    public readonly scheme: string,
    public readonly authority: string,
    public readonly path: string,
    public readonly query: string,
    public readonly fragment: string,
  ) {}

  get fsPath(): string {
    return this.path;
  }

  static file(path: string): Uri {
    return new Uri('file', '', path, '', '');
  }

  toString(): string {
    return `${this.scheme}://${this.path}`;
  }
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export class Diagnostic {
  constructor(
    public readonly range: Range,
    public readonly message: string,
    public readonly severity: DiagnosticSeverity = DiagnosticSeverity.Error,
  ) {}
}

export enum CompletionItemKind {
  Text = 0,
  Method = 1,
  Function = 2,
  Constructor = 3,
  Field = 4,
  Variable = 5,
  Class = 6,
  Interface = 7,
  Module = 8,
  Property = 9,
  Unit = 10,
  Value = 11,
  Enum = 12,
  Keyword = 13,
  Snippet = 14,
  Color = 15,
  File = 16,
  Reference = 17,
  Folder = 18,
}

export class CompletionItem {
  insertText?: string | SnippetString;
  documentation?: string;
  detail?: string;

  constructor(
    public readonly label: string,
    public readonly kind?: CompletionItemKind,
  ) {}
}

export class SnippetString {
  constructor(public readonly value: string) {}
}

export class MarkdownString {
  value = '';

  appendMarkdown(value: string): this {
    this.value += value;
    return this;
  }

  appendCodeblock(code: string, language?: string): this {
    this.value += `\n\`\`\`${language ?? ''}\n${code}\n\`\`\`\n`;
    return this;
  }
}

export class Hover {
  constructor(public readonly contents: MarkdownString) {}
}

export interface TextLine {
  text: string;
}

export interface TextDocument {
  uri: Uri;
  languageId: string;
  version: number;
  getText(range?: Range): string;
  lineAt(line: number): TextLine;
  lineCount: number;
}

export interface CancellationToken {
  isCancellationRequested: boolean;
}

export interface CompletionContext {
  triggerKind: number;
  triggerCharacter?: string;
}

export const workspace = {
  fs: {
    writeFile: async (_uri: Uri, _content: Uint8Array) => {},
    readFile: async (_uri: Uri) => new Uint8Array(),
  },
  openTextDocument: async (_uri: Uri) => ({} as TextDocument),
  getWorkspaceFolder: (_uri: Uri) => ({ uri: Uri.file('/workspace') }),
  textDocuments: [] as TextDocument[],
  onDidChangeTextDocument: () => ({ dispose: () => {} }),
  onDidOpenTextDocument: () => ({ dispose: () => {} }),
};

export const window = {
  showInformationMessage: (_message: string) => {},
  showWarningMessage: (_message: string) => {},
  showErrorMessage: (_message: string) => {},
  activeTextEditor: undefined as { document: TextDocument } | undefined,
  showTextDocument: async (_doc: TextDocument) => {},
};

export const languages = {
  registerHoverProvider: () => ({ dispose: () => {} }),
  registerCompletionItemProvider: () => ({ dispose: () => {} }),
  createDiagnosticCollection: (_name: string) => ({
    set: (_uri: Uri, _diagnostics: Diagnostic[]) => {},
    dispose: () => {},
  }),
};

export const commands = {
  registerCommand: (_command: string, _callback: (...args: unknown[]) => unknown) => ({ dispose: () => {} }),
};
