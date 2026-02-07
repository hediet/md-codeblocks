import YAML from 'yaml';
import {
  Document,
  TextNode,
  ConfigNode,
  CodeBlockNode,
  type Node,
  type CodeblockConfig,
  type CodeblockAnnotation,
  type Position,
  type Range,
} from './types.js';

// ============================================================================
// Position Tracking
// ============================================================================

function createPosition(source: string, offset: number): Position {
  let line = 1;
  let lastNewline = -1;

  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') {
      line++;
      lastNewline = i;
    }
  }

  return {
    line,
    column: offset - lastNewline - 1,
    offset,
  };
}

function createRange(source: string, start: number, end: number): Range {
  return {
    start: createPosition(source, start),
    end: createPosition(source, end),
  };
}

// ============================================================================
// YAML Parsing
// ============================================================================

/**
 * Parse the content after @codeblock or @codeblock-config as YAML.
 * Handles special shorthand: just a filename (e.g., "counter.tsx") → { file: "counter.tsx" }
 */
function parseAnnotationContent(content: string): CodeblockAnnotation | CodeblockConfig {
  const trimmed = content.trim();

  // Empty content
  if (!trimmed) {
    return {};
  }

  // Shorthand: just a filename (contains ".", no ":")
  if (trimmed.includes('.') && !trimmed.includes(':') && !trimmed.includes('\n')) {
    return { file: trimmed };
  }

  // Parse as YAML
  try {
    const parsed = YAML.parse(trimmed);
    return parsed ?? {};
  } catch {
    // If YAML parsing fails, treat as empty
    return {};
  }
}

// ============================================================================
// Tokenizer
// ============================================================================

interface Token {
  type: 'comment' | 'codeblock' | 'text';
  start: number;
  end: number;
  content: string;
  // For comments
  directive?: '@codeblock' | '@codeblock-config';
  directiveContent?: string;
  // For codeblocks
  language?: string;
  code?: string;
  codeStart?: number;
  codeEnd?: number;
}

/**
 * Tokenize markdown into comments, code blocks, and text.
 */
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  // Match HTML comments: <!-- ... -->
  const commentRegex = /<!--([\s\S]*?)-->/g;

  // Match fenced code blocks: ```lang\n...\n```
  const codeBlockRegex = /^(`{3,})(\w*)\n([\s\S]*?)\n\1$/gm;

  // Find all matches
  interface Match {
    type: 'comment' | 'codeblock';
    start: number;
    end: number;
    groups: string[];
  }

  const matches: Match[] = [];

  // Find comments
  let match: RegExpExecArray | null;
  while ((match = commentRegex.exec(source)) !== null) {
    matches.push({
      type: 'comment',
      start: match.index,
      end: match.index + match[0].length,
      groups: [match[0], match[1]],
    });
  }

  // Find code blocks
  while ((match = codeBlockRegex.exec(source)) !== null) {
    matches.push({
      type: 'codeblock',
      start: match.index,
      end: match.index + match[0].length,
      groups: [match[0], match[1], match[2], match[3]],
    });
  }

  // Sort by position
  matches.sort((a, b) => a.start - b.start);

  // Process matches and fill in text between them
  for (const m of matches) {
    // Skip matches that are inside a previously processed code block
    if (m.start < pos) {
      continue;
    }

    // Add text before this match
    if (m.start > pos) {
      const textContent = source.slice(pos, m.start);
      if (textContent.trim()) {
        tokens.push({
          type: 'text',
          start: pos,
          end: m.start,
          content: textContent,
        });
      }
    }

    if (m.type === 'comment') {
      const commentContent = m.groups[1];
      const trimmedContent = commentContent.trim();

      // Check for @codeblock or @codeblock-config
      let directive: '@codeblock' | '@codeblock-config' | undefined;
      let directiveContent = '';

      if (trimmedContent.startsWith('@codeblock-config')) {
        directive = '@codeblock-config';
        directiveContent = trimmedContent.slice('@codeblock-config'.length);
      } else if (trimmedContent.startsWith('@codeblock')) {
        directive = '@codeblock';
        directiveContent = trimmedContent.slice('@codeblock'.length);
      }

      if (directive) {
        tokens.push({
          type: 'comment',
          start: m.start,
          end: m.end,
          content: m.groups[0],
          directive,
          directiveContent,
        });
      }
      // Non-directive comments are treated as text
      else {
        tokens.push({
          type: 'text',
          start: m.start,
          end: m.end,
          content: m.groups[0],
        });
      }
    } else if (m.type === 'codeblock') {
      const fence = m.groups[1];
      const lang = m.groups[2] || undefined;
      const code = m.groups[3];

      // Calculate code position (after ```lang\n)
      const codeStart = m.start + fence.length + (lang?.length ?? 0) + 1;
      const codeEnd = codeStart + code.length;

      tokens.push({
        type: 'codeblock',
        start: m.start,
        end: m.end,
        content: m.groups[0],
        language: lang,
        code,
        codeStart,
        codeEnd,
      });
    }

    pos = m.end;
  }

  // Add remaining text
  if (pos < source.length) {
    const textContent = source.slice(pos);
    if (textContent.trim()) {
      tokens.push({
        type: 'text',
        start: pos,
        end: source.length,
        content: textContent,
      });
    }
  }

  return tokens;
}

