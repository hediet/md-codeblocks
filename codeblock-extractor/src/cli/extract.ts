import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parse, type ParseError } from '../parser.js';
import { generate, type GeneratedFile } from '../generator.js';

export interface ExtractOptions {
  outDir?: string;
  deleteOut?: boolean;
}

export interface ExtractResult {
  files: GeneratedFile[];
  errors: ParseError[];
}

/**
 * Extract code blocks from markdown files and write to disk.
 */
export async function extract(
  inputFiles: string[],
  options: ExtractOptions = {},
): Promise<ExtractResult> {
  const allFiles: GeneratedFile[] = [];
  const allErrors: ParseError[] = [];

  for (const inputFile of inputFiles) {
    const absolutePath = path.resolve(inputFile);
    const inputDir = path.dirname(absolutePath);

    // Read and parse markdown
    const source = await fs.readFile(absolutePath, 'utf-8');
    const { document, errors } = parse(source, absolutePath);

    allErrors.push(...errors);

    // Report parse errors
    for (const error of errors) {
      console.error(
        `${inputFile}:${error.range.start.line}:${error.range.start.column}: ${error.message}`,
      );
    }

    // Generate files
    const { files, outDir } = generate(document, { outDir: options.outDir });

    if (files.length === 0) {
      console.log(`${inputFile}: No annotated code blocks found`);
      continue;
    }

    // Resolve output directory relative to input file
    const absoluteOutDir = path.resolve(inputDir, outDir);

    // Delete output directory if requested
    if (options.deleteOut) {
      await fs.rm(absoluteOutDir, { recursive: true, force: true });
    }

    // Ensure output directory exists
    await fs.mkdir(absoluteOutDir, { recursive: true });

    // Write files
    for (const file of files) {
      const outputPath = path.join(absoluteOutDir, file.path);
      const outputDir = path.dirname(outputPath);

      // Ensure subdirectories exist
      await fs.mkdir(outputDir, { recursive: true });

      await fs.writeFile(outputPath, file.content, 'utf-8');
      console.log(`  → ${path.relative(process.cwd(), outputPath)}`);

      allFiles.push(file);
    }

    console.log(`${inputFile}: Generated ${files.length} file(s) in ${outDir}/`);
  }

  return { files: allFiles, errors: allErrors };
}
