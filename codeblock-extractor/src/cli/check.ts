import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parse } from '../parser.js';
import { generate } from '../generator.js';

export interface CheckOptions {
  outDir?: string;
}

/**
 * Check that generated files are up-to-date.
 * Returns true if all files match, false if any are outdated.
 * Useful for CI to ensure generated examples are committed.
 */
export async function check(
  inputFiles: string[],
  options: CheckOptions = {},
): Promise<boolean> {
  let allUpToDate = true;
  let totalFiles = 0;
  let outdatedFiles = 0;
  let missingFiles = 0;

  for (const inputFile of inputFiles) {
    const absolutePath = path.resolve(inputFile);
    const inputDir = path.dirname(absolutePath);

    // Read and parse markdown
    const source = await fs.readFile(absolutePath, 'utf-8');
    const { document, errors } = parse(source, absolutePath);

    // Report parse errors
    for (const error of errors) {
      console.error(
        `${inputFile}:${error.range.start.line}:${error.range.start.column}: ${error.message}`,
      );
      allUpToDate = false;
    }

    // Generate files
    const { files, outDir } = generate(document, { outDir: options.outDir });

    if (files.length === 0) {
      continue;
    }

    const absoluteOutDir = path.resolve(inputDir, outDir);

    // Check each file
    for (const file of files) {
      totalFiles++;
      const outputPath = path.join(absoluteOutDir, file.path);
      const relativePath = path.relative(process.cwd(), outputPath);

      try {
        const existingContent = await fs.readFile(outputPath, 'utf-8');

        if (existingContent !== file.content) {
          console.error(`✗ ${relativePath} is outdated`);
          allUpToDate = false;
          outdatedFiles++;
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          console.error(`✗ ${relativePath} is missing`);
          allUpToDate = false;
          missingFiles++;
        } else {
          throw error;
        }
      }
    }
  }

  // Summary
  if (allUpToDate) {
    console.log(`✓ All ${totalFiles} generated file(s) are up-to-date`);
  } else {
    const issues: string[] = [];
    if (outdatedFiles > 0) issues.push(`${outdatedFiles} outdated`);
    if (missingFiles > 0) issues.push(`${missingFiles} missing`);
    console.error(`\nFound ${issues.join(', ')} file(s). Run 'codeblock-extractor extract' to update.`);
  }

  return allUpToDate;
}
