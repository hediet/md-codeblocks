import { describe, it, expect, vi } from 'vitest';
import { parse, getAnnotatedCodeBlocks } from '@vscode/codeblock-extractor';

// Mock vscode before importing modules that use it
vi.mock('vscode', async () => {
  return await import('./__mocks__/vscode');
});

describe('CodeblockService parsing', () => {
  it('parses markdown with @codeblock-config', () => {
    const markdown = `
<!-- @codeblock-config
outDir: custom-out
-->

# Example

<!-- @codeblock file: test.tsx -->
\`\`\`tsx
const x = 1;
\`\`\`
`;

    const { document: doc } = parse(markdown, '/test/README.md');
    expect(doc.config?.outDir).toBe('custom-out');
    
    const annotated = getAnnotatedCodeBlocks(doc);
    expect(annotated).toHaveLength(1);
    expect(annotated[0].annotation?.file).toBe('test.tsx');
  });

  it('parses inline @codeblock annotation', () => {
    const markdown = `
<!-- @codeblock counter.tsx -->
\`\`\`tsx
export const Counter = () => <div>0</div>;
\`\`\`
`;

    const { document: doc } = parse(markdown, '/test/README.md');
    const annotated = getAnnotatedCodeBlocks(doc);
    
    expect(annotated).toHaveLength(1);
    expect(annotated[0].annotation?.file).toBe('counter.tsx');
    expect(annotated[0].code).toContain('Counter');
  });

  it('parses multiline @codeblock with YAML', () => {
    const markdown = `
<!-- @codeblock
file: component.tsx
prefix: |
  import React from 'react';
postfix: |
  export default App;
-->
\`\`\`tsx
function App() { return <div />; }
\`\`\`
`;

    const { document: doc } = parse(markdown, '/test/README.md');
    const annotated = getAnnotatedCodeBlocks(doc);
    
    expect(annotated).toHaveLength(1);
    expect(annotated[0].annotation?.file).toBe('component.tsx');
    expect(annotated[0].annotation?.prefix).toContain("import React from 'react';");
    expect(annotated[0].annotation?.postfix).toContain('export default App;');
  });

  it('parses additionalFiles', () => {
    const markdown = `
<!-- @codeblock
file: counter.tsx
additionalFiles:
  - suffix: .spec.tsx
    content: |
      import { test } from '@playwright/test';
      test('works', () => {});
-->
\`\`\`tsx
export const Counter = () => null;
\`\`\`
`;

    const { document: doc } = parse(markdown, '/test/README.md');
    const annotated = getAnnotatedCodeBlocks(doc);
    
    expect(annotated).toHaveLength(1);
    expect(annotated[0].annotation?.additionalFiles).toHaveLength(1);
    expect(annotated[0].annotation?.additionalFiles?.[0].suffix).toBe('.spec.tsx');
    expect(annotated[0].annotation?.additionalFiles?.[0].content).toContain("@playwright/test");
  });

  it('handles skip annotation', () => {
    const markdown = `
<!-- @codeblock
skip: true
-->
\`\`\`tsx
// This is just for documentation
\`\`\`
`;

    const { document: doc } = parse(markdown, '/test/README.md');
    const annotated = getAnnotatedCodeBlocks(doc);
    
    expect(annotated).toHaveLength(1);
    expect(annotated[0].annotation?.skip).toBe(true);
  });

  it('handles replace option', () => {
    const markdown = `
<!-- @codeblock
file: example.tsx
replace:
  - find: "PLACEHOLDER"
    with: "actual value"
-->
\`\`\`tsx
const x = "PLACEHOLDER";
\`\`\`
`;

    const { document: doc } = parse(markdown, '/test/README.md');
    const annotated = getAnnotatedCodeBlocks(doc);
    
    expect(annotated).toHaveLength(1);
    expect(annotated[0].annotation?.replace).toHaveLength(1);
    expect(annotated[0].annotation?.replace?.[0]).toEqual({ find: 'PLACEHOLDER', with: 'actual value' });
  });
});

describe('Position tracking', () => {
  it('tracks codeblock positions correctly', () => {
    const markdown = `# Title

<!-- @codeblock test.tsx -->
\`\`\`tsx
const x = 1;
\`\`\`
`;

    const { document: doc } = parse(markdown, '/test/README.md');
    const annotated = getAnnotatedCodeBlocks(doc);
    
    expect(annotated).toHaveLength(1);
    // Code block starts at line 4 (1-based), code content at line 5
    expect(annotated[0].range.start.line).toBe(4); // codeblock fence line
    expect(annotated[0].codeRange.start.line).toBe(5); // code content line
  });
});
