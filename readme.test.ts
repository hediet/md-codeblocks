import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parse, generate } from './codeblock-extractor/src/index.js';

function extractFile(content: string, sourcePath: string) {
  const { document } = parse(content, sourcePath);
  const { files } = generate(document);
  return files.map(f => ({ path: f.path, content: f.content }));
}

describe('README codeblock extraction', () => {
  const readmeSource = readFileSync('README.md', 'utf-8');
  const readmeFiles = extractFile(readmeSource, 'README.md');

  test('root README extracted files', () => {
    expect(readmeFiles).toMatchInlineSnapshot(`
      [
        {
          "content": "<!-- @codeblock-config
      outDir: .examples
      -->

      <!-- @codeblock counter.tsx -->
      \`\`\`tsx
      import { useState } from "react";

      export function Counter() {
        const [count, setCount] = useState(0);
        return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
      }
      \`\`\`

      <!-- @codeblock -->
      \`\`\`tsx
      // Continuation of counter.tsx
      export default Counter;
      \`\`\`",
          "path": "example.md",
        },
        {
          "content": "<!-- @codeblock-config
      outDir: .examples
      prefix: |
        // Auto-generated — do not edit
      postfix: |
        export {};
      -->

      <!-- @codeblock greeter.ts -->
      \`\`\`ts
      export function greet(name: string) {
        return \`Hello, \${name}!\`;
      }
      \`\`\`",
          "path": "config-example.md",
        },
        {
          "content": "<!-- @codeblock-config
      outDir: .examples
      -->

      <!-- @codeblock
      file: math.ts
      replace:
        - ["PLACEHOLDER", "42"]
      -->
      \`\`\`ts
      export const answer = PLACEHOLDER;
      \`\`\`

      <!-- @codeblock
      skip: true
      -->
      \`\`\`ts
      // This block is skipped — for display only
      \`\`\`

      <!-- @codeblock -->
      \`\`\`ts
      export const pi = 3.14;
      \`\`\`",
          "path": "annotation-example.md",
        },
      ]
    `);
  });

  const examplesDir = '.examples';
  const mdFiles = readdirSync(examplesDir).filter(f => f.endsWith('.md'));

  for (const mdFile of mdFiles) {
    describe(mdFile, () => {
      const found = readmeFiles.find(f => f.path === mdFile);

      test('is extracted from README', () => {
        expect(found).toBeDefined();
      });

      test('matches file on disk', () => {
        const onDisk = readFileSync(join(examplesDir, mdFile), 'utf-8');
        expect(found!.content).toBe(onDisk);
      });
    });
  }

  test('all examples are themselves extractable', () => {
    const innerExtractions: Record<string, { path: string; content: string }[]> = {};
    for (const mdFile of mdFiles) {
      const found = readmeFiles.find(f => f.path === mdFile)!;
      innerExtractions[mdFile] = extractFile(found.content, mdFile);
    }
    expect(innerExtractions).toMatchInlineSnapshot(`
      {
        "annotation-example.md": [
          {
            "content": "export const answer = 42;

      export const pi = 3.14;",
            "path": "math.ts",
          },
        ],
        "config-example.md": [
          {
            "content": "// Auto-generated — do not edit
      export function greet(name: string) {
        return \`Hello, \${name}!\`;
      }
      export {};",
            "path": "greeter.ts",
          },
        ],
        "example.md": [
          {
            "content": "import { useState } from "react";

      export function Counter() {
        const [count, setCount] = useState(0);
        return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
      }

      // Continuation of counter.tsx
      export default Counter;",
            "path": "counter.tsx",
          },
        ],
      }
    `);
  });
});
