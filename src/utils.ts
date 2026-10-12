import {
  Element,
  ElementContent,
  Properties,
  Root,
  RootContent,
  Segment,
  Tag,
  element,
  id,
  segment,
  text,
} from "@segmsh/core";
import { find, html } from "property-information";

const VOID_TAGS: string[] = [
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "source", "track", "wbr",
];

// Inline elements that are kept inside a segment as tag markers
const PHRASING_TAGS: string[] = [
  "a", "abbr", "b", "bdi", "bdo", "br", "button", "cite", "code", "data",
  "del", "dfn", "em", "i", "img", "input", "ins", "kbd", "label", "mark",
  "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u",
  "var", "wbr",
];

// Elements that get a segment even without text, so their attributes (e.g. alt, placeholder) are exposed
const STANDALONE_TAGS: string[] = ["a", "img", "input"];

// Elements whose text content is never translatable
const OPAQUE_TAGS: string[] = ["script", "style", "template"];

const MARKER_REGEXP: RegExp = /^(\/?)([a-zA-Z][a-zA-Z0-9-]*?)(\d+)$/;
const HEADING_MARKER_REGEXP: RegExp = /^(\/?)(h[1-6])(\d+)$/;

type Container = Root | Element;

const hasText = (node: Container): boolean =>
  node.children.some((child) => child.type === "text" && !!child.value.trim());

const hasDeepText = (node: ElementContent): boolean => {
  if (node.type === "text") return !!node.value.trim();
  if (node.type === "element") return node.children.some(hasDeepText);
  return false;
};

const isPhrasing = (node: ElementContent): boolean => {
  if (node.type === "text") return true;
  if (node.type !== "element" || !PHRASING_TAGS.includes(node.tagName)) {
    return false;
  }
  return node.children.every(isPhrasing);
};

const isSegmentContainer = (node: Container): boolean =>
  hasText(node) ||
  (node.children.length > 0 &&
    (node.children as ElementContent[]).every(isPhrasing) &&
    (node.children as ElementContent[]).some(hasDeepText));

const toAttributes = (properties: Properties): Tag => {
  const attributes: Tag = {};

  for (const [key, value] of Object.entries(properties)) {
    if (value === null || value === undefined || value === false) continue;

    const info = find(html, key);

    if (value === true) {
      attributes[info.attribute] = "";
    } else if (Array.isArray(value)) {
      attributes[info.attribute] = value.join(info.commaSeparated ? ", " : " ");
    } else {
      attributes[info.attribute] = String(value);
    }
  }

  return attributes;
};

export const serialize = (
  nodes: ElementContent[],
): Omit<Segment, "id"> => {
  const tags: Record<string, Tag> = {};
  let index = 0;

  const toString = (node: ElementContent): string => {
    if (node.type === "text") return node.value;
    if (node.type !== "element") return "";

    const key = `${node.tagName}${index++}`;
    const attributes = toAttributes(node.properties);

    if (Object.keys(attributes).length) {
      tags[key] = attributes;
    }

    if (VOID_TAGS.includes(node.tagName)) {
      return `{${key}}`;
    }

    return `{${key}}${node.children.map(toString).join("")}{/${key}}`;
  };

  const value = nodes.map(toString).join("");

  return Object.keys(tags).length ? { text: value, tags } : { text: value };
};

const parseMarker = (
  marker: string,
): { closing: boolean; tagName: string } | null => {
  const match = HEADING_MARKER_REGEXP.exec(marker) ?? MARKER_REGEXP.exec(marker);
  if (!match) return null;

  return { closing: match[1] === "/", tagName: match[2] };
};

