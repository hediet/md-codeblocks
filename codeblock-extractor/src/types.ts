/**
 * AST types for parsed markdown with codeblock annotations.
 *
 * The markdown is parsed into a flat list of nodes, interleaving:
 * - TextNode: Regular markdown content
 * - ConfigNode: @codeblock-config directive
 * - CodeBlockNode: Fenced code block with optional @codeblock annotation
 */

// ============================================================================
// Document (top-level)
// ============================================================================

/** Parsed markdown document */
export class Document {
  constructor(
    /** Source file path (for error messages) */
    readonly sourcePath: string,
    /** All nodes in document order */
    readonly nodes: readonly Node[],
  ) {}

  /** Document-level config (from first @codeblock-config, if any) */
  get config(): CodeblockConfig | undefined {
    const configNode = this.nodes.find((n): n is ConfigNode => n instanceof ConfigNode);
    return configNode?.config;
  }
}

// ============================================================================
// AST Node Types
// ============================================================================

/** Union of all node types */
export type Node = TextNode | ConfigNode | CodeBlockNode;

/** Base class for all AST nodes */
export abstract class BaseNode {
  constructor(
    /** Source location in the markdown file */
    readonly range: Range,
  ) {}

  /** Node type discriminator */
  abstract readonly type: string;
}

/** Plain markdown text (not a code block or directive) */
export class TextNode extends BaseNode {
  readonly type = 'text' as const;

  constructor(
    range: Range,
    readonly content: string,
  ) {
    super(range);
  }
}

/** @codeblock-config directive */
export class ConfigNode extends BaseNode {
  readonly type = 'config' as const;

  constructor(
    range: Range,
    /** The full HTML comment including <!-- and --> */
    readonly rawComment: string,
    /** Resolved configuration (parsed from YAML) */
    readonly config: CodeblockConfig,
  ) {
    super(range);
  }
}

/** Fenced code block, optionally annotated with @codeblock */
export class CodeBlockNode extends BaseNode {
  readonly type = 'codeblock' as const;

  constructor(
    range: Range,
    /** Language identifier from the fence (e.g., "tsx", "typescript") */
    readonly language: string | undefined,
    /** The code content (without fence markers) */
    readonly code: string,
    /** Range of just the code content (excluding fences) */
    readonly codeRange: Range,
    /** Annotation from preceding @codeblock comment, if any */
    readonly annotation: CodeblockAnnotation | undefined,
    /** The raw @codeblock comment, if any */
    readonly rawAnnotationComment: string | undefined,
    /** Range of the annotation comment, if any */
    readonly annotationRange: Range | undefined,
  ) {
    super(range);
  }
}

// ============================================================================
// Annotation Types (resolved from YAML)
// ============================================================================

/** Document-level configuration from @codeblock-config */
export interface CodeblockConfig {
  /** Output directory for generated files (default: ".examples") */
  outDir?: string;
  /** Default prefix prepended to all files */
  prefix?: string;
  /** Default postfix appended to all files */
  postfix?: string;
}

/** Annotation from @codeblock directive */
export interface CodeblockAnnotation {
  /** Output filename. If omitted: continue previous file, or auto-generate */
  file?: string;
  /** Prefix for this file (extends default) */
  prefix?: string;
  /** Postfix for this file (extends default) */
  postfix?: string;
  /** Sequential replacements */
  replace?: Replacement[];
  /** Skip this block (documentation only) */
  skip?: boolean;
  /** Additional files generated alongside the main file */
  additionalFiles?: AdditionalFile[];
}

/** Replacement instruction - multiple formats supported */
export type Replacement =
  | { find: string; with: string }
  | [string, string]
  | string;

/** Additional file generated alongside the main file */
export interface AdditionalFile {
  /** Suffix appended to base filename (e.g., ".spec.tsx" → "counter.spec.tsx") */
  suffix: string;
  /** Content of the additional file */
  content: string;
}

// ============================================================================
// Source Location
// ============================================================================

/** Range in the source file */
export interface Range {
  readonly start: Position;
  readonly end: Position;
}

/** Position in the source file (1-based line, 0-based column) */
export interface Position {
  readonly line: number;
  readonly column: number;
  readonly offset: number;
}
