import { assert, describe, it } from "vitest";
import eol from "eol";
import fs from "fs";
import path from "path";
import HtmlProcessor from "../src";

const processor = new HtmlProcessor();

function processAndCompare(filename: string) {
  const input = eol.lf(
    fs.readFileSync(path.join("test", "fixtures", filename), {
      encoding: "utf-8",
    }),
  );

  const document = processor.parse(input);
  const parsedDocumentJson = JSON.stringify(document);
  const stringifiedDocument = processor.stringify(document);
  const roundTrippedDocument = processor.parse(stringifiedDocument);
  const roundTrippedDocumentJson = JSON.stringify(roundTrippedDocument);

  assert.equal(roundTrippedDocumentJson, parsedDocumentJson);
}

function parseAndStringify(input: string): string {
  return processor.stringify(processor.parse(input));
}

describe("HtmlProcessorTest", function () {
  const fixtures = [
    "typical.html",
    "html-links.html",
    "table.html",
    "list.html",
    "main.html",
    "edge.html",
  ];

  fixtures.forEach((filename) => {
    it(`should process ${filename} correctly`, function () {
      processAndCompare(filename);
    });
  });

  it("should roundtrip fragments exactly", function () {
    const inputs = [
      "<ul>\n    <li>Coffee</li>\n    <li><b>Tea</b></li>\n</ul>",
      "<p>See <code>code</code> and <b><em>more</em></b></p>",
      "Text\n\nText <em>and em</em>",
      '<p>Read <a href="/docs" title="Docs">the docs</a>.</p>',
      '<div><img src="a.png" alt="Close"></div>',
      '<div><input type="email" class="input-letter" placeholder="123"></div>',
      "<table><tbody><tr><th colspan=\"2\">Parameters</th></tr></tbody></table>",
    ];

    inputs.forEach((input) => {
      assert.equal(parseAndStringify(input), input);
    });
  });

  it("should keep inline markup of root-level text", function () {
    const document = processor.parse("Text <em>and em</em>");

    assert.deepEqual(document.segments.map(({ text }) => text), [
      "Text {em0}and em{/em0}",
    ]);
  });

  it("should keep a block with inline-only children in one segment", function () {
    const document = processor.parse("<p><b>Bold</b> <i>italic</i></p>");

    assert.deepEqual(document.segments.map(({ text }) => text), [
      "{b0}Bold{/b0} {i1}italic{/i1}",
    ]);
  });

  it("should keep surrounding whitespace out of segments", function () {
    const input = "<li>\n    Coffee <b>and</b> tea\n</li>";
    const document = processor.parse(input);

    assert.deepEqual(document.segments.map(({ text }) => text), [
      "Coffee {b0}and{/b0} tea",
    ]);
    assert.equal(processor.stringify(document), input);
  });

  it("should store tag attributes as html attributes", function () {
    const document = processor.parse(
      '<p>Go <a href="/x" class="link primary">there</a></p>',
    );

    assert.deepEqual(document.segments[0].tags, {
      a0: { href: "/x", class: "link primary" },
    });
  });

  it("should not store container attributes as tags", function () {
    const document = processor.parse('<option value="">Choose</option>');

    assert.isUndefined(document.segments[0].tags);
  });

  it("should not segment script and style content", function () {
    const input =
      "<div><script>var a = 1;</script><style>p { color: red; }</style></div>";
    const document = processor.parse(input);

    assert.lengthOf(document.segments, 0);
    assert.equal(processor.stringify(document), input);
  });

  it("should produce deterministic ids", function () {
    const input = "<p>Hello <b>world</b></p>";

    assert.deepEqual(processor.parse(input), processor.parse(input));
  });

  it("should apply translated segments", function () {
    const document = processor.parse(
      '<h1>Hello</h1><p>Read <a href="/docs">the docs</a></p>',
    );

    document.segments[0].text = "Hallo";
    document.segments[1].text = "Lies {a0}die Doku{/a0}";

    assert.equal(
      processor.stringify(document),
      '<h1>Hallo</h1><p>Lies <a href="/docs">die Doku</a></p>',
    );
  });

  it("should resolve heading markers with large indexes", function () {
    const document = processor.parse("<div>x</div>");

    document.segments[0].text = "{h112}Title{/h112}";

    assert.equal(processor.stringify(document), "<div><h1>Title</h1></div>");
  });

  it("should keep text when a closing marker is unmatched", function () {
    const document = processor.parse("<p>Hello <b>world</b></p>");

    document.segments[0].text = "Hallo Welt{/b0}";

    assert.equal(processor.stringify(document), "<p>Hallo Welt</p>");
  });

  it("should not mutate the document on stringify", function () {
    const document = processor.parse("<p>Hello <b>world</b></p>");
    const before = JSON.stringify(document);

    processor.stringify(document);

    assert.equal(JSON.stringify(document), before);
  });
});
