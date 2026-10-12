# @segmsh/html

HTML processor for [segm.sh](https://segm.sh). This package parses HTML documents and fragments into a document (AST + segments) and stringifies them back, keeping inline markup inside segments as tag markers.

## Installation

```bash
npm install @segmsh/html
```

## Usage

```typescript
import HtmlProcessor from "@segmsh/html";

const processor = new HtmlProcessor();

const htmlContent = '<p>Read <a href="/docs">the docs</a></p>';
const document = processor.parse(htmlContent);
// document.segments[0].text === "Read {a0}the docs{/a0}"
// document.segments[0].tags  === { a0: { href: "/docs" } }

// ... modify document segments ...

const newHtmlContent = processor.stringify(document);
```

## Features

- **Structure Preservation**: Keeps the document structure; full documents and fragments are both supported.
- **Inline Markup**: Inline elements become `{tagN}...{/tagN}` markers within a segment, with their attributes stored in `tags`.
- **Non-translatable Content**: `script`, `style` and `template` contents are left out of segments.
- **Round-trip**: Ensures parsing and stringifying returns the same HTML structure.

## Development

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

## License

[Apache-2.0](LICENSE)
