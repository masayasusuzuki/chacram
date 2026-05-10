import { GoogleGenAI } from '@google/genai'
import { getModel } from '../../integrations/index.js'
import { logForDebugging } from '../../utils/debug.js'
import type { AssistantMessage, UserMessage } from '../../types/message.js'

// Anthropic-native media block format
type AnthropicMediaBlock =
  | { type: 'image'; source: { type: string; media_type: string; data: string } }
  | { type: 'document'; source: { type: string; media_type: string; data: string } }

// OpenAI-compatible image block format (used by DeepSeek, etc.)
type OpenAIImageBlock = {
  type: 'image_url'
  image_url: { url: string }
}

type MediaBlock = AnthropicMediaBlock | OpenAIImageBlock

interface MediaPosition {
  messageIndex: number
  blockIndex: number
  mediaBlock: MediaBlock
  isNested: boolean
  parentBlockIndex?: number
}

const VISION_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
const MAX_CONCURRENT = 5

const VISION_PROMPT = `Please provide a thorough and detailed description of this image or document. Include:
- All visible text, numbers, and labels
- Layout and structure (tables, columns, sections)
- Colors, shapes, and visual elements
- Charts, graphs, or diagrams with their data
- UI elements if it's a screenshot
- Any key information or context that would be apparent to a human viewer

Be comprehensive — your description will be used by another AI to understand this content without seeing it.`

/**
 * When the current model does not support vision (supportsVision: false),
 * proxy image/document blocks through Google Gemini to convert them
 * into text descriptions before the non-vision model sees them.
 *
 * Must be called AFTER stripExcessMediaItems so we process at most
 * API_MAX_MEDIA_PER_REQUEST items.
 */
export async function proxyMediaToVisionModel(
  messagesForAPI: (UserMessage | AssistantMessage)[],
  modelId: string,
  signal?: AbortSignal,
): Promise<(UserMessage | AssistantMessage)[]> {
  // STEP 1: Early return if model supports vision or is unrecognized
  const modelDescriptor = getModel(modelId)
  if (
    !modelDescriptor ||
    modelDescriptor.capabilities.supportsVision !== false
  ) {
    return messagesForAPI
  }

  // STEP 2: Resolve authentication — GEMINI_API_KEY required
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    const errMsg = '[Vision proxy error: GEMINI_API_KEY が未設定です。.env に GEMINI_API_KEY=... を設定してください。取得元: https://aistudio.google.com/app/apikey]'
    logForDebugging(`Vision proxy: ${errMsg}`)
    throw new Error(errMsg)
  }

  // STEP 3: Walk messages and collect all media block positions
  const mediaPositions = collectMediaPositions(messagesForAPI)
  if (mediaPositions.length === 0) return messagesForAPI

  logForDebugging(
    `Vision proxy: Converting ${mediaPositions.length} media block(s) to text via Gemini ${VISION_MODEL}`,
  )

  // STEP 4: Create Google GenAI client
  const visionClient = new GoogleGenAI({ apiKey })

  // STEP 5: Process media blocks in parallel batches
  const descriptions = await describeAllMedia(
    visionClient,
    mediaPositions,
    signal,
  )

  // STEP 6: Build new messages with media replaced by descriptions
  return applyDescriptions(messagesForAPI, mediaPositions, descriptions)
}

/**
 * Check if a content block is a media type (image/document/image_url).
 */
function isMediaBlock(block: any): boolean {
  return (
    block.type === 'image' ||
    block.type === 'document' ||
    block.type === 'image_url'
  )
}

/**
 * Get a human-readable label for a media block type.
 */
function mediaTypeLabel(block: MediaBlock): string {
  if (block.type === 'image_url') return 'image_url'
  return block.type
}

/**
 * Extract base64 data and mime type from any media block format.
 * Returns null if the block can't be converted to inline data.
 */
function extractInlineData(block: MediaBlock): { mimeType: string; data: string } | null {
  if (block.type === 'image') {
    return {
      mimeType: block.source.media_type,
      data: block.source.data,
    }
  }
  if (block.type === 'document') {
    return {
      mimeType: block.source.media_type,
      data: block.source.data,
    }
  }
  // OpenAI-compatible image_url
  if (block.type === 'image_url') {
    const url = block.image_url.url
    const match = url.match(/^data:([^;]+);base64,(.+)$/)
    if (match) {
      return {
        mimeType: match[1],
        data: match[2],
      }
    }
  }
  return null
}

/**
 * Collect positions of all image/document blocks in messages, including
 * those nested inside tool_result content arrays.
 * Supports both Anthropic format (image/document) and OpenAI-compatible
 * format (image_url).
 */
function collectMediaPositions(
  messages: (UserMessage | AssistantMessage)[],
): MediaPosition[] {
  const positions: MediaPosition[] = []

  for (let mi = 0; mi < messages.length; mi++) {
    const msg = messages[mi]
    if (!msg || msg.type !== 'user') continue

    const content = msg.message?.content
    if (!Array.isArray(content)) continue

    for (let bi = 0; bi < content.length; bi++) {
      const block = content[bi]
      if (!block) continue

      // Top-level image/document/image_url
      if (isMediaBlock(block)) {
        positions.push({
          messageIndex: mi,
          blockIndex: bi,
          mediaBlock: block as MediaBlock,
          isNested: false,
        })
      }

      // Nested inside tool_result
      if (block.type === 'tool_result' && Array.isArray(block.content)) {
        for (let ni = 0; ni < block.content.length; ni++) {
          const nested = block.content[ni]
          if (isMediaBlock(nested)) {
            positions.push({
              messageIndex: mi,
              blockIndex: ni,
              mediaBlock: nested as MediaBlock,
              isNested: true,
              parentBlockIndex: bi,
            })
          }
        }
      }
    }
  }

  return positions
}

