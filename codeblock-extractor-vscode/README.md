# Codeblock Extractor for VS Code

Editor integration for `@vscode/codeblock-extractor`. Get TypeScript language features inside markdown code blocks.

## Features

### Real-time File Generation

Generated files are kept in sync as you edit markdown. Changes are debounced (300ms) to avoid excessive disk I/O.

### TypeScript Language Features

Inside annotated code blocks, you get:

- **Hover information** - See types and documentation
- **Completions** - IntelliSense for code and annotation YAML properties
- **Go to Definition** - Navigate to type definitions
- **Diagnostics** - TypeScript errors shown inline in markdown

### Stale File Management

When you remove a `@codeblock` annotation, the generated file becomes "stale". A toolbar button appears to clean up stale files on demand—no automatic deletion that might surprise you.

## Getting Started

1. Install the extension
2. Open a markdown file with `@codeblock` annotations
3. Start typing—files are generated automatically

### Example Markdown

````markdown
<!-- @codeblock-config
outDir: examples
-->

<!-- @codeblock hello.ts -->
```typescript
export function greet(name: string): string {
  return `Hello, ${name}!`;
}
```
````

## Commands

| Command | Description |
|---------|-------------|
| **Codeblock Extractor: Extract Codeblocks** | Force immediate extraction |
| **Codeblock Extractor: Clean Stale Files** | Delete orphaned generated files |

## Editor Toolbar

When editing a markdown file with stale (orphaned) generated files, a trash icon appears in the editor toolbar. Click it to clean up files that are no longer referenced by any `@codeblock` annotation.

## How It Works

The extension creates an "editor projection" from generated TypeScript files back into your markdown:

1. **Parse** - Markdown is parsed to find `@codeblock` annotations
2. **Generate** - TypeScript files are written to the configured `outDir`
3. **Project** - TypeScript language server results are mapped back to markdown positions

This means you get full TypeScript support without leaving your documentation.

## Configuration

### Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `codeblockExtractor.enable` | `true` | Enable/disable the extension |

### Markdown Configuration

Use `@codeblock-config` in your markdown:

```html
<!-- @codeblock-config
outDir: .examples    # Where to generate files
prefix: |            # Prepended to all files
  // Auto-generated
postfix: |           # Appended to all files
  export {};
-->
```

## Related

- [@vscode/codeblock-extractor](https://www.npmjs.com/package/@vscode/codeblock-extractor) - CLI and library

## License

MIT
