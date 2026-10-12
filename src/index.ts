import { Document, Processor } from "@segmsh/core";
import { fromHtml } from "hast-util-from-html";
import { toHtml } from "hast-util-to-html";
import { removePosition } from "unist-util-remove-position";
import {
  desegmentize,
  fixWhitespace,
  isFragment,
  segmentize,
} from "./utils.js";

export default class HtmlProcessor implements Processor {
  parse(res: string): Document {
    const tree = fromHtml(res, { fragment: isFragment(res) });

    removePosition(tree);
    fixWhitespace(tree);

    const segments = segmentize(tree);

    return { tree, segments };
  }

  stringify(document: Document): string {
    const tree = desegmentize(document.tree, document.segments);

    return toHtml(tree, { allowDangerousHtml: true });
  }
}
