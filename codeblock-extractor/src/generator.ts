import {
  Document,
  CodeBlockNode,
  type CodeblockConfig,
  type CodeblockAnnotation,
  type Replacement,
} from './types.js';

// ============================================================================
// Generated File
// ============================================================================

/** A file to be written to disk */
export interface GeneratedFile {
  /** Relative path from outDir */
  readonly path: string;
  /** File content */
  readonly content: string;
  /** Source blocks that contributed to this file */
  readonly sourceBlocks: readonly CodeBlockNode[];
}

// ============================================================================
// Generator
// ============================================================================

/** Options for the generator */
export interface GeneratorOptions {
  /** Override the output directory (defaults to config.outDir or ".examples") */
  outDir?: string;
}

/** Result of generating files from a document */
export interface GenerateResult {
  readonly files: readonly GeneratedFile[];
  readonly outDir: string;
}

/**
 * Generate output files from a parsed document.
 */
export function generate(document: Document, options: GeneratorOptions = {}): GenerateResult {
  const config = document.config ?? {};
  const outDir = options.outDir ?? config.outDir ?? '.examples';

  // Collect annotated code blocks
  const annotatedBlocks = document.nodes
    .filter((n): n is CodeBlockNode => n.type === 'codeblock' && n.annotation !== undefined);

  if (annotatedBlocks.length === 0) {
    return { files: [], outDir };
  }

  // Group blocks by file
  const fileGroups = groupBlocksByFile(annotatedBlocks, config);

  // Generate content for each file
  const files: GeneratedFile[] = [];

  for (const [filePath, group] of fileGroups) {
    const content = generateFileContent(group, config);
    files.push({
      path: filePath,
      content,
      sourceBlocks: group.blocks,
    });

    // Generate additional files
    for (const block of group.blocks) {
      if (block.annotation?.additionalFiles) {
        for (const additional of block.annotation.additionalFiles) {
          const baseName = filePath.replace(/\.[^.]+$/, '');
          const additionalPath = baseName + additional.suffix;
          
          // Apply prefix to additional file content
          const additionalContent = applyPrefixPostfix(
            additional.content.trim(),
            config.prefix,
            undefined, // No postfix for additional files by default
          );

          files.push({
            path: additionalPath,
            content: additionalContent,
            sourceBlocks: [block],
          });
        }
      }
    }
  }

  return { files, outDir };
}

// ============================================================================
// File Grouping
// ============================================================================

interface FileGroup {
  blocks: CodeBlockNode[];
  annotation: CodeblockAnnotation;
}

function groupBlocksByFile(
  blocks: CodeBlockNode[],
  config: CodeblockConfig,
): Map<string, FileGroup> {
  const groups = new Map<string, FileGroup>();
  let currentFile: string | undefined;
  let snippetCounter = 1;

  for (const block of blocks) {
    const annotation = block.annotation!;

    // Skip blocks marked with skip: true
    if (annotation.skip) {
      continue;
    }

    let filePath: string;

    if (annotation.file) {
      // Explicit file name
      filePath = annotation.file;
      currentFile = filePath;
    } else if (currentFile) {
      // Continuation of previous file
      filePath = currentFile;
    } else {
      // Auto-generate filename
      const ext = getExtensionForLanguage(block.language);
      filePath = `snippet-${snippetCounter++}${ext}`;
      currentFile = filePath;
    }

    const existing = groups.get(filePath);
    if (existing) {
      existing.blocks.push(block);
    } else {
      groups.set(filePath, {
        blocks: [block],
        annotation,
      });
    }
  }

  return groups;
}

function getExtensionForLanguage(language: string | undefined): string {
  const extensions: Record<string, string> = {
    typescript: '.ts',
    ts: '.ts',
    javascript: '.js',
    js: '.js',
    tsx: '.tsx',
    jsx: '.jsx',
    python: '.py',
    py: '.py',
    rust: '.rs',
    go: '.go',
    css: '.css',
    scss: '.scss',
    html: '.html',
    json: '.json',
    yaml: '.yaml',
    yml: '.yml',
    markdown: '.md',
    md: '.md',
  };
  return extensions[language ?? ''] ?? '.txt';
}

// ============================================================================
// Content Generation
// ============================================================================

function generateFileContent(group: FileGroup, config: CodeblockConfig): string {
  const parts: string[] = [];

  for (const block of group.blocks) {
    let code = block.code;

    // Apply replacements
    if (block.annotation?.replace) {
      code = applyReplacements(code, block.annotation.replace);
    }

    parts.push(code);
  }

  // Combine all blocks
  let content = parts.join('\n\n');

  // Get prefix/postfix (block-level extends config-level)
  const prefix = combineStrings(config.prefix, group.annotation.prefix);
  const postfix = combineStrings(config.postfix, group.annotation.postfix);

  // Apply prefix and postfix
  content = applyPrefixPostfix(content, prefix, postfix);

  return content;
}

function applyReplacements(code: string, replacements: Replacement[]): string {
  let result = code;

  for (const replacement of replacements) {
    const [find, replaceWith] = normalizeReplacement(replacement);
    result = result.replace(find, replaceWith);
  }

  return result;
}

function normalizeReplacement(replacement: Replacement): [string, string] {
  if (typeof replacement === 'string') {
    return [replacement, ''];
  }
  if (Array.isArray(replacement)) {
    return [replacement[0], replacement[1]];
  }
  return [replacement.find, replacement.with];
}

function combineStrings(base: string | undefined, extension: string | undefined): string | undefined {
  if (!base && !extension) return undefined;
  if (!base) return extension;
  if (!extension) return base;
  return base + extension;
}

function applyPrefixPostfix(
  content: string,
  prefix: string | undefined,
  postfix: string | undefined,
): string {
  const parts: string[] = [];

  if (prefix) {
    parts.push(prefix.trimEnd());
  }

  parts.push(content);

  if (postfix) {
    parts.push(postfix.trim());
  }

  return parts.join('\n');
}
