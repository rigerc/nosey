# nosey brand kit

`:^) nosey` — sniffs your workspace, suggests agent skills.

All SVGs have the type converted to outlines, so they render the same everywhere with no font installed.

## Folders

| Folder | What's inside |
|---|---|
| `svg/logo` | Horizontal lockup (primary logo), 7 color variants |
| `svg/mark` | The `:^)` emoticon alone, 7 color variants |
| `svg/wordmark` | `nosey` alone, 5 color variants |
| `svg/icon` | App icon, rounded and full-bleed square |
| `svg/social` | 1280x640 social / GitHub preview card |
| `png/...` | Hi-res renders of everything above (see sizes below) |
| `png/favicon` | `favicon.ico`, 16/32/48 PNG, `favicon.svg` |
| `palette` | `colors.css`, `colors.json`, swatch sheet (SVG + PNG) |
| `extras` | `nosey-banner.txt` for CLI splash output |

## Variant names

- `for-dark`: transparent, for dark backgrounds (parchment + amber nose)
- `for-light`: transparent, for light backgrounds (ground + burnt nose)
- `mono-ground` / `mono-parchment`: one color, transparent
- `on-ground` / `on-parchment` / `on-nose`: baked-in background with correct clear space

## PNG sizes

- Logo and wordmark: 1000, 2000, 4000 px wide
- Mark: 512, 1024, 2048 px wide
- App icon rounded: 1024, 512, 256. Square (full-bleed, for app stores): 1024, 512, 192, 180
- Avatar: 500, 1000. Social preview: 1280, 2560 px wide

## Colors

| Name | Hex | Use |
|---|---|---|
| Ground | `#14100A` | Dark ground, terminals, code |
| Surface | `#231C10` | Cards, code blocks |
| Parchment | `#F5E6C8` | Text on dark, light ground |
| Nose | `#FFB000` | The accent. One per screen |
| Burnt | `#8A5A00` | Accent text on light |
| Umber | `#6B5A38` | Secondary text on light |
| Dim | `#A08A60` | Secondary text on dark |
| Moss | `#A3D977` | Success, on dark only |

## Rules

- Type: JetBrains Mono (Bold 700 for headings, Regular 400 for body). Free from jetbrains.com/lp/mono.
- Clear space: the height of the "n" on every side of the lockup.
- Minimum size: 16 px type size. Below that, use the mark alone.
- On light backgrounds the nose is Burnt, never Nose. Amber on parchment is too faint.
- Don't recolor outside the palette, swap the emoticon, stretch, outline, or add a second accent.
