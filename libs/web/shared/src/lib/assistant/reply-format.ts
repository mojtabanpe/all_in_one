/** A run of reply text, bold or plain. */
export interface ReplySpan {
  text: string;
  bold: boolean;
}

/** One line of a reply: a paragraph line, a list item or a heading. */
export interface ReplyBlock {
  kind: 'line' | 'item' | 'heading' | 'gap';
  /** The number of a numbered list item («۱.»), kept as the model wrote it. */
  marker?: string;
  spans: ReplySpan[];
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*(\d+|[۰-۹]+)[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

/** `**bold**` / `__bold__` runs; stray markers and inline code ticks are dropped. */
export function replySpans(line: string): ReplySpan[] {
  const spans: ReplySpan[] = [];
  const pattern = /\*\*(.+?)\*\*|__(.+?)__/g;
  let last = 0;
  for (const match of line.matchAll(pattern)) {
    if (match.index > last)
      spans.push({ text: line.slice(last, match.index), bold: false });
    spans.push({ text: match[1] ?? match[2], bold: true });
    last = match.index + match[0].length;
  }
  if (last < line.length) spans.push({ text: line.slice(last), bold: false });
  return spans
    .map((span) => ({ ...span, text: span.text.replace(/\*\*|`/g, '') }))
    .filter((span) => span.text.length > 0);
}

/**
 * The assistant's model answers in light Markdown (bold, bullet and numbered lists, headings). The chat shows it as
 * plain text, so `**` and `- ` used to appear as typed. This turns a reply into blocks the template renders with
 * ordinary elements: no HTML from the model ever reaches the page.
 */
export function formatReply(text: string): ReplyBlock[] {
  const blocks: ReplyBlock[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      if (blocks.length && blocks[blocks.length - 1].kind !== 'gap')
        blocks.push({ kind: 'gap', spans: [] });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        kind: 'heading',
        spans: replySpans(heading[1]).map((s) => ({ ...s, bold: true })),
      });
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      blocks.push({ kind: 'item', spans: replySpans(bullet[1]) });
      continue;
    }
    const numbered = NUMBERED.exec(line);
    if (numbered) {
      blocks.push({
        kind: 'item',
        marker: `${numbered[1]}.`,
        spans: replySpans(numbered[2]),
      });
      continue;
    }
    blocks.push({ kind: 'line', spans: replySpans(line.trim()) });
  }
  while (blocks.length && blocks[blocks.length - 1].kind === 'gap')
    blocks.pop();
  return blocks;
}
