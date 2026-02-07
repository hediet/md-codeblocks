import { describe, it, expect } from 'vitest';
import { parse } from './parser.js';
import { generate } from './generator.js';

describe('generator', () => {
  describe('basic generation', () => {
    it('generates nothing for empty document', () => {
      const { document } = parse('', 'test.md');
      const result = generate(document);

      expect(result).toMatchInlineSnapshot(`
        {
          "files": [],
          "outDir": ".examples",
        }
      `);
    });

    it('generates nothing for non-annotated code blocks', () => {
      const md = '```tsx\nconst x = 1;\n```';
      const { document } = parse(md, 'test.md');
      const result = generate(document);

      expect(result.files).toHaveLength(0);
    });

    it('generates file from annotated code block', () => {
      const md = `<!-- @codeblock counter.tsx -->
\`\`\`tsx
const x = 1;
\`\`\``;
      const { document } = parse(md, 'test.md');
      const result = generate(document);

      expect(result.files.map(f => ({ path: f.path, content: f.content }))).toMatchInlineSnapshot(`
        [
          {
            "content": "const x = 1;",
            "path": "counter.tsx",
          },
        ]
      `);
    });
  });

  describe('file grouping', () => {
    it('groups multiple blocks into same file', () => {
      const md = `<!-- @codeblock counter.tsx -->
\`\`\`tsx
class Counter {}
\`\`\`

Text...

<!-- @codeblock -->
\`\`\`tsx
export { Counter };
\`\`\``;
      const { document } = parse(md, 'test.md');
      const result = generate(document);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].content).toMatchInlineSnapshot(`
        "class Counter {}

        export { Counter };"
      `);
    });

    it('generates separate files for different names', () => {
      const md = `<!-- @codeblock a.tsx -->
\`\`\`tsx
const a = 1;
\`\`\`

<!-- @codeblock b.tsx -->
\`\`\`tsx
const b = 2;
\`\`\``;
      const { document } = parse(md, 'test.md');
      const result = generate(document);

      expect(result.files.map(f => f.path)).toMatchInlineSnapshot(`
        [
          "a.tsx",
          "b.tsx",
        ]
      `);
    });

    it('auto-generates filenames when no file specified', () => {
      const md = `<!-- @codeblock -->
\`\`\`tsx
const x = 1;
\`\`\`

<!-- @codeblock file: b.py -->
\`\`\`python
x = 2
\`\`\`

<!-- @codeblock -->
\`\`\`python
y = 3
\`\`\``;
      const { document } = parse(md, 'test.md');
      const result = generate(document);

      // First gets auto-generated name, then b.py, then continues b.py
      expect(result.files.map(f => f.path)).toMatchInlineSnapshot(`
        [
          "snippet-1.tsx",
          "b.py",
        ]
      `);
    });
  });

  describe('prefix and postfix', () => {
    it('applies config prefix to all files', () => {
      const md = `<!-- @codeblock-config
prefix: |
  import React from 'react';
-->

<!-- @codeblock counter.tsx -->
\`\`\`tsx
const Counter = () => <div/>;
\`\`\``;
      const { document } = parse(md, 'test.md');
      const result = generate(document);

      expect(result.files[0].content).toMatchInlineSnapshot(`
        "import React from 'react';
        const Counter = () => <div/>;"
      `);
    });

    it('applies config postfix to all files', () => {
      const md = `<!-- @codeblock-config
postfix: |
  export default Component;
-->

<!-- @codeblock counter.tsx -->
\`\`\`tsx
const Component = () => <div/>;
\`\`\``;
      const { document } = parse(md, 'test.md');
      const result = generate(document);

      expect(result.files[0].content).toMatchInlineSnapshot(`
        "const Component = () => <div/>;
        export default Component;"
      `);
    });

    it('combines config and block prefix/postfix', () => {
      const md = `<!-- @codeblock-config
prefix: |
  // Config prefix
-->

<!-- @codeblock
file: test.tsx
prefix: |
  // Block prefix
postfix: |
  // Block postfix
-->
\`\`\`tsx
code();
\`\`\``;
      const { document } = parse(md, 'test.md');
      const result = generate(document);

      expect(result.files[0].content).toMatchInlineSnapshot(`
        "// Config prefix
        // Block prefix
        code();
        // Block postfix"
      `);
    });
  });

  describe('replacements', () => {
    it('applies object-style replacements', () => {
      const md = `<!-- @codeblock
file: test.tsx
replace:
  - find: "..."
    with: "// impl"
-->
\`\`\`tsx
function foo() { ... }
\`\`\``;
      const { document } = parse(md, 'test.md');
      const result = generate(document);

      expect(result.files[0].content).toBe('function foo() { // impl }');
    });

    it('applies tuple-style replacements', () => {
      const md = `<!-- @codeblock
file: test.tsx
replace:
  - ["...", "// done"]
-->
\`\`\`tsx
function bar() { ... }
\`\`\``;
      const { document } = parse(md, 'test.md');
      const result = generate(document);

      expect(result.files[0].content).toBe('function bar() { // done }');
    });

    it('applies multiple replacements in order', () => {
      const md = `<!-- @codeblock
file: test.tsx
replace:
  - ["A", "B"]
  - ["B", "C"]
-->
\`\`\`tsx
A
\`\`\``;
      const { document } = parse(md, 'test.md');
      const result = generate(document);

      // A -> B -> C
      expect(result.files[0].content).toBe('C');
    });
  });

  describe('skip option', () => {
    it('skips blocks with skip: true', () => {
      const md = `<!-- @codeblock
file: test.tsx
skip: true
-->
\`\`\`tsx
skipped
\`\`\`

<!-- @codeblock included.tsx -->
\`\`\`tsx
included
\`\`\``;
      const { document } = parse(md, 'test.md');
      const result = generate(document);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('included.tsx');
    });
  });

  describe('additional files', () => {
    it('generates additional files with suffix', () => {
      const md = `<!-- @codeblock
file: counter.tsx
additionalFiles:
  - suffix: .spec.tsx
    content: |
      test('works', () => {});
-->
\`\`\`tsx
class Counter {}
\`\`\``;
      const { document } = parse(md, 'test.md');
      const result = generate(document);

      expect(result.files.map(f => ({ path: f.path, content: f.content }))).toMatchInlineSnapshot(`
        [
          {
            "content": "class Counter {}",
            "path": "counter.tsx",
          },
          {
            "content": "test('works', () => {});",
            "path": "counter.spec.tsx",
          },
        ]
      `);
    });

    it('applies config prefix to additional files', () => {
      const md = `<!-- @codeblock-config
prefix: |
  // Header
-->

<!-- @codeblock
file: main.tsx
additionalFiles:
  - suffix: .test.tsx
    content: test content
-->
\`\`\`tsx
main content
\`\`\``;
      const { document } = parse(md, 'test.md');
      const result = generate(document);

      expect(result.files[1].content).toMatchInlineSnapshot(`
        "// Header
        test content"
      `);
    });
  });

  describe('outDir option', () => {
    it('uses config outDir', () => {
      const md = `<!-- @codeblock-config
outDir: .generated
-->

<!-- @codeblock test.tsx -->
\`\`\`tsx
code
\`\`\``;
      const { document } = parse(md, 'test.md');
      const result = generate(document);

      expect(result.outDir).toBe('.generated');
    });

    it('option overrides config outDir', () => {
      const md = `<!-- @codeblock-config
outDir: .generated
-->

<!-- @codeblock test.tsx -->
\`\`\`tsx
code
\`\`\``;
      const { document } = parse(md, 'test.md');
      const result = generate(document, { outDir: '.override' });

      expect(result.outDir).toBe('.override');
    });

    it('defaults to .examples', () => {
      const md = `<!-- @codeblock test.tsx -->
\`\`\`tsx
code
\`\`\``;
      const { document } = parse(md, 'test.md');
      const result = generate(document);

      expect(result.outDir).toBe('.examples');
    });
  });
});