/**
 * Call Gemini for each media block, processing in parallel
 * batches of MAX_CONCURRENT. Returns a description string for each block
 * (same length as positions), falling back to [image]/[document] stubs
 * on any failure.
 */
async function describeAllMedia(
  client: GoogleGenAI,
  positions: MediaPosition[],
  signal?: AbortSignal,
): Promise<string[]> {
  const descriptions: string[] = new Array(positions.length).fill('')

  for (
    let batchStart = 0;
    batchStart < positions.length;
    batchStart += MAX_CONCURRENT
  ) {
    const batchEnd = Math.min(batchStart + MAX_CONCURRENT, positions.length)
    const batch = positions.slice(batchStart, batchEnd)

    const batchPromises = batch.map(async (pos, batchIdx) => {
      const globalIdx = batchStart + batchIdx
      try {
        const text = await describeMediaBlock(client, pos)
        if (text) {
          const label = mediaTypeLabel(pos.mediaBlock)
          logForDebugging(
            `Vision proxy: ${label} described (${text.length} chars)`,
          )
        }
        return { globalIdx, text }
      } catch (err) {
        logForDebugging(
          `Vision proxy: Failed to describe ${mediaTypeLabel(pos.mediaBlock)} — ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
        return {
          globalIdx,
          text:
            `[Vision proxy error: Gemini API が ${mediaTypeLabel(pos.mediaBlock)} の解析に失敗しました — ${
              err instanceof Error ? err.message : String(err)
            }]`,
        }
      }
    })

    const results = await Promise.allSettled(batchPromises)
    for (const result of results) {
      if (result.status === 'fulfilled') {
        descriptions[result.value.globalIdx] = result.value.text
      }
      if (result.status === 'rejected') {
        logForDebugging(
          `Vision proxy: Unhandled rejection: ${result.reason}`,
        )
      }
    }
  }

  return descriptions
}

/**
 * Send a single media block to Gemini for description.
 */
async function describeMediaBlock(
  client: GoogleGenAI,
  pos: MediaPosition,
): Promise<string> {
  const inlineData = extractInlineData(pos.mediaBlock)
  if (!inlineData) {
    throw new Error(
      `Cannot extract inline data from ${mediaTypeLabel(pos.mediaBlock)}`,
    )
  }

  const response = await client.models.generateContent({
    model: VISION_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { text: VISION_PROMPT },
          { inlineData: { mimeType: inlineData.mimeType, data: inlineData.data } },
        ],
      },
    ],
  })

  const text = response.text
  if (!text) {
    throw new Error(`No text in vision response for ${mediaTypeLabel(pos.mediaBlock)}`)
  }
  return text
}

/**
 * Build new messages array with media blocks replaced by text descriptions.
 */
function applyDescriptions(
  messages: (UserMessage | AssistantMessage)[],
  positions: MediaPosition[],
  descriptions: string[],
): (UserMessage | AssistantMessage)[] {
  return messages.map((msg, mi) => {
    if (msg.type !== 'user') return msg

    const content = msg.message?.content
    if (!Array.isArray(content)) return msg

    // Find which positions affect this message
    const msgPositions = positions
      .map((pos, idx) => ({ ...pos, descIdx: idx }))
      .filter(p => p.messageIndex === mi)

    if (msgPositions.length === 0) return msg

    // Build new content array
    const newContent = content.map((block: any, bi: number) => {
      // Replace top-level media blocks
      const topMatch = msgPositions.find(
        p => !p.isNested && p.blockIndex === bi,
      )
      if (topMatch) {
        return {
          type: 'text' as const,
          text: descriptions[topMatch.descIdx] ?? '[image]',
        }
      }

      // Replace nested media inside tool_result
      if (block.type === 'tool_result' && Array.isArray(block.content)) {
        const nestedMatches = msgPositions.filter(
          p => p.isNested && p.parentBlockIndex === bi,
        )
        if (nestedMatches.length === 0) return block

        const newToolContent = block.content.map(
          (nested: any, ni: number) => {
            const match = nestedMatches.find(p => p.blockIndex === ni)
            if (match) {
              return {
                type: 'text' as const,
                text:
                  descriptions[match.descIdx] ?? '[image]',
              }
            }
            return nested
          },
        )

        return { ...block, content: newToolContent }
      }

      return block
    })

    return {
      ...msg,
      message: { ...msg.message, content: newContent },
    } as typeof msg
  }) as (UserMessage | AssistantMessage)[]
}

/**
 * Fallback used when GEMINI_API_KEY is not configured.
 * Replaces image/document/image_url blocks with plain text stubs.
 */
function replaceMediaWithTextStubs(
  messages: (UserMessage | AssistantMessage)[],
): (UserMessage | AssistantMessage)[] {
  return messages.map(msg => {
    if (msg.type !== 'user') return msg

    const content = msg.message?.content
    if (!Array.isArray(content)) return msg

    const newContent = content.map((block: any) => {
      if (block.type === 'image' || block.type === 'image_url') {
        return { type: 'text' as const, text: '[image]' }
      }
      if (block.type === 'document') {
        return { type: 'text' as const, text: '[document]' }
      }
      if (block.type === 'tool_result' && Array.isArray(block.content)) {
        return {
          ...block,
          content: block.content.map((nested: any) => {
            if (nested.type === 'image' || nested.type === 'image_url') {
              return { type: 'text' as const, text: '[image]' }
            }
            if (nested.type === 'document') {
              return { type: 'text' as const, text: '[document]' }
            }
            return nested
          }),
        }
      }
      return block
    })

    return {
      ...msg,
      message: { ...msg.message, content: newContent },
    } as typeof msg
  }) as (UserMessage | AssistantMessage)[]
}
