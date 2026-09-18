import { describe, expect, it } from 'vitest'
import { compareVersions, pickUpdate, releaseNotesText, type Release } from './updates'

const DIGEST = `sha256:${'ab'.repeat(32)}`

function release(tag: string, extra: Partial<Release> = {}): Release {
  const v = tag.replace(/^v/, '')
  return {
    tag_name: tag,
    assets: [
      { name: `DaProdFinanza-Setup-${v}.exe`, size: 10, browser_download_url: 'https://x/setup', digest: DIGEST },
      { name: `DaProdFinanza-${v}-portable.exe`, size: 10, browser_download_url: 'https://x/portable', digest: DIGEST },
      { name: `DaProdFinanza-Demo-${v}-portable.exe`, size: 10, browser_download_url: 'https://x/demo', digest: DIGEST }
    ],
    ...extra
  }
}

describe('compareVersions', () => {
  it('confronta numero per numero, non come testo', () => {
    expect(compareVersions('0.0.10', '0.0.9')).toBeGreaterThan(0)
    expect(compareVersions('v0.1.0', '0.0.99')).toBeGreaterThan(0)
    expect(compareVersions('1.2.3', 'v1.2.3')).toBe(0)
    expect(compareVersions('0.0.6', '0.0.7')).toBeLessThan(0)
  })

  it('rifiuta versioni che non sono a tre numeri', () => {
    expect(() => compareVersions('0.1', '0.0.1')).toThrow()
  })
})

describe('pickUpdate', () => {
  it('a ogni copia il suo eseguibile', () => {
    const r = release('v0.1.0')
    expect(pickUpdate(r, 'installer', '0.0.6')?.asset.name).toBe('DaProdFinanza-Setup-0.1.0.exe')
    expect(pickUpdate(r, 'portable', '0.0.6')?.asset.name).toBe('DaProdFinanza-0.1.0-portable.exe')
    expect(pickUpdate(r, 'demo', '0.0.6')?.asset.name).toBe('DaProdFinanza-Demo-0.1.0-portable.exe')
    expect(pickUpdate(r, 'dev', '0.0.6')).toBeNull()
  })

  it('il portable vero non prende mai la demo', () => {
    const r = release('v0.1.0')
    r.assets = r.assets.filter((a) => a.name.includes('Demo'))
    expect(pickUpdate(r, 'portable', '0.0.6')).toBeNull()
  })

  it('niente se la versione non è più nuova', () => {
    expect(pickUpdate(release('v0.0.6'), 'portable', '0.0.6')).toBeNull()
    expect(pickUpdate(release('v0.0.5'), 'portable', '0.0.6')).toBeNull()
  })

  it('niente per bozze e pre-release', () => {
    expect(pickUpdate(release('v0.1.0', { draft: true }), 'portable', '0.0.6')).toBeNull()
    expect(pickUpdate(release('v0.1.0', { prerelease: true }), 'portable', '0.0.6')).toBeNull()
  })

  it('niente senza impronta verificabile', () => {
    const r = release('v0.1.0')
    for (const a of r.assets) a.digest = null
    expect(pickUpdate(r, 'installer', '0.0.6')).toBeNull()
  })

  it('il file deve avere la versione del tag', () => {
    const r = release('v0.1.0')
    r.assets = [{ ...r.assets[1], name: 'DaProdFinanza-0.0.9-portable.exe' }]
    expect(pickUpdate(r, 'portable', '0.0.6')).toBeNull()
  })

  it('restituisce versione e impronta in minuscolo', () => {
    const r = release('v0.1.0')
    r.assets[0].digest = `sha256:${'AB'.repeat(32)}`
    expect(pickUpdate(r, 'installer', '0.0.6')).toMatchObject({ version: '0.1.0', sha256: 'ab'.repeat(32) })
  })
})

describe('releaseNotesText', () => {
  it('toglie il Markdown e le tabelle', () => {
    const text = releaseNotesText('## Novità\n\n- **Report PDF** con `grafici`\n| a | b |\n|---|---|\nVedi [qui](https://x).')
    expect(text).toBe('Novità\n\n• Report PDF con grafici\nVedi qui.')
  })
})

describe('pickUpdate per il Mac', () => {
  it('prende il DMG della demo, non gli exe', () => {
    const r = release('v1.1.0')
    r.assets.push({ name: 'DaProdFinanza-Demo-1.1.0-mac-arm64.dmg', size: 10, browser_download_url: 'https://x/dmg', digest: DIGEST })
    expect(pickUpdate(r, 'mac', '1.0.0')?.asset.name).toBe('DaProdFinanza-Demo-1.1.0-mac-arm64.dmg')
    expect(pickUpdate(release('v1.1.0'), 'mac', '1.0.0')).toBeNull()
  })
})
