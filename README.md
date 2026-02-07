# md-codeblocks

Extract code blocks from Markdown documentation into real files — get full language-server support (types, completions, diagnostics) for your documentation examples.

<!-- @codeblock-config
outDir: .examples
-->

## Packages

| Package | Description |
|---------|-------------|
| [`@vscode/codeblock-extractor`](codeblock-extractor/) | CLI & library for extracting annotated code blocks |
| [`codeblock-extractor-vscode`](codeblock-extractor-vscode/) | VS Code extension with language features inside Markdown code blocks |

## How It Works

Annotate fenced code blocks in your Markdown with `<!-- @codeblock -->` comments. The tool extracts them into real files so language servers and other tooling can check them.

### Example

This README itself uses `@codeblock` annotations ([view source](https://raw.githubusercontent.com/hediet/md-codeblocks/main/README.md)). The example below is a valid Markdown document that can itself be extracted:

<!-- @codeblock
file: example.md
additionalFiles:
  - suffix: .expected/counter.tsx
    content: |-
      import { useState } from "react";

      export function Counter() {
        const [count, setCount] = useState(0);
        return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
      }

      // Continuation of counter.tsx
      export default Counter;
-->
````markdown
<!-- @codeblock-config
outDir: .examples
-->

<!-- @codeblock counter.tsx -->
```tsx
import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

<!-- @codeblock -->
```tsx
// Continuation of counter.tsx
export default Counter;
```
````

Running `codeblock-extractor extract README.md` extracts `.examples/example.md`, which can itself be extracted to produce `.examples/counter.tsx`.

### Document Config (`@codeblock-config`)

A `@codeblock-config` comment sets the output directory and default prefix/postfix for all generated files:

<!-- @codeblock
file: config-example.md
additionalFiles:
  - suffix: .expected/greeter.ts
    content: |-
      // Auto-generated — do not edit
      export function greet(name: string) {
        return `Hello, ${name}!`;
      }
      export {};
-->
````markdown
<!-- @codeblock-config
outDir: .examples
prefix: |
  // Auto-generated — do not edit
postfix: |
  export {};
-->

<!-- @codeblock greeter.ts -->
```ts
export function greet(name: string) {
  return `Hello, ${name}!`;
}
```
````

Extracting the above produces `.examples/greeter.ts` with the prefix and postfix applied.

### Block Annotations (`@codeblock`)

Each `@codeblock` comment can specify a filename, per-file prefix/postfix, replacements, and more:

<!-- @codeblock
file: annotation-example.md
additionalFiles:
  - suffix: .expected/math.ts
    content: |-
      export const answer = 42;

      export const pi = 3.14;
-->
````markdown
<!-- @codeblock-config
outDir: .examples
-->

<!-- @codeblock
file: math.ts
replace:
  - ["PLACEHOLDER", "42"]
-->
```ts
export const answer = PLACEHOLDER;
```

<!-- @codeblock
skip: true
-->
```ts
// This block is skipped — for display only
```

<!-- @codeblock -->
```ts
export const pi = 3.14;
```
````

Extracting the above produces `.examples/math.ts` with `PLACEHOLDER` replaced by `42`.

## CLI Usage

```sh
# Extract code blocks into files
codeblock-extractor extract README.md

# Check that generated files are up-to-date (for CI)
codeblock-extractor check README.md

# Watch mode
codeblock-extractor watch README.md

# Override output directory
codeblock-extractor extract README.md --outdir .examples
```

## VS Code Extension

The VS Code extension provides language features inside annotated Markdown code blocks:

- **Hover** — type information and documentation
- **Completions** — IntelliSense for code and annotation YAML
- **Go to Definition** — navigate to type definitions
- **Diagnostics** — errors shown inline in the Markdown editor
- **Stale file cleanup** — toolbar button to remove orphaned files

See the [extension README](codeblock-extractor-vscode/README.md) for details.

## Development

```sh
pnpm install
pnpm --filter @vscode/codeblock-extractor run build
pnpm --filter @vscode/codeblock-extractor run test
```

## License

MIT