export const deserialize = (current: Segment): ElementContent[] => {
  const stack: ElementContent[] = [];
  const open = new Map<ElementContent, string>();
  const value = current.text;
  let buffer = "";

  const flush = () => {
    if (buffer) {
      stack.push(text(buffer));
      buffer = "";
    }
  };

  for (let i = 0; i < value.length; i++) {
    const closingIndex = value[i] === "{" ? value.indexOf("}", i + 1) : -1;
    const marker = closingIndex > 0 ? value.substring(i + 1, closingIndex) : "";
    const parsed = marker ? parseMarker(marker) : null;

    if (!parsed) {
      buffer += value[i];
      continue;
    }

    flush();

    if (parsed.closing) {
      const openingIndex = stack.findLastIndex(
        (node) => open.get(node) === marker.slice(1),
      );

      // Unmatched closing marker: drop it and keep the content
      if (openingIndex >= 0) {
        const opening = stack[openingIndex] as Element;
        opening.children = stack.splice(openingIndex + 1);
        open.delete(opening);
      }
    } else {
      const opening = element(parsed.tagName, current.tags?.[marker] ?? {});

      if (!VOID_TAGS.includes(parsed.tagName)) {
        open.set(opening, marker);
      }

      stack.push(opening);
    }

    i = closingIndex;
  }

  flush();

  return stack;
};

export const segmentize = (tree: Root): Segment[] => {
  const segments: Segment[] = [];

  const add = (nodes: ElementContent[]) => {
    const content = serialize(nodes);
    const segId = id(content);

    segments.push({ id: segId, ...content });

    return segment(segId);
  };

  // Keeps surrounding whitespace in the tree, out of the segment text
  const addTrimmed = (nodes: ElementContent[]): ElementContent[] => {
    const inner = nodes.map((node) =>
      node.type === "text" ? text(node.value) : node,
    );
    const first = inner[0];
    const last = inner[inner.length - 1];
    let leading = "";
    let trailing = "";

    if (first?.type === "text") {
      const value = first.value.trimStart();
      leading = first.value.slice(0, first.value.length - value.length);
      first.value = value;
    }

    if (last?.type === "text") {
      const value = last.value.trimEnd();
      trailing = last.value.slice(value.length);
      last.value = value;
    }

    const content = inner.filter(
      (node) => node.type !== "text" || node.value,
    );

    return [
      ...(leading ? [text(leading)] : []),
      add(content),
      ...(trailing ? [text(trailing)] : []),
    ];
  };

  const walk = (parent: Container) => {
    if (isSegmentContainer(parent)) {
      parent.children = addTrimmed(parent.children as ElementContent[]);
      return;
    }

    parent.children.forEach((child, index) => {
      if (child.type !== "element" || OPAQUE_TAGS.includes(child.tagName)) {
        return;
      }

      if (isSegmentContainer(child)) {
        child.children = addTrimmed(child.children);
      } else if (STANDALONE_TAGS.includes(child.tagName)) {
        parent.children[index] = add([child]);
      } else {
        walk(child);
      }
    });
  };

  walk(tree);

  return segments;
};

export const desegmentize = (tree: Root, segments: Segment[]): Root => {
  const segmentsMap = new Map<string, Segment>(
    segments.map((current) => [current.id, current]),
  );

  const restore = <T extends Container>(node: T): T => {
    const children = node.children.flatMap((child): RootContent[] => {
      if (child.type === "segment") {
        const current = segmentsMap.get(child.id);
        return current ? deserialize(current) : [];
      }

      return child.type === "element" ? [restore(child)] : [child];
    });

    return { ...node, children };
  };

  return restore(tree);
};

// The parser moves whitespace around <html> and <body>; restore indentation
export const fixWhitespace = (tree: Root) => {
  const walk = (node: Container) => {
    node.children.forEach((child) => {
      if (child.type !== "element") return;

      if (child.tagName === "html") {
        child.children.unshift(text("\n  "));
        child.children.push(text("\n"));
      } else if (child.tagName === "body") {
        const last = child.children[child.children.length - 1];

        if (last?.type === "text") {
          last.value = "\n  ";
        }
      }

      walk(child);
    });
  };

  walk(tree);
};

export const isFragment = (source: string): boolean =>
  !source.includes("</head>") &&
  !source.includes("</body>") &&
  !source.includes("</html>");
