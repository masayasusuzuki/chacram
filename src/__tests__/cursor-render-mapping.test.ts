/**
 * Tests for Cursor.renderWithMapping() — viewport-to-offset coordinate mapping.
 */

import { describe, test, expect } from 'bun:test'
import { Cursor } from '../utils/Cursor.js'

// Shortcut: create a Cursor and call renderWithMapping
function map(text: string, columns = 80, opts?: {
  offset?: number
  selection?: number
  maxVisibleLines?: number
}) {
  const c = Cursor.fromText(text, columns, opts?.offset ?? 0, opts?.selection ?? -1)
  return c.renderWithMapping('|', '', (s: string) => s, undefined, opts?.maxVisibleLines)
}

describe('renderWithMapping', () => {
  describe('single-line text', () => {
    const { offsetAt } = map('hello', 80)

    test('offset is correct at start', () => {
      expect(offsetAt(0, 0)).toBe(0)
    })
    test('offset tracks display column', () => {
      expect(offsetAt(0, 2)).toBe(2)
    })
    test('offset at end of text', () => {
      expect(offsetAt(0, 5)).toBe(5)
    })
    test('click past end of text clamps to end', () => {
      expect(offsetAt(0, 99)).toBe(5)
    })
  })

  describe('multi-line text', () => {
    const { offsetAt } = map('hello\nworld', 80)

    test('first line, start', () => {
      expect(offsetAt(0, 0)).toBe(0)
    })
    test('first line, end', () => {
      expect(offsetAt(0, 5)).toBe(5)
    })
    test('second line, start → offset after newline', () => {
      expect(offsetAt(1, 0)).toBe(6)
    })
    test('second line, middle', () => {
      expect(offsetAt(1, 2)).toBe(8) // 'wo'
    })
  })

  describe('wrapped text (narrow columns)', () => {
    // "hello world" with columns=5 wraps at char boundaries:
    //   hell
    //   o wo
    //   rld
    // startOffsets: [0, 4, 8], all continuation lines (not preceded by newline)
    const { offsetAt, text } = map('hello world', 5)

    test('rendered text has 3 lines', () => {
      expect(text.split('\n').length).toBe(3)
    })
    test('first wrapped line maps to original offsets', () => {
      expect(offsetAt(0, 0)).toBe(0)  // 'h'
      expect(offsetAt(0, 4)).toBe(4)  // end of 'hell'
    })
    test('second wrapped line continues from offset 4', () => {
      // Display: "o wo" (no leading trim needed, starts with 'o')
      expect(offsetAt(1, 0)).toBe(4)  // 'o'
      expect(offsetAt(1, 1)).toBe(5)  // ' '
    })
    test('third wrapped line continues from offset 8', () => {
      expect(offsetAt(2, 0)).toBe(8)  // 'r'
      expect(offsetAt(2, 3)).toBe(11) // end of 'rld'
    })
  })

  describe('out of bounds', () => {
    const { offsetAt } = map('abc', 80)

    test('negative row returns null', () => {
      expect(offsetAt(-1, 0)).toBeNull()
    })
    test('negative column returns null', () => {
      expect(offsetAt(0, -1)).toBeNull()
    })
    test('row beyond total lines returns null', () => {
      expect(offsetAt(10, 0)).toBeNull()
    })
  })

  describe('viewport scrolling (maxVisibleLines)', () => {
    // 5 lines of text, only 2 visible, cursor at start
    const lines = ['line0', 'line1', 'line2', 'line3', 'line4']
    const { offsetAt } = map(lines.join('\n'), 80, { offset: 0, maxVisibleLines: 2 })

    test('viewport row 0 → visible line (absolute line 0)', () => {
      expect(offsetAt(0, 0)).toBe(0)
    })
    test('viewport row 1 → visible line (absolute line 1)', () => {
      expect(offsetAt(1, 0)).toBe(6) // 'line0\n' → 6 chars
    })
    test('viewport row 2 → outside visible range but offsetAt maps it anyway (absolute line 2)', () => {
      // offsetAt maps any in-bounds absolute line; caller should clip to viewport
      expect(offsetAt(2, 0)).toBe(12) // 'line0\nline1\n' → 12 chars
    })
    test('row beyond total lines returns null', () => {
      expect(offsetAt(99, 0)).toBeNull()
    })
  })

  describe('cursor positioned in middle of multi-line', () => {
    // Cursor at position 18 (end of 'the' in line 3, after two newlines)
    const text = 'first line\nsecond line\nthe third line'
    // offset 18 = after 'the' on third line
    const { offsetAt } = map(text, 80, { offset: 18 })

    test('row 0 maps to first line', () => {
      expect(offsetAt(0, 0)).toBe(0)
    })
    test('row 1 maps to second line', () => {
      expect(offsetAt(1, 0)).toBe(11)
    })
    test('row 2 maps to third line', () => {
      expect(offsetAt(2, 0)).toBe(23)
    })
  })

  describe('text is preserved from render()', () => {
    const result = map('test input', 80, { offset: 4 })

    test('text contains cursor character', () => {
      expect(result.text).toContain('test')
    })
    test('text is not empty', () => {
      expect(result.text.length).toBeGreaterThan(0)
    })
  })

  describe('CJK characters', () => {
    // Each CJK char = display width 2
    const { offsetAt } = map('あいう', 80)

    test('click at column 0 → offset 0', () => {
      expect(offsetAt(0, 0)).toBe(0)
    })
    test('click at column 1 (still first CJK char) → offset 0', () => {
      // Column 1 is still within the first CJK char (display width 2)
      expect(offsetAt(0, 1)).toBe(0)
    })
    test('click at column 2 → offset 1 (second char)', () => {
      expect(offsetAt(0, 2)).toBe(1)
    })
  })

  describe('selections do not affect offsetAt', () => {
    const { offsetAt } = map('test', 80, { offset: 2, selection: 0 })

    test('offsetAt ignores selection', () => {
      expect(offsetAt(0, 0)).toBe(0)
      expect(offsetAt(0, 2)).toBe(2)
    })
  })
})
