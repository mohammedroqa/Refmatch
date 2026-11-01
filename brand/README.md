# RefMatch visual identity

**The right fit. Before kickoff.**

The identity brings together football pitch geometry, clear match data, and a human official. Midnight blue provides the foundation; bright mint marks the recommendation. The accompanying film shows how RefMatch profiles a fixture, ranks eligible referees, and explains the fit.

## Explore the identity

From the repository root, run `npm run preview`, then open **http://127.0.0.1:4173/brand/**. The preview includes dark/light themes, downloadable logos, colour swatches, typography, a sample recommendation card, and the finished film. The page and fonts work locally without external requests.

## Logo

The **Matchmark** combines three elements: an open pitch outline, a central dot representing the referee, and an ascending check representing fit. The wordmark uses custom-spaced Manrope lettering converted to vector paths, so SVG rendering does not depend on installed fonts.

| Asset | Use |
| --- | --- |
| [Primary wordmark](logos/refmatch-primary.svg) | Mint symbol and chalk lettering on midnight backgrounds |
| [Dark wordmark](logos/refmatch-dark.svg) | Midnight on mint, chalk, or other light backgrounds |
| [White wordmark](logos/refmatch-white.svg) | Single-colour use on dark backgrounds |
| [Black wordmark](logos/refmatch-black.svg) | Single-colour print and light backgrounds |
| [Standalone mark](logos/mark-primary.svg) | App icons, avatars, and compact placements |
| [App icon](logos/app-icon.svg) | Mint mark on a midnight tile for favicons and app launchers |

Wordmarks and standalone marks are available as portable SVGs and transparent PNGs. PNG wordmarks are 2000 px wide; standalone marks are 1024 × 1024 px. The app icon is also supplied in both formats with its midnight background included.

Keep clear space of at least one quarter of the mark's height around the logo. Use the wordmark at 150 px wide or larger and the standalone mark at 24 px or larger. Preserve the aspect ratio and use the supplied colour variants.

## Palette

| Name | Hex | Role |
| --- | --- | --- |
| Midnight | `#081C26` | Main background and text on light surfaces |
| Deep | `#05131B` | Recessed surfaces and video surround |
| Surface | `#102B36` | Cards and information panels |
| Match Mint | `#B6F36A` | Primary actions, selected candidates, and brand reveals |
| Chalk | `#F3F5EF` | Main text on dark surfaces |
| Signal Teal | `#65D8CA` | Supporting data and law context |
| Muted | `#AAC1C8` | Secondary text on dark surfaces |
| Caution | `#F0C786` | Rest warnings and risk notes |

Use midnight text on mint, teal, and caution surfaces. Light mode uses its own darker secondary text and focus colours. Meaning is also communicated through labels and icons.

## Theme code

[theme.css](theme.css) supplies CSS custom properties, local font declarations, base typography, focus styles, reduced-motion support, buttons, cards, chips, and scores. [tokens.json](tokens.json) provides the palette, typography, spacing, radii, motion values, and video format as portable data. The film reads its palette directly from this JSON.

```html
<link rel="stylesheet" href="brand/theme.css">

<article class="rm-card">
  <span class="rm-chip rm-chip--accent">Best fit</span>
  <h2>Referee A</h2>
  <p>Illustrative synthetic recommendation.</p>
  <button class="rm-button">Explore the reasons</button>
</article>
```

Dark mode is the default. Apply `data-theme="light"` to the root element for light mode. Component dimensions are controlled by the `--rm-space-*`, `--rm-radius-*`, and typography variables. When changing brand colours, update both the palette in `tokens.json` and its corresponding CSS variables.

## Typography

- **Space Grotesk:** headlines, numerical scores, and film titles. Use medium and semibold weights with close tracking at large sizes.
- **Manrope:** interface copy, explanations, labels, and the outlined wordmark. Use regular through bold weights.

Both fonts are bundled under the SIL Open Font License. Source files and license notices are included in [fonts/](fonts/). Sources: [Space Grotesk](https://github.com/google/fonts/tree/main/ofl/spacegrotesk) and [Manrope](https://github.com/google/fonts/tree/main/ofl/manrope).

## Motion and sound

Movement follows a deliberate sequence: input, selection, explanation, identity. Use smooth deceleration, restrained scans, staggered score reveals, and a mint iris transition. Keep the background calm so the recommendation remains readable.

The film has an original synthesised stereo soundtrack: a soft harmonic bed, restrained pulses, scene transitions, and a three-note closing signature. No third-party recordings or stock footage are used. Playback begins only when requested.

All match data, scores, and referee profiles in the visual examples are illustrative and synthetic. The sample 87%, 81%, and 76% fit scores are presentation values from the specification, not calculated outputs from an implemented scoring engine.

## Rebuild the assets

The repository includes finished assets; rebuilding is optional.

For logo SVGs, install the Python dependency in an isolated environment:

```sh
uv venv .venv
uv pip install --python .venv/bin/python -r scripts/requirements.txt
npm run assets
```

Then run `npm run render:stills` to refresh PNG logos, scene stills, and the poster. See [video/README.md](../video/README.md) for renderer prerequisites and full video export.
