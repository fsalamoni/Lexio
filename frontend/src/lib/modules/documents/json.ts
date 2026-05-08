const DEFAULT_MAX_JSON_PAYLOAD_CHARS = 60_000

export function extractJsonPayload(raw: string, maxChars = DEFAULT_MAX_JSON_PAYLOAD_CHARS): string {
  let jsonStr = raw.trim()
  if (jsonStr.length > maxChars) {
    jsonStr = jsonStr.slice(0, maxChars)
  }

  const fenceStart = jsonStr.indexOf('```')
  if (fenceStart >= 0) {
    const afterFence = jsonStr.indexOf('\n', fenceStart)
    const contentStart = afterFence >= 0 ? afterFence + 1 : fenceStart + 3
    const fenceEnd = jsonStr.indexOf('```', contentStart)
    if (fenceEnd > contentStart) {
      jsonStr = jsonStr.slice(contentStart, fenceEnd).trim()
    } else {
      jsonStr = jsonStr.slice(contentStart).trim()
    }
  }

  const objectStart = jsonStr.indexOf('{')
  const objectEnd = jsonStr.lastIndexOf('}')
  if (objectStart >= 0 && objectEnd > objectStart) {
    jsonStr = jsonStr.slice(objectStart, objectEnd + 1)
  }

  return jsonStr
}
