import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { HighlightedOriginal } from '@/components/editor/EntryCard';

it('shows green arrows for Risen newlines and Steins;Gate engine breaks', () => {
  for (const [text, msbtFile] of [['A\nB', 'documents.tab'], ['A\\nB%NC', 'steinsgate/DATA.BIN']]) {
    const html = renderToStaticMarkup(<HighlightedOriginal text={text} msbtFile={msbtFile} />);
    expect(html).toContain('↵');
    expect(html).toContain('text-emerald-600');
  }
});

it('highlights adjacent Steins;Gate commands without swallowing dialogue', () => {
  const html = renderToStaticMarkup(<HighlightedOriginal text="%B1SOrganization%B1E%K%P" msbtFile="steinsgate/SG00_01.BIN" />);
  expect(html).toContain('>Organization</span>');
  expect((html.match(/وسم Steins;Gate/g) ?? []).length).toBe(4);
});
