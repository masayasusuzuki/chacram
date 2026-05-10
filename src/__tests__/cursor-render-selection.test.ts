/**
 * Tests for Cursor.render() interaction between selection inversion and
 * cursor placement. Regression tests for the bug where the grapheme-segmenter
 * cursor-placement loop split ANSI CSI sequences (e.g. \x1b[7m) at the
 * cursor, causing fragments like "[7m" to leak into the rendered output.
 */

import { describe, test, expect } from 'bun:test'
import { Cursor } from '../utils/Cursor.js'

const INV_OPEN = '\x1b[7m'
const INV_CLOSE = '\x1b[27m'

const fakeInvert = (s: string) => `${INV_OPEN}${s}${INV_CLOSE}`

function render(
  text: string,
  opts: { offset: number; selection?: number; columns?: number },
): string {
  const c = Cursor.fromText(
    text,
    opts.columns ?? 80,
    opts.offset,
    opts.selection ?? -1,
  )
  return c.render('|', '', fakeInvert)
}

describe('Cursor.render() with selection + cursor on same line', () => {
  test('cursor at selection start does not leak ANSI fragments', () => {
    // 'before|selected|after' — cursor at offset 6 (start of selected),
    // selection from 6..14
    const out = render('beforeselectedafter', { offset: 6, selection: 14 })
    expect(out).not.toContain('\x1b\x1b')
    // Should not contain any visible ANSI parameter fragments. Strip all
    // valid CSI sequences and verify nothing escape-shaped remains.
    const stripped = out.replace(
      /\x1b\[[\x30-\x3F]*[\x20-\x2F]*[\x40-\x7E]/g,
      '',
    )
    expect(stripped).not.toMatch(/\[?\d+m/)
    expect(stripped).not.toContain('\x1b')
  })

  test('cursor at selection end does not misplace cursor character', () => {
    // 'before|selected|after' — cursor at offset 14 (right after selected),
    // selection from 6..14
    const out = render('beforeselectedafter', { offset: 14, selection: 6 })
    const stripped = out.replace(
      /\x1b\[[\x30-\x3F]*[\x20-\x2F]*[\x40-\x7E]/g,
      '',
    )
    expect(stripped).toBe('beforeselectedafter')
    expect(out).not.toContain('\x1b\x1b')
  })

  test('cursor inside selection emits well-formed ANSI', () => {
    // cursor at offset 9 (inside 'selected'), selection from 6..14
    const out = render('beforeselectedafter', { offset: 9, selection: 6 })
    const stripped = out.replace(
      /\x1b\[[\x30-\x3F]*[\x20-\x2F]*[\x40-\x7E]/g,
      '',
    )
    expect(stripped).toBe('beforeselectedafter')
    expect(out).not.toContain('\x1b\x1b')
    // No literal "7m" or "27m" should appear as visible characters
    expect(stripped).not.toContain('7m')
    expect(stripped).not.toContain('27m')
  })

  test('cursor before selection renders selection intact', () => {
    // cursor at offset 2, selection from 6..14
    const c = Cursor.fromText('beforeselectedafter', 80, 2, 14)
    // Move offset to 2, selection anchor at 14 (so selection is 2..14? no)
    // Actually we want selection 6..14 with cursor at 2 — but cursor is one
    // of the endpoints by construction. Use selection 6..2 inversion.
    // Skipping: cursor is always at an endpoint, so this case isn't
    // reachable via our model. Just verify no-selection-on-cursor-line
    // rendering is unaffected.
    const out = c.render('|', '', fakeInvert)
    const stripped = out.replace(
      /\x1b\[[\x30-\x3F]*[\x20-\x2F]*[\x40-\x7E]/g,
      '',
    )
    expect(stripped).toBe('beforeselectedafter')
    expect(out).not.toContain('\x1b\x1b')
  })

  test('CJK in selection with cursor at boundary', () => {
    // CJK chars are width 2 — verify the cursor-placement loop tracks
    // display width correctly across ANSI tokens with wide chars
    const out = render('aaあいうbbb', { offset: 2, selection: 5 })
    const stripped = out.replace(
      /\x1b\[[\x30-\x3F]*[\x20-\x2F]*[\x40-\x7E]/g,
      '',
    )
    expect(stripped).toBe('aaあいうbbb')
    expect(out).not.toContain('\x1b\x1b')
  })

  test('no selection: render is unchanged by tokenizer refactor', () => {
    const out = render('hello world', { offset: 5 })
    const stripped = out.replace(
      /\x1b\[[\x30-\x3F]*[\x20-\x2F]*[\x40-\x7E]/g,
      '',
    )
    expect(stripped).toBe('hello world')
  })

  // Case B: when the cursor lands inside an active inverse region (e.g.
  // backward drag — cursor at selStart), the cursor's invert(...) wraps
  // its character with \x1b[7m...\x1b[27m. The closing 27 prematurely
  // ends the selection's inverse for the rest of the line, leaving the
  // post-cursor portion of the selection rendered as plain text in the
  // terminal. The fix re-opens \x1b[7m after the cursor.
  describe('inverse re-open after cursor inside selection (case B)', () => {
    // Parse a render() output by simulating the SGR-7/27 state machine
    // that the terminal applies. Returns a per-character "inverse on?" map.
    function inverseMap(rendered: string): { char: string; inv: boolean }[] {
      const out: { char: string; inv: boolean }[] = []
      let inv = false
      let i = 0
      while (i < rendered.length) {
        if (rendered[i] === '\x1b' && rendered[i + 1] === '[') {
          // Consume CSI through final byte
          let j = i + 2
          while (j < rendered.length) {
            const c = rendered.charCodeAt(j)
            if (c >= 0x40 && c <= 0x7e) {
              const seq = rendered.slice(i, j + 1)
              if (seq === '\x1b[7m') inv = true
              else if (seq === '\x1b[27m') inv = false
              i = j + 1
              break
            }
            j++
          }
          continue
        }
        out.push({ char: rendered[i]!, inv })
        i++
      }
      return out
    }

    test('backward selection: full selection range is inverted', () => {
      // Cursor at offset 2 (selStart), selection extends to 5
      const out = render('12345678', { offset: 2, selection: 5 })
      const map = inverseMap(out)
      // Visible chars should be exactly "12345678" with inverse on for
      // indices 2..4 (the selected '3','4','5')
      expect(map.map(c => c.char).join('')).toBe('12345678')
      expect(map[0]!.inv).toBe(false) // '1'
      expect(map[1]!.inv).toBe(false) // '2'
      expect(map[2]!.inv).toBe(true) // '3' (cursor + selection)
      expect(map[3]!.inv).toBe(true) // '4' (selection)
      expect(map[4]!.inv).toBe(true) // '5' (selection)
      expect(map[5]!.inv).toBe(false) // '6'
    })

    test('forward selection: full selection range is inverted', () => {
      // Cursor at offset 5 (selEnd), selection anchor at 2
      const out = render('12345678', { offset: 5, selection: 2 })
      const map = inverseMap(out)
      expect(map.map(c => c.char).join('')).toBe('12345678')
      expect(map[1]!.inv).toBe(false) // '2'
      expect(map[2]!.inv).toBe(true) // '3'
      expect(map[3]!.inv).toBe(true) // '4'
      expect(map[4]!.inv).toBe(true) // '5'
      expect(map[5]!.inv).toBe(true) // '6' (cursor)
      expect(map[6]!.inv).toBe(false) // '7'
    })

    test('cursor without cursorChar keeps inverse state intact', () => {
      // When cursorChar is empty, the cursor isn't inverted, so no
      // \x1b[27m disruption should happen; verify the simpler path still
      // produces a fully-inverted selection.
      const c = Cursor.fromText('12345678', 80, 2, 5)
      const out = c.render('', '', fakeInvert)
      const map = inverseMap(out)
      expect(map[2]!.inv).toBe(true)
      expect(map[3]!.inv).toBe(true)
      expect(map[4]!.inv).toBe(true)
    })
  })
})
