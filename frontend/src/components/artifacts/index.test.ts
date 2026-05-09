import { describe, expect, it } from 'vitest'
import { AudioScriptViewer, DataTableViewer, VideoScriptViewer, parseArtifactContent } from './index'

describe('artifacts index barrel', () => {
  it('re-exports viewer components and parser utilities', () => {
    expect(typeof AudioScriptViewer).toBe('function')
    expect(typeof DataTableViewer).toBe('function')
    expect(typeof VideoScriptViewer).toBe('function')

    const parsed = parseArtifactContent('audio_script', JSON.stringify({
      title: 'Audio',
      segments: [
        { time: '00:00', type: 'narracao', text: 'Trecho inicial.' },
      ],
    }))

    expect(parsed.kind).toBe('audio_script')
  })
})