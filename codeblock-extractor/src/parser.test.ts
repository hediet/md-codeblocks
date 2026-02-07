import { describe, it, expect } from 'vitest';
import { parse, getCodeBlocks, getAnnotatedCodeBlocks } from './parser.js';

/** Simplify AST for snapshotting (removes ranges for readability) */
function simplify(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(simplify);

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    // Skip range/position info for cleaner snapshots
    if (key === 'range' || key === 'codeRange' || key === 'annotationRange') continue;
    result[key] = simplify(value);
  }
  return result;
}

describe('parser', () => {
  describe('basic parsing', () => {
    it('parses empty document', () => {
      const result = parse('', 'test.md');

      expect(simplify(result)).toMatchInlineSnapshot(`
        {
          "document": {
            "nodes": [],
            "sourcePath": "test.md",
          },
          "errors": [],
        }
      `);
    });

    it('parses text only', () => {
      const result = parse('# Hello\n\nSome text', 'test.md');

      expect(simplify(result)).toMatchInlineSnapshot(`
        {
          "document": {
            "nodes": [
              {
                "content": "# Hello

        Some text",
                "type": "text",
              },
            ],
            "sourcePath": "test.md",
          },
          "errors": [],
        }
      `);
    });

    it('parses code block without annotation', () => {
      const md = '```tsx\nconst x = 1;\n```';
      const result = parse(md, 'test.md');

      expect(simplify(result)).toMatchInlineSnapshot(`
        {
          "document": {
            "nodes": [
              {
                "annotation": undefined,
                "code": "const x = 1;",
                "language": "tsx",
                "rawAnnotationComment": undefined,
                "type": "codeblock",
              },
            ],
            "sourcePath": "test.md",
          },
          "errors": [],
        }
      `);
    });
  });

  describe('@codeblock annotation', () => {
    it('parses @codeblock with filename shorthand', () => {
      const md = `<!-- @codeblock counter.tsx -->
\`\`\`tsx
const x = 1;
\`\`\``;
      const result = parse(md, 'test.md');

      expect(simplify(result)).toMatchInlineSnapshot(`
        {
          "document": {
            "nodes": [
              {
                "annotation": {
                  "file": "counter.tsx",
                },
                "code": "const x = 1;",
                "language": "tsx",
                "rawAnnotationComment": "<!-- @codeblock counter.tsx -->",
                "type": "codeblock",
              },
            ],
            "sourcePath": "test.md",
          },
          "errors": [],
        }
      `);
    });

    it('parses @codeblock with YAML config', () => {
      const md = `<!-- @codeblock
file: counter.tsx
postfix: |
  export { Counter };
-->
\`\`\`tsx
class Counter {}
\`\`\``;
      const result = parse(md, 'test.md');

      expect(simplify(result)).toMatchInlineSnapshot(`
        {
          "document": {
            "nodes": [
              {
                "annotation": {
                  "file": "counter.tsx",
                  "postfix": "export { Counter };
        ",
                },
                "code": "class Counter {}",
                "language": "tsx",
                "rawAnnotationComment": "<!-- @codeblock
        file: counter.tsx
        postfix: |
          export { Counter };
        -->",
                "type": "codeblock",
              },
            ],
            "sourcePath": "test.md",
          },
          "errors": [],
        }
      `);
    });

    it('parses @codeblock with inline YAML', () => {
      const md = `<!-- @codeblock file: display.tsx -->
\`\`\`tsx
const Display = () => null;
\`\`\``;
      const result = parse(md, 'test.md');

      expect(simplify(result)).toMatchInlineSnapshot(`
        {
          "document": {
            "nodes": [
              {
                "annotation": {
                  "file": "display.tsx",
                },
                "code": "const Display = () => null;",
                "language": "tsx",
                "rawAnnotationComment": "<!-- @codeblock file: display.tsx -->",
                "type": "codeblock",
              },
            ],
            "sourcePath": "test.md",
          },
          "errors": [],
        }
      `);
    });

    it('parses @codeblock continuation (no file)', () => {
      const md = `<!-- @codeblock counter.tsx -->
\`\`\`tsx
class Counter {}
\`\`\`

Some text...

<!-- @codeblock -->
\`\`\`tsx
export { Counter };
\`\`\``;
      const result = parse(md, 'test.md');

      expect(simplify(result)).toMatchInlineSnapshot(`
        {
          "document": {
            "nodes": [
              {
                "annotation": {
                  "file": "counter.tsx",
                },
                "code": "class Counter {}",
                "language": "tsx",
                "rawAnnotationComment": "<!-- @codeblock counter.tsx -->",
                "type": "codeblock",
              },
              {
                "content": "

        Some text...

        ",
                "type": "text",
              },
              {
                "annotation": {},
                "code": "export { Counter };",
                "language": "tsx",
                "rawAnnotationComment": "<!-- @codeblock -->",
                "type": "codeblock",
              },
            ],
            "sourcePath": "test.md",
          },
          "errors": [],
        }
      `);
    });

    it('errors on @codeblock not followed by code block', () => {
      const md = `<!-- @codeblock counter.tsx -->

Some text but no code block`;
      const result = parse(md, 'test.md');

      expect(simplify(result)).toMatchInlineSnapshot(`
        {
          "document": {
            "nodes": [
              {
                "content": "

        Some text but no code block",
                "type": "text",
              },
            ],
            "sourcePath": "test.md",
          },
          "errors": [
            {
              "message": "@codeblock annotation not followed by a code block",
            },
          ],
        }
      `);
    });
  });

  describe('@codeblock-config', () => {
    it('parses document config', () => {
      const md = `<!-- @codeblock-config
outDir: .examples
prefix: |
  import React from 'react';
-->

# Hello

\`\`\`tsx
const x = 1;
\`\`\``;
      const result = parse(md, 'test.md');

      expect(simplify(result)).toMatchInlineSnapshot(`
        {
          "document": {
            "nodes": [
              {
                "config": {
                  "outDir": ".examples",
                  "prefix": "import React from 'react';
        ",
                },
                "rawComment": "<!-- @codeblock-config
        outDir: .examples
        prefix: |
          import React from 'react';
        -->",
                "type": "config",
              },
              {
                "content": "

        # Hello

        ",
                "type": "text",
              },
              {
                "annotation": undefined,
                "code": "const x = 1;",
                "language": "tsx",
                "rawAnnotationComment": undefined,
                "type": "codeblock",
              },
            ],
            "sourcePath": "test.md",
          },
          "errors": [],
        }
      `);
    });

    it('only uses first config as document config', () => {
      const md = `<!-- @codeblock-config
outDir: .first
-->

<!-- @codeblock-config
outDir: .second
-->`;
      const result = parse(md, 'test.md');

      expect(result.document.config?.outDir).toBe('.first');
      expect(result.document.nodes.filter(n => n.type === 'config')).toHaveLength(2);
    });
  });

  describe('replace options', () => {
    it('parses replace as array of objects', () => {
      const md = `<!-- @codeblock
file: test.tsx
replace:
  - find: "..."
    with: "// impl"
-->
\`\`\`tsx
class Foo { ... }
\`\`\``;
      const result = parse(md, 'test.md');

      expect(simplify(result)).toMatchInlineSnapshot(`
        {
          "document": {
            "nodes": [
              {
                "annotation": {
                  "file": "test.tsx",
                  "replace": [
                    {
                      "find": "...",
                      "with": "// impl",
                    },
                  ],
                },
                "code": "class Foo { ... }",
                "language": "tsx",
                "rawAnnotationComment": "<!-- @codeblock
        file: test.tsx
        replace:
          - find: "..."
            with: "// impl"
        -->",
                "type": "codeblock",
              },
            ],
            "sourcePath": "test.md",
          },
          "errors": [],
        }
      `);
    });

    it('parses replace as array of tuples', () => {
      const md = `<!-- @codeblock
file: test.tsx
replace:
  - ["...", "// impl"]
-->
\`\`\`tsx
class Foo { ... }
\`\`\``;
      const result = parse(md, 'test.md');

      expect(simplify(result)).toMatchInlineSnapshot(`
        {
          "document": {
            "nodes": [
              {
                "annotation": {
                  "file": "test.tsx",
                  "replace": [
                    [
                      "...",
                      "// impl",
                    ],
                  ],
                },
                "code": "class Foo { ... }",
                "language": "tsx",
                "rawAnnotationComment": "<!-- @codeblock
        file: test.tsx
        replace:
          - ["...", "// impl"]
        -->",
                "type": "codeblock",
              },
            ],
            "sourcePath": "test.md",
          },
          "errors": [],
        }
      `);
    });
  });

  describe('additionalFiles', () => {
    it('parses additionalFiles', () => {
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
      const result = parse(md, 'test.md');

      expect(simplify(result)).toMatchInlineSnapshot(`
        {
          "document": {
            "nodes": [
              {
                "annotation": {
                  "additionalFiles": [
                    {
                      "content": "test('works', () => {});
        ",
                      "suffix": ".spec.tsx",
                    },
                  ],
                  "file": "counter.tsx",
                },
                "code": "class Counter {}",
                "language": "tsx",
                "rawAnnotationComment": "<!-- @codeblock
        file: counter.tsx
        additionalFiles:
          - suffix: .spec.tsx
            content: |
              test('works', () => {});
        -->",
                "type": "codeblock",
              },
            ],
            "sourcePath": "test.md",
          },
          "errors": [],
        }
      `);
    });
  });

  describe('nested code blocks', () => {
    it('ignores directives inside code blocks', () => {
      const md = `<!-- @codeblock example.md -->
\`\`\`\`markdown
<!-- @codeblock-config
outDir: .examples
-->

<!-- @codeblock counter.tsx -->
\`\`\`tsx
const x = 1;
\`\`\`
\`\`\`\``;
      const result = parse(md, 'test.md');

      expect(simplify(result)).toMatchInlineSnapshot(`
        {
          "document": {
            "nodes": [
              {
                "annotation": {
                  "file": "example.md",
                },
                "code": "<!-- @codeblock-config
        outDir: .examples
        -->

        <!-- @codeblock counter.tsx -->
        \`\`\`tsx
        const x = 1;
        \`\`\`",
                "language": "markdown",
                "rawAnnotationComment": "<!-- @codeblock example.md -->",
                "type": "codeblock",
              },
            ],
            "sourcePath": "test.md",
          },
          "errors": [],
        }
      `);
    });
  });

  describe('position tracking', () => {
    it('tracks code block positions', () => {
      const md = `# Title

\`\`\`tsx
const x = 1;
\`\`\``;
      const result = parse(md, 'test.md');

      const block = getCodeBlocks(result.document)[0];
      expect({
        range: block.range,
        codeRange: block.codeRange,
      }).toMatchInlineSnapshot(`
        {
          "codeRange": {
            "end": {
              "column": 12,
              "line": 4,
              "offset": 28,
            },
            "start": {
              "column": 0,
              "line": 4,
              "offset": 16,
            },
          },
          "range": {
            "end": {
              "column": 3,
              "line": 5,
              "offset": 32,
            },
            "start": {
              "column": 0,
              "line": 3,
              "offset": 9,
            },
          },
        }
      `);
    });

    it('tracks annotation range', () => {
      const md = `<!-- @codeblock test.tsx -->
\`\`\`tsx
code
\`\`\``;
      const result = parse(md, 'test.md');

      const block = getCodeBlocks(result.document)[0];
      expect(block.annotationRange).toMatchInlineSnapshot(`
        {
          "end": {
            "column": 28,
            "line": 1,
            "offset": 28,
          },
          "start": {
            "column": 0,
            "line": 1,
            "offset": 0,
          },
        }
      `);
    });
  });

  describe('utilities', () => {
    it('getCodeBlocks returns only code blocks', () => {
      const md = `Text

\`\`\`tsx
code1
\`\`\`

More text

\`\`\`tsx
code2
\`\`\``;
      const result = parse(md, 'test.md');
      const blocks = getCodeBlocks(result.document);

      expect(blocks.map(b => b.code)).toMatchInlineSnapshot(`
        [
          "code1",
          "code2",
        ]
      `);
    });

    it('getAnnotatedCodeBlocks returns only annotated blocks', () => {
      const md = `<!-- @codeblock test.tsx -->
\`\`\`tsx
annotated
\`\`\`

\`\`\`tsx
not annotated
\`\`\``;
      const result = parse(md, 'test.md');
      const blocks = getAnnotatedCodeBlocks(result.document);

      expect(blocks.map(b => b.code)).toMatchInlineSnapshot(`
        [
          "annotated",
        ]
      `);
    });
  });
});
