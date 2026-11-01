"""Build portable SVG logos with outlined lettering from the bundled OFL font."""
import json
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen

ROOT = Path(__file__).resolve().parents[1]
colors = json.loads((ROOT / 'brand/tokens.json').read_text())['colors']
font = instantiateVariableFont(TTFont(ROOT / 'brand/fonts/Manrope.ttf'), {'wght': 750}, inplace=True)
glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
scale = 94 / font['head'].unitsPerEm
x = sum((font['hmtx'][cmap[ord(char)]][0] - 25) * scale for char in 'RefMatch')

def mark(color):
    return f'''<g fill="none" stroke="{color}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">
    <path d="M32 10H26C16.06 10 8 18.06 8 28V68C8 77.94 16.06 86 26 86H32"/>
    <path d="M64 10H70C79.94 10 88 18.06 88 28V44"/>
    <path d="M35 56L48 69L82 35"/>
    </g><circle cx="48" cy="30" r="7" fill="{color}"/>'''

directory = ROOT / 'brand/logos'
directory.mkdir(parents=True, exist_ok=True)
for variant, icon_color, text_color in [('primary', colors['mint'], colors['chalk']), ('dark', colors['ink'], colors['ink']), ('white', '#FFFFFF', '#FFFFFF'), ('black', '#000000', '#000000')]:
    # Glyph x positions are already scaled; each glyph's outlines get a local font-unit scale.
    outlined = []
    pos = 0
    for char in 'RefMatch':
        name = cmap[ord(char)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(pen)
        outlined.append(f'<path transform="translate({pos:.3f} 0) scale({scale:.8f} {-scale:.8f})" d="{pen.getCommands()}"/>')
        pos += (font['hmtx'][name][0] - 25) * scale
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {148 + x:.2f} 128" role="img" aria-labelledby="title desc">
    <title id="title">RefMatch</title><desc id="desc">A pitch outline frames a referee and a fit check, alongside the RefMatch wordmark.</desc>
    <g transform="translate(8 16)">{mark(icon_color)}</g>
    <g transform="translate(135 97)" fill="{text_color}">{''.join(outlined)}</g></svg>'''
    (directory / f'refmatch-{variant}.svg').write_text(svg)
    (directory / f'mark-{variant}.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="RefMatch">{mark(icon_color)}</svg>')
(directory / 'app-icon.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="RefMatch"><rect width="96" height="96" rx="22" fill="{colors["ink"]}"/><g transform="translate(12 12) scale(.75)">{mark(colors["mint"])}</g></svg>')
print('Built four outlined wordmarks, four standalone marks, and an app icon.')
