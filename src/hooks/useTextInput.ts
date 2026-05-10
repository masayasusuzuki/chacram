import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { isInputModeCharacter } from 'src/components/PromptInput/inputModes.js'
import { useNotifications } from 'src/context/notifications.js'
import { setClipboard } from '../ink/termio/osc.js'
import stripAnsi from 'strip-ansi'
import { markBackslashReturnUsed } from '../commands/terminalSetup/terminalSetup.js'
import { addToHistory } from '../history.js'
import type { Key } from '../ink.js'
import type {
  InlineGhostText,
  TextInputState,
} from '../types/textInputTypes.js'
import {
  Cursor,
  getLastKill,
  pushToKillRing,
  recordYank,
  resetKillAccumulation,
  resetYankState,
  updateYankLength,
  yankPop,
} from '../utils/Cursor.js'
import { env } from '../utils/env.js'
import { isFullscreenEnvEnabled } from '../utils/fullscreen.js'
import { useSelection } from '../ink/hooks/use-selection.js'
import type { ImageDimensions } from '../utils/imageResizer.js'
import { isModifierPressed, prewarmModifiers } from '../utils/modifiers.js'
import { useDoublePress } from './useDoublePress.js'

type MaybeCursor = void | Cursor
type InputHandler = (input: string) => MaybeCursor
type InputMapper = (input: string) => MaybeCursor
const NOOP_HANDLER: InputHandler = () => {}
function mapInput(input_map: Array<[string, InputHandler]>): InputMapper {
  const map = new Map(input_map)
  return function (input: string): MaybeCursor {
    return (map.get(input) ?? NOOP_HANDLER)(input)
  }
}

export type UseTextInputProps = {
  value: string
  onChange: (value: string) => void
  onSubmit?: (value: string) => void
  onExit?: () => void
  onExitMessage?: (show: boolean, key?: string) => void
  onHistoryUp?: () => void
  onHistoryDown?: () => void
  onHistoryReset?: () => void
  onClearInput?: () => void
  focus?: boolean
  mask?: string
  multiline?: boolean
  cursorChar: string
  highlightPastedText?: boolean
  invert: (text: string) => string
  themeText: (text: string) => string
  columns: number
  onImagePaste?: (
    base64Image: string,
    mediaType?: string,
    filename?: string,
    dimensions?: ImageDimensions,
    sourcePath?: string,
  ) => void
  disableCursorMovementForUpDownKeys?: boolean
  disableEscapeDoublePress?: boolean
  maxVisibleLines?: number
  externalOffset: number
  onOffsetChange: (offset: number) => void
  inputFilter?: (input: string, key: Key) => string
  inlineGhostText?: InlineGhostText
  dim?: (text: string) => string
  /** Ref to the input Box's screen (x, y) position, used to convert
   *  Ink absolute selection coordinates to viewport-relative coords
   *  for mouse-drag selection sync. */
  selectionSyncRef?: React.MutableRefObject<{ x: number; y: number } | null>
}

