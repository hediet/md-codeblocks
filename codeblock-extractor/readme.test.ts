import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parse, generate, CodeBlockNode } from './src/index.js';

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

  test('extracts files from README', () => {
    expect(readmeFiles.length).toBeGreaterThan(0);
  });

  test('extracted files match files on disk', () => {
    if (!existsSync(examplesDir)) {
      return; // Skip if examples haven't been generated yet
    }

    const diskFiles = readdirSync(examplesDir).filter(f => !f.startsWith('.') && !f.includes('.expected'));
    for (const diskFile of diskFiles) {
      const found = readmeFiles.find(f => f.path === diskFile);
      expect(found, `${diskFile} should be extracted from README`).toBeDefined();

      const onDisk = readFileSync(join(examplesDir, diskFile), 'utf-8');
      expect(found!.content).toBe(onDisk);
    }
  });

  test('example.ts is extracted correctly', () => {
    const example = readmeFiles.find(f => f.path === 'example.ts');
    expect(example).toBeDefined();
    expect(example!.content).toContain('import { parse, generate }');
    expect(example!.content).toContain('import * as fs from "fs"');
    expect(example!.content).toContain('const log = ');
    expect(example!.content).toContain('log(file.path, file.content)');
    expect(example!.content).not.toContain('console.log');
  });

  test('expected filePaths in additionalFiles matches actual extraction', () => {
    const expectedFiles = getExpectedFiles(readmeSource, 'README.md');
    const expectedFilePaths = expectedFiles.get('filePaths.txt');
    expect(expectedFilePaths).toBeDefined();

    const actualFilePaths = readmeFiles.map(f => f.path).join('\n');
    expect(actualFilePaths).toBe(expectedFilePaths!.trim());
  });
});
