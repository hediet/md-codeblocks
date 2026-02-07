import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parse, generate, CodeBlockNode } from './codeblock-extractor/src/index.js';

function extractFile(content: string, sourcePath: string) {
  const { document } = parse(content, sourcePath);
  const { files } = generate(document);
  return files.map(f => ({ path: f.path, content: f.content }));
}

function getExpectedFiles(content: string, sourcePath: string): Map<string, string> {
  const { document } = parse(content, sourcePath);
  const expected = new Map<string, string>();
  for (const node of document.nodes) {
    if (node instanceof CodeBlockNode && node.annotation?.additionalFiles) {
      for (const af of node.annotation.additionalFiles) {
        // suffix like ".expected/counter.tsx" → "counter.tsx"
        const filename = basename(af.suffix);
        expected.set(filename, af.content);
      }
    }
  }
  return expected;
}

describe('README codeblock extraction', () => {
  const readmeSource = readFileSync('README.md', 'utf-8');
  const readmeFiles = extractFile(readmeSource, 'README.md');

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
    for (const mdFile of mdFiles) {
      const found = readmeFiles.find(f => f.path === mdFile)!;
      const extracted = extractFile(found.content, mdFile);
      expect(extracted.length, `${mdFile} should produce files`).toBeGreaterThan(0);
    }
  });

  test('expected files in additionalFiles match actual extraction', () => {
    const readmeSource = readFileSync('README.md', 'utf-8');
    const expectedFiles = getExpectedFiles(readmeSource, 'README.md');

    for (const mdFile of mdFiles) {
      const found = readmeFiles.find(f => f.path === mdFile)!;
      const actualFiles = extractFile(found.content, mdFile);

      for (const actual of actualFiles) {
        const expected = expectedFiles.get(actual.path);
        if (expected !== undefined) {
          expect(actual.content, `${mdFile} → ${actual.path}`).toBe(expected);
        }
      }
    }
  });
});
