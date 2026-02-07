#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { extract } from './extract.js';
import { check } from './check.js';
import { watch } from './watch.js';

const USAGE = `
codeblock-extractor - Extract and verify code blocks from Markdown

Usage:
  codeblock-extractor <command> [options] <files...>

Commands:
  extract   Generate files from markdown code blocks
  check     Verify generated files are up-to-date (for CI)
  watch     Watch mode - regenerate on changes

Options:
  --outdir <dir>   Output directory (overrides @codeblock-config)
  --delete-out     Delete output directory before generating
  --help, -h       Show this help message

Examples:
  codeblock-extractor extract README.md
  codeblock-extractor extract README.md --outdir .examples
  codeblock-extractor extract README.md --delete-out
  codeblock-extractor check README.md
  codeblock-extractor watch README.md
`.trim();

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      outdir: { type: 'string' },
      'delete-out': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help || positionals.length === 0) {
    console.log(USAGE);
    process.exit(values.help ? 0 : 1);
  }

  const [command, ...files] = positionals;

  if (files.length === 0) {
    console.error('Error: No input files specified');
    console.log(USAGE);
    process.exit(1);
  }

  const options = { outDir: values.outdir, deleteOut: values['delete-out'] };

  try {
    switch (command) {
      case 'extract':
        await extract(files, options);
        break;

      case 'check':
        const isUpToDate = await check(files, options);
        process.exit(isUpToDate ? 0 : 1);
        break;

      case 'watch':
        await watch(files, options);
        break;

      default:
        console.error(`Error: Unknown command '${command}'`);
        console.log(USAGE);
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