export function useTextInput({
  value: originalValue,
  onChange,
  onSubmit,
  onExit,
  onExitMessage,
  onHistoryUp,
  onHistoryDown,
  onHistoryReset,
  onClearInput,
  mask = '',
  multiline = false,
  cursorChar,
  invert,
  columns,
  onImagePaste: _onImagePaste,
  disableCursorMovementForUpDownKeys = false,
  disableEscapeDoublePress = false,
  maxVisibleLines,
  externalOffset,
  onOffsetChange,
  inputFilter,
  inlineGhostText,
  dim,
  selectionSyncRef,
  focus = false,
}: UseTextInputProps): TextInputState {
  // Pre-warm the modifiers module for Apple Terminal (has internal guard, safe to call multiple times)
  if (env.terminal === 'Apple_Terminal') {
    prewarmModifiers()
  }

  // Keep a local text/cursor mirror so consecutive keystrokes can advance
  // immediately even if the controlled parent value hasn't committed yet.
  const [renderState, setRenderState] = useState(() => ({
    value: originalValue,
    offset: externalOffset,
    selectionAnchor: -1, // -1 = no selection
  }))
  const liveValueRef = useRef(originalValue)
  const liveOffsetRef = useRef(externalOffset)
  const liveSelectionAnchorRef = useRef(-1)
  const lastSeenPropsRef = useRef({
    value: originalValue,
    offset: externalOffset,
  })
  const updateRenderedInput = (
    nextValue: string,
    nextOffset: number,
    nextSelectionAnchor = -1,
  ): void => {
    liveValueRef.current = nextValue
    liveOffsetRef.current = nextOffset
    liveSelectionAnchorRef.current = nextSelectionAnchor
    // Sync lastSeenPropsRef so the useLayoutEffect below doesn't
    // reset selectionAnchor when onOffsetChange triggers a parent
    // re-render with the same offset value.
    lastSeenPropsRef.current = { value: nextValue, offset: nextOffset }
    setRenderState(prev =>
      prev.value === nextValue &&
      prev.offset === nextOffset &&
      prev.selectionAnchor === nextSelectionAnchor
        ? prev
        : {
            value: nextValue,
            offset: nextOffset,
            selectionAnchor: nextSelectionAnchor,
          },
    )
  }
  useLayoutEffect(() => {
    if (
      lastSeenPropsRef.current.value === originalValue &&
      lastSeenPropsRef.current.offset === externalOffset
    ) {
      return
    }

    lastSeenPropsRef.current = {
      value: originalValue,
      offset: externalOffset,
    }
    updateRenderedInput(originalValue, externalOffset)
  }, [originalValue, externalOffset])

  const value = renderState.value
  const offset = renderState.offset
  const selectionAnchor = renderState.selectionAnchor
  const getLiveValue = (): string => liveValueRef.current
  const getLiveCursor = (): Cursor =>
    Cursor.fromText(
      liveValueRef.current,
      columns,
      liveOffsetRef.current,
      liveSelectionAnchorRef.current,
    )
  const setValue = (
    nextValue: string,
    nextOffset = liveOffsetRef.current,
    nextSelectionAnchor = liveSelectionAnchorRef.current,
  ): void => {
    const previousValue = liveValueRef.current
    const previousOffset = liveOffsetRef.current
    const previousSelectionAnchor = liveSelectionAnchorRef.current

    if (
      previousValue === nextValue &&
      previousOffset === nextOffset &&
      previousSelectionAnchor === nextSelectionAnchor
    ) {
      return
    }

    updateRenderedInput(nextValue, nextOffset, nextSelectionAnchor)

    if (previousValue !== nextValue) {
      onChange(nextValue)
    }

    if (previousOffset !== nextOffset) {
      onOffsetChange(nextOffset)
    }
  }
  const setOffset = (nextOffset: number, nextSelectionAnchor = liveSelectionAnchorRef.current): void => {
    if (
      nextOffset === liveOffsetRef.current &&
      nextSelectionAnchor === liveSelectionAnchorRef.current
    ) {
      return
    }

    updateRenderedInput(liveValueRef.current, nextOffset, nextSelectionAnchor)
    onOffsetChange(nextOffset)
  }
  /**
   * Clear the selection (if any). Called after non-Shift cursor moves and
   * text insertion. Returns false if there was no selection to clear.
   */
  const clearSelectionIfAny = (finalOffset: number): void => {
    if (liveSelectionAnchorRef.current >= 0) {
      updateRenderedInput(liveValueRef.current, finalOffset, -1)
    }
  }
  const cursor = Cursor.fromText(value, columns, offset, selectionAnchor)
  const { addNotification, removeNotification } = useNotifications()

  const handleCtrlC = useDoublePress(
    show => {
      onExitMessage?.(show, 'Ctrl-C')
    },
    () => onExit?.(),
    () => {
      const currentValue = getLiveValue()
      if (currentValue) {
        updateRenderedInput('', 0, -1)
        onChange('')
        onOffsetChange(0)
        onHistoryReset?.()
      }
    },
  )

  /** Ctrl+C with selection → copy to clipboard, clear selection. */
  async function copySelection(): Promise<boolean> {
    const cursor = getLiveCursor()
    if (!cursor.hasSelection()) return false
    const text = cursor.selectedText()
    if (!text) return false
    // Use the platform-aware setClipboard (pbcopy / OSC 52 / tmux)
    try {
      const seq = await setClipboard(text)
      process.stdout.write(seq)
    } catch {
      // Best-effort: clipboard may be unavailable
    }
    updateRenderedInput(
      cursor.text,
      cursor.offset,
      -1, // clear selection
    )
    addNotification({
      key: 'selection-copied',
      text: text.length > 50 ? `Copied ${text.length} chars` : `Copied: ${text}`,
      priority: 'medium',
      timeoutMs: 1500,
    })
    return true
  }

  // NOTE(keybindings): This escape handler is intentionally NOT migrated to the keybindings system.
  // It's a text-level double-press escape for clearing input, not an action-level keybinding.
  // Double-press Esc clears the input and saves to history - this is text editing behavior,
  // not dialog dismissal, and needs the double-press safety mechanism.
  const handleEscape = useDoublePress(
    (show: boolean) => {
      const currentValue = getLiveValue()
      if (!currentValue || !show) {
        return
      }
      addNotification({
        key: 'escape-again-to-clear',
        text: 'Esc again to clear',
        priority: 'immediate',
        timeoutMs: 1000,
      })
    },
    () => {
      const currentValue = getLiveValue()
      // Remove the "Esc again to clear" notification immediately
      removeNotification('escape-again-to-clear')
      onClearInput?.()
      if (currentValue) {
        // Track double-escape usage for feature discovery
        // Save to history before clearing
        if (currentValue.trim() !== '') {
          addToHistory(currentValue)
        }
        updateRenderedInput('', 0)
        onChange('')
        onOffsetChange(0)
        onHistoryReset?.()
      }
    },
  )

  const handleEmptyCtrlD = useDoublePress(
    show => {
      if (getLiveValue() !== '') {
        return
      }
      onExitMessage?.(show, 'Ctrl-D')
    },
    () => {
      if (getLiveValue() !== '') {
        return
      }
      onExit?.()
    },
  )

  function handleCtrlD(): MaybeCursor {
    const cursor = getLiveCursor()
    if (cursor.text === '') {
      // When input is empty, handle double-press
      handleEmptyCtrlD()
      return cursor
    }
    // When input is not empty, delete forward like iPython
    return cursor.del()
  }

  function killToLineEnd(): Cursor {
    const cursor = getLiveCursor()
    const { cursor: newCursor, killed } = cursor.deleteToLineEnd()
    pushToKillRing(killed, 'append')
    return newCursor
  }

  function killToLineStart(): Cursor {
    const cursor = getLiveCursor()
    const { cursor: newCursor, killed } = cursor.deleteToLineStart()
    pushToKillRing(killed, 'prepend')
    return newCursor
  }

  function killWordBefore(): Cursor {
    const cursor = getLiveCursor()
    const { cursor: newCursor, killed } = cursor.deleteWordBefore()
    pushToKillRing(killed, 'prepend')
    return newCursor
  }

  function yank(): Cursor {
    const cursor = getLiveCursor()
    const text = getLastKill()
    if (text.length > 0) {
      const startOffset = cursor.offset
      const newCursor = cursor.insert(text)
      recordYank(startOffset, text.length)
      return newCursor
    }
    return cursor
  }

  function handleYankPop(): Cursor {
    const cursor = getLiveCursor()
    const popResult = yankPop()
    if (!popResult) {
      return cursor
    }
    const { text, start, length } = popResult
    // Replace the previously yanked text with the new one
    const before = cursor.text.slice(0, start)
    const after = cursor.text.slice(start + length)
    const newText = before + text + after
    const newOffset = start + text.length
    updateYankLength(text.length)
    return Cursor.fromText(newText, columns, newOffset)
  }

  const handleCtrl = mapInput([
    ['a', () => getLiveCursor().startOfLine()],
    ['b', () => getLiveCursor().left()],
    ['c', () => {
      // With active selection: copy to clipboard (fire-and-forget)
      const cursor = getLiveCursor()
      if (cursor.hasSelection()) {
        void copySelection()
        return undefined
      }
      // No selection: normal Ctrl+C behavior
      return handleCtrlC()
    }],
    ['d', handleCtrlD],
    ['e', () => getLiveCursor().endOfLine()],
    ['f', () => getLiveCursor().right()],
    ['h', () => {
      const cursor = getLiveCursor()
      return cursor.deleteTokenBefore() ?? cursor.backspace()
    }],
    ['k', killToLineEnd],
    ['n', () => downOrHistoryDown()],
    ['p', () => upOrHistoryUp()],
    ['u', killToLineStart],
    ['w', killWordBefore],
    ['y', yank],
  ])

  const handleMeta = mapInput([
    ['b', () => getLiveCursor().prevWord()],
    ['f', () => getLiveCursor().nextWord()],
    ['d', () => getLiveCursor().deleteWordAfter()],
    ['y', handleYankPop],
  ])

  function handleEnter(key: Key) {
    const cursor = getLiveCursor()
    const currentValue = getLiveValue()
    if (
      multiline &&
      cursor.offset > 0 &&
      cursor.text[cursor.offset - 1] === '\\'
    ) {
      // Track that the user has used backslash+return
      markBackslashReturnUsed()
      return cursor.backspace().insert('\n')
    }
    // Meta+Enter or Shift+Enter inserts a newline
    if (key.meta || key.shift) {
      return cursor.insert('\n')
    }
    // Apple Terminal doesn't support custom Shift+Enter keybindings,
    // so we use native macOS modifier detection to check if Shift is held
    if (env.terminal === 'Apple_Terminal' && isModifierPressed('shift')) {
      return cursor.insert('\n')
    }
    onSubmit?.(currentValue)
  }

  function upOrHistoryUp() {
    const cursor = getLiveCursor()
    if (disableCursorMovementForUpDownKeys) {
      onHistoryUp?.()
      return cursor
    }
    // Try to move by wrapped lines first
    const cursorUp = cursor.up()
    if (!cursorUp.equals(cursor)) {
      return cursorUp
    }

    // If we can't move by wrapped lines and this is multiline input,
    // try to move by logical lines (to handle paragraph boundaries)
    if (multiline) {
      const cursorUpLogical = cursor.upLogicalLine()
      if (!cursorUpLogical.equals(cursor)) {
        return cursorUpLogical
      }
    }

    // Can't move up at all - trigger history navigation
    onHistoryUp?.()
    return cursor
  }
  function downOrHistoryDown() {
    const cursor = getLiveCursor()
    if (disableCursorMovementForUpDownKeys) {
      onHistoryDown?.()
      return cursor
    }
    // Try to move by wrapped lines first
    const cursorDown = cursor.down()
    if (!cursorDown.equals(cursor)) {
      return cursorDown
    }

    // If we can't move by wrapped lines and this is multiline input,
    // try to move by logical lines (to handle paragraph boundaries)
    if (multiline) {
      const cursorDownLogical = cursor.downLogicalLine()
      if (!cursorDownLogical.equals(cursor)) {
        return cursorDownLogical
      }
    }

    // Can't move down at all - trigger history navigation
    onHistoryDown?.()
    return cursor
  }

  function mapKey(key: Key, cursor: Cursor): InputMapper {
    // ── Selection-aware helpers ────────────────────────────
    const extendOrStart = (getNext: () => Cursor): MaybeCursor => {
      const next = getNext()
      const anchor =
        cursor.hasSelection()
          ? cursor.selection
          : cursor.offset // first press: lock anchor at current pos
      return next.withSelectionAnchor(anchor)
    }
    const moveWithClear = (getNext: () => Cursor): Cursor => {
      const next = getNext()
      return next.clearSelection()
    }
    switch (true) {
      case key.escape:
        return () => {
          if (disableEscapeDoublePress) return cursor
          handleEscape()
          return cursor
        }
      // Shift+Arrow — extend selection
      case key.leftArrow && key.shift:
        return () => extendOrStart(() => cursor.left())
      case key.rightArrow && key.shift:
        return () => extendOrStart(() => cursor.right())
      case key.upArrow && key.shift:
        return () => extendOrStart(() => cursor.up())
      case key.downArrow && key.shift:
        return () => extendOrStart(() => cursor.down())
      case key.home && key.shift:
        return () => extendOrStart(() => cursor.startOfLine())
      case key.end && key.shift:
        return () => extendOrStart(() => cursor.endOfLine())
      // Ctrl+Shift+Arrow — extend by word
      case key.leftArrow && key.shift && (key.ctrl || key.meta || key.fn):
        return () => extendOrStart(() => cursor.prevWord())
      case key.rightArrow && key.shift && (key.ctrl || key.meta || key.fn):
        return () => extendOrStart(() => cursor.nextWord())
      // Non-shift movement — clear selection
      case key.leftArrow && (key.ctrl || key.meta || key.fn):
        return () => moveWithClear(() => cursor.prevWord())
      case key.rightArrow && (key.ctrl || key.meta || key.fn):
        return () => moveWithClear(() => cursor.nextWord())
      case key.backspace:
        // Delete selection if any
        if (cursor.hasSelection()) {
          return () => cursor.deleteSelection().clearSelection()
        }
        return key.meta || key.ctrl
          ? killWordBefore
          : () => cursor.deleteTokenBefore() ?? cursor.backspace()
      case key.delete:
        if (cursor.hasSelection()) {
          return () => cursor.deleteSelection().clearSelection()
        }
        return key.meta ? killToLineEnd : () => cursor.del()
      case key.ctrl:
        return handleCtrl
      case key.home:
        return () => moveWithClear(() => cursor.startOfLine())
      case key.end:
        return () => moveWithClear(() => cursor.endOfLine())
      case key.pageDown:
        // In fullscreen mode, PgUp/PgDn scroll the message viewport instead
        // of moving the cursor — no-op here, ScrollKeybindingHandler handles it.
        if (isFullscreenEnvEnabled()) {
          return NOOP_HANDLER
        }
        return () => cursor.endOfLine()
      case key.pageUp:
        if (isFullscreenEnvEnabled()) {
          return NOOP_HANDLER
        }
        return () => cursor.startOfLine()
      case key.wheelUp:
      case key.wheelDown:
        // Mouse wheel events only exist when fullscreen mouse tracking is on.
        // ScrollKeybindingHandler handles them; no-op here to avoid inserting
        // the raw SGR sequence as text.
        return NOOP_HANDLER
      case key.return:
        // Must come before key.meta so Option+Return inserts newline
        return () => handleEnter(key)
      case key.meta:
        return handleMeta
      case key.tab:
        return () => cursor
      case key.upArrow && !key.shift:
        return () => {
          const c = upOrHistoryUp()
          return c ? c.clearSelection() : undefined
        }
      case key.downArrow && !key.shift:
        return () => {
          const c = downOrHistoryDown()
          return c ? c.clearSelection() : undefined
        }
      case key.leftArrow:
        return () => moveWithClear(() => cursor.left())
      case key.rightArrow:
        return () => moveWithClear(() => cursor.right())
      default: {
        return function (input: string) {
          switch (true) {
            // Home key
            case input === '\x1b[H' || input === '\x1b[1~':
              return cursor.startOfLine()
            // End key
            case input === '\x1b[F' || input === '\x1b[4~':
              return cursor.endOfLine()
            default: {
              // Trailing \r after text is SSH-coalesced Enter ("o\r") —
              // strip it so the Enter isn't inserted as content. Lone \r
              // here is Alt+Enter leaking through (META_KEY_CODE_RE doesn't
              // match \x1b\r) — leave it for the \r→\n below. Embedded \r
              // is multi-line paste from a terminal without bracketed
              // paste — convert to \n. Backslash+\r is a stale VS Code
              // Shift+Enter binding (pre-#8991 /terminal-setup wrote
              // args.text "\\\r\n" to keybindings.json); keep the \r so
              // it becomes \n below (anthropics/claude-code#31316).
              const text = stripAnsi(input)
                // eslint-disable-next-line custom-rules/no-lookbehind-regex -- .replace(re, str) on 1-2 char keystrokes: no-match returns same string (Object.is), regex never runs
                .replace(/(?<=[^\\\r\n])\r$/, '')
                .replace(/\r/g, '\n')
              // If there's an active selection, replace it with the new text
              const base =
                cursor.hasSelection()
                  ? cursor.deleteSelection()
                  : cursor
              if (base.isAtStart() && isInputModeCharacter(input)) {
                return base.insert(text).left().clearSelection()
              }
              return base.insert(text).clearSelection()
            }
          }
        }
      }
    }
  }

  // Check if this is a kill command (Ctrl+K, Ctrl+U, Ctrl+W, or Meta+Backspace/Delete)
  function isKillKey(key: Key, input: string): boolean {
    if (key.ctrl && (input === 'k' || input === 'u' || input === 'w')) {
      return true
    }
    if (key.meta && (key.backspace || key.delete)) {
      return true
    }
    return false
  }

  // Check if this is a yank command (Ctrl+Y or Alt+Y)
  function isYankKey(key: Key, input: string): boolean {
    return (key.ctrl || key.meta) && input === 'y'
  }

  function onInput(input: string, key: Key): void {
    const currentCursor = getLiveCursor()
    // Note: Image paste shortcut (chat:imagePaste) is handled via useKeybindings in PromptInput

    // Apply filter if provided
    const filteredInput = inputFilter ? inputFilter(input, key) : input

    // If the input was filtered out, do nothing
    if (filteredInput === '' && input !== '') {
      return
    }

    // Fix Issue #1853: Filter DEL characters that interfere with backspace in SSH/tmux
    // In SSH/tmux environments, backspace generates both key events and raw DEL chars
    if (!key.backspace && !key.delete && input.includes('\x7f')) {
      const delCount = (input.match(/\x7f/g) || []).length

      // Apply all DEL characters as backspace operations synchronously
      // Try to delete tokens first, fall back to character backspace
      let nextCursor = currentCursor
      for (let i = 0; i < delCount; i++) {
        nextCursor =
          nextCursor.deleteTokenBefore() ?? nextCursor.backspace()
      }

      // Update state once with the final result
      if (!currentCursor.equals(nextCursor)) {
        setValue(nextCursor.text, nextCursor.offset)
      }
      resetKillAccumulation()
      resetYankState()
      return
    }

    // Reset kill accumulation for non-kill keys
    if (!isKillKey(key, filteredInput)) {
      resetKillAccumulation()
    }

    // Reset yank state for non-yank keys (breaks yank-pop chain)
    if (!isYankKey(key, filteredInput)) {
      resetYankState()
    }

    const nextCursor = mapKey(key, currentCursor)(filteredInput)
    if (nextCursor) {
      if (
        !currentCursor.equals(nextCursor) ||
        currentCursor.selection !== nextCursor.selection
      ) {
        setValue(nextCursor.text, nextCursor.offset, nextCursor.selection)
      }
      // SSH-coalesced Enter: on slow links, "o" + Enter can arrive as one
      // chunk "o\r". parseKeypress only matches s === '\r', so it hit the
      // default handler above (which stripped the trailing \r). Text with
      // exactly one trailing \r is coalesced Enter; lone \r is Alt+Enter
      // (newline); embedded \r is multi-line paste.
      if (
        filteredInput.length > 1 &&
        filteredInput.endsWith('\r') &&
        !filteredInput.slice(0, -1).includes('\r') &&
        // Backslash+CR is a stale VS Code Shift+Enter binding, not
        // coalesced Enter. See default handler above.
        filteredInput[filteredInput.length - 2] !== '\\'
      ) {
        onSubmit?.(nextCursor.text)
      }
    }
  }

  // Prepare ghost text for rendering - validate insertPosition matches current
  // cursor offset to prevent stale ghost text from a previous keystroke causing
  // a one-frame jitter (ghost text state is updated via useEffect after render)
  const ghostTextForRender =
    inlineGhostText && dim && inlineGhostText.insertPosition === offset
      ? { text: inlineGhostText.text, dim }
      : undefined

  const cursorPos = cursor.getPosition()

  // ── Ink mouse selection → Cursor sync (座標直変換アプローチ) ──
  // Ink の画面レベル選択（マウスドラッグ）を検知し、anchor/focus の
  // 絶対画面座標を Box の相対座標に変換 → offsetAt() で文字列オフセットに
  // → Cursor.selection に反映する。
  // テキストマッチではなく座標変換なので、複数一致/折り返し/全角問題がない。
  const inkSel = useSelection()
  useEffect(() => {
    if (!focus) return
    let prevDragging = false
    const unsub = inkSel.subscribe(() => {
      const state = inkSel.getState()
      if (!state) return
      const isDragging = state.isDragging
      const dragJustEnded = !isDragging && prevDragging
      prevDragging = isDragging

      if (!dragJustEnded) return
      if (!state.anchor || !state.focus) return

      // 画面座標 → 入力 Box 相対座標
      const box = selectionSyncRef?.current
      if (!box) return

      const relAnchorRow = state.anchor.row - box.y
      const relAnchorCol = state.anchor.col - box.x
      const relFocusRow = state.focus.row - box.y
      const relFocusCol = state.focus.col - box.x

      // viewport scroll オフセットを考慮して絶対行番号を計算
      const inputValue = liveValueRef.current
      const tempCursor = Cursor.fromText(inputValue, columns, liveOffsetRef.current)
      const viewportStartLine = tempCursor.getViewportStartLine(maxVisibleLines)

      const anchorLine = relAnchorRow + viewportStartLine
      const focusLine = relFocusRow + viewportStartLine

      // 画面座標 → 文字列オフセット変換（getOffsetFromPosition が
      // 表示幅→文字列インデックス、行頭空白、CJK を全て考慮する）
      const anchorOffset = tempCursor.measuredText.getOffsetFromPosition({
        line: anchorLine,
        column: relAnchorCol,
      })
      const focusOffset = tempCursor.measuredText.getOffsetFromPosition({
        line: focusLine,
        column: relFocusCol,
      })

      if (anchorOffset !== focusOffset) {
        updateRenderedInput(inputValue, focusOffset, anchorOffset)
        onOffsetChange?.(focusOffset)
      }

      // Ink の画面上のハイライトをクリア（以降は Cursor の反転表示に任せる）
      inkSel.clearSelection()
    })
    return unsub
  }, [focus, inkSel, selectionSyncRef, columns, maxVisibleLines, onOffsetChange])

  return {
    onInput,
    value,
    renderedValue: cursor.render(
      cursorChar,
      mask,
      invert,
      ghostTextForRender,
      maxVisibleLines,
    ),
    offset,
    setValue,
    setOffset,
    cursorLine: cursorPos.line - cursor.getViewportStartLine(maxVisibleLines),
    cursorColumn: cursorPos.column,
    viewportCharOffset: cursor.getViewportCharOffset(maxVisibleLines),
    viewportCharEnd: cursor.getViewportCharEnd(maxVisibleLines),
  }
}
