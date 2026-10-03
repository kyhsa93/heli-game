import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import strings from './content/strings.ko.json'

const NAME = '카르다 전선'
const TAGLINE = '봇과 함께 싸우는 점령전'
const root = resolve(__dirname, '..')
const html = readFileSync(resolve(root, 'index.html'), 'utf8')
const manifest = JSON.parse(readFileSync(resolve(root, 'public/manifest.webmanifest'), 'utf8')) as Record<string, string>

describe('the game is called by one name everywhere a player meets it', () => {
  it('in the tab and on the home screen', () => {
    expect(html).toContain(`<title>${NAME}</title>`)
    expect(html).toContain(`<meta name="apple-mobile-web-app-title" content="${NAME}">`)
    expect(manifest.name).toBe(NAME)
    expect(manifest.short_name).toBe(NAME)
    expect(manifest.description).toBe(TAGLINE)
  })

  it('on the title screen', () => {
    expect(strings.title.name).toBe(NAME)
    expect(strings.title.subtitle).toBe(TAGLINE)
  })

  it('and never by the old names at the door', () => {
    const door = [html, JSON.stringify(manifest), JSON.stringify(strings.title)].join('\n')
    expect(door).not.toContain('헬기 조종')
    expect(door).not.toContain('아파치')
    expect(door).not.toContain('AH-64')
  })
})