// ============================================================================
// Parser
// ============================================================================

export interface ParseResult {
  document: Document;
  errors: ParseError[];
}

export interface ParseError {
  message: string;
  range: Range;
}

/**
 * Parse a markdown file into an AST.
 */
export function parse(source: string, sourcePath: string): ParseResult {
  const tokens = tokenize(source);
  const nodes: Node[] = [];
  const errors: ParseError[] = [];

  let pendingAnnotation: {
    annotation: CodeblockAnnotation;
    rawComment: string;
    range: Range;
  } | undefined;

  for (const token of tokens) {
    if (token.type === 'text') {
      // Flush pending annotation as error (no code block followed)
      if (pendingAnnotation) {
        errors.push({
          message: '@codeblock annotation not followed by a code block',
          range: pendingAnnotation.range,
        });
        pendingAnnotation = undefined;
      }

      nodes.push(new TextNode(
        createRange(source, token.start, token.end),
        token.content,
      ));
    } else if (token.type === 'comment') {
      if (token.directive === '@codeblock-config') {
        // Flush pending annotation as error
        if (pendingAnnotation) {
          errors.push({
            message: '@codeblock annotation not followed by a code block',
            range: pendingAnnotation.range,
          });
          pendingAnnotation = undefined;
        }

        const parsedConfig = parseAnnotationContent(token.directiveContent!) as CodeblockConfig;

        nodes.push(new ConfigNode(
          createRange(source, token.start, token.end),
          token.content,
          parsedConfig,
        ));
      } else if (token.directive === '@codeblock') {
        // Flush previous pending annotation as error
        if (pendingAnnotation) {
          errors.push({
            message: '@codeblock annotation not followed by a code block',
            range: pendingAnnotation.range,
          });
        }

        pendingAnnotation = {
          annotation: parseAnnotationContent(token.directiveContent!) as CodeblockAnnotation,
          rawComment: token.content,
          range: createRange(source, token.start, token.end),
        };
      }
    } else if (token.type === 'codeblock') {
      nodes.push(new CodeBlockNode(
        createRange(source, token.start, token.end),
        token.language,
        token.code!,
        createRange(source, token.codeStart!, token.codeEnd!),
        pendingAnnotation?.annotation,
        pendingAnnotation?.rawComment,
        pendingAnnotation?.range,
      ));
      pendingAnnotation = undefined;
    }
  }

  // Check for trailing pending annotation
  if (pendingAnnotation) {
    errors.push({
      message: '@codeblock annotation not followed by a code block',
      range: pendingAnnotation.range,
    });
  }

  return {
    document: new Document(sourcePath, nodes),
    errors,
  };
}

// ============================================================================
// Utilities
// ============================================================================

/** Get all code block nodes from a document */
export function getCodeBlocks(document: Document): CodeBlockNode[] {
  return document.nodes.filter((n): n is CodeBlockNode => n instanceof CodeBlockNode);
}

/** Get all annotated code blocks (those with @codeblock directive) */
export function getAnnotatedCodeBlocks(document: Document): CodeBlockNode[] {
  return getCodeBlocks(document).filter(n => n.annotation !== undefined);
}
