import * as fs from 'node:fs';
import * as path from 'node:path';
import { extract, type ExtractOptions } from './extract.js';

/**
 * Watch markdown files and regenerate on changes.
 */
export async function watch(
  inputFiles: string[],
  options: ExtractOptions = {},
): Promise<void> {
  const absolutePaths = inputFiles.map(f => path.resolve(f));

  console.log(`Watching ${inputFiles.length} file(s) for changes...`);
  console.log('Press Ctrl+C to stop.\n');

  // Initial extraction
  await extract(inputFiles, options);
  console.log('');

  // Set up watchers
  const watchers: fs.FSWatcher[] = [];
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  for (const absolutePath of absolutePaths) {
    const relativePath = path.relative(process.cwd(), absolutePath);

    const watcher = fs.watch(absolutePath, async (eventType) => {
      if (eventType !== 'change') return;

      // Debounce rapid changes
      const existing = debounceTimers.get(absolutePath);
      if (existing) {
        clearTimeout(existing);
      }

      debounceTimers.set(
        absolutePath,
        setTimeout(async () => {
          debounceTimers.delete(absolutePath);
          console.log(`\n[${new Date().toLocaleTimeString()}] ${relativePath} changed`);

          try {
            await extract([absolutePath], options);
          } catch (error) {
            console.error('Error:', error instanceof Error ? error.message : error);
          }
        }, 100),
      );
    });

    watchers.push(watcher);
  }

  // Handle cleanup on exit
  const cleanup = () => {
    for (const watcher of watchers) {
      watcher.close();
    }
    for (const timer of debounceTimers.values()) {
      clearTimeout(timer);
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Keep process alive
  await new Promise(() => {});
}
