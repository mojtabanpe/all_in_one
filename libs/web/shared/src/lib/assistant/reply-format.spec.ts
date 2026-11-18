import { formatReply, replySpans } from './reply-format';

describe('formatReply', () => {
  it('turns the meal-log reply into bold runs and list items', () => {
    const blocks = formatReply(
      'ناهار ثبت شد ✅\n\n- **قورمه سبزی با برنج** — حدود ۶۸۰ کالری\n- امتیاز وعده: ۷۸\n\nاگه بخوای مقایسه می‌کنم.',
    );
    expect(blocks.map((b) => b.kind)).toEqual([
      'line',
      'gap',
      'item',
      'item',
      'gap',
      'line',
    ]);
    expect(blocks[2].spans).toEqual([
      { text: 'قورمه سبزی با برنج', bold: true },
      { text: ' — حدود ۶۸۰ کالری', bold: false },
    ]);
    expect(JSON.stringify(blocks)).not.toContain('**');
  });

  it('keeps numbered items and headings', () => {
    const blocks = formatReply('## برنامه\n1. صبحانه\n۲) ناهار');
    expect(blocks[0]).toEqual({
      kind: 'heading',
      spans: [{ text: 'برنامه', bold: true }],
    });
    expect(blocks[1]).toMatchObject({ kind: 'item', marker: '1.' });
    expect(blocks[2]).toMatchObject({ kind: 'item', marker: '۲.' });
  });

  it('drops unmatched markers and inline code ticks', () => {
    expect(replySpans('حدود **۶۸۰ کالری و `x`')).toEqual([
      { text: 'حدود ۶۸۰ کالری و x', bold: false },
    ]);
  });

  it('leaves plain text untouched and trims trailing gaps', () => {
    expect(formatReply('سلام\n\n')).toEqual([
      { kind: 'line', spans: [{ text: 'سلام', bold: false }] },
    ]);
  });
});
