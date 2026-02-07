# @vscode/codeblock-extractor

Extract annotated code blocks from Markdown into real files — so language servers, linters, and other tooling can check your documentation examples.

## Install

```sh
npm install @vscode/codeblock-extractor
```

## CLI

```sh
# Extract code blocks into files
codeblock-extractor extract README.md

# Check that generated files are up-to-date (for CI)
codeblock-extractor check README.md

# Watch mode — regenerate on changes
codeblock-extractor watch README.md

# Override output directory
codeblock-extractor extract README.md --outdir .examples

# Delete output directory before generating
codeblock-extractor extract README.md --delete-out
```

## Markdown Syntax

### Document Config

Set output directory and default prefix/postfix for all generated files:

```markdown
<!-- @codeblock-config
outDir: .examples
prefix: |
  // Auto-generated — do not edit
postfix: |
  export {};
-->
```

### Annotated Code Blocks

Annotate a fenced code block with `<!-- @codeblock -->` to include it in extraction:

````markdown
<!-- @codeblock counter.tsx -->
```tsx
import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```
````

Multiple blocks with the same filename (or without a filename after the first) are concatenated:

````markdown
<!-- @codeblock utils.ts -->
```ts
export function add(a: number, b: number) { return a + b; }
```

<!-- @codeblock -->
```ts
export function sub(a: number, b: number) { return a - b; }
```
````

### Annotation Options

The full YAML annotation format:

```yaml
file: counter.tsx     # output filename (shorthand: <!-- @codeblock counter.tsx -->)
prefix: ...           # per-file prefix (extends config prefix)
postfix: ...          # per-file postfix (extends config postfix)
skip: true            # exclude this block from output
replace:              # sequential find-replace on the code
  - ["foo", "bar"]
  - { find: "old", with: "new" }
  - "line to remove"  # string-only → replaced with empty string
additionalFiles:      # extra files generated alongside
  - suffix: .spec.tsx
    content: |
      import { Counter } from "./counter";
```

## Library API

```ts
import { parse, generate } from "@vscode/codeblock-extractor";

const source = fs.readFileSync("README.md", "utf-8");
const { document, errors } = parse(source, "README.md");
const { files, outDir } = generate(document);

for (const file of files) {
  console.log(file.path, file.content);
}
```

### `parse(source, sourcePath)`

Parses Markdown into a `Document` AST. Returns `{ document, errors }`.

### `generate(document, options?)`

Generates output files from a parsed document. Returns `{ files, outDir }`.

Options:
- `outDir` — override output directory (defaults to config value or `".examples"`)

## License

MIT
