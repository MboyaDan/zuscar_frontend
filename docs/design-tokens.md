# Design token contrast check (Stage 4)

WCAG 2.x contrast ratios computed with a script from the token hex values in `frontend/app/globals.css` (2026-10-13). AA needs 4.5:1 for normal text and 3:1 for large text and UI components. This is arithmetic on the brief's colours, not a visual or assistive-technology test.

| Pair | Foreground | Background | Ratio | AA normal text |
|---|---|---|---|---|
| Body text on page | slate | cream | 12.19:1 | pass |
| Cream text on header | cream | midnight | 16.09:1 | pass |
| Saffron on Midnight (text or fill) | saffron | midnight | 9.79:1 | pass |
| Midnight text on Saffron fill (banner, chips) | midnight | saffron | 9.79:1 | pass |
| White text on Teal button | white | teal | 5.47:1 | pass |
| Teal link text on Cream | teal | cream | 5.08:1 | pass |
| White text on Ember | white | ember | 5.18:1 | pass |
| Ember text on Cream | ember | cream | 4.81:1 | pass |
| Danger text on Cream | danger | cream | 6.10:1 | pass |
| White text on Danger | white | danger | 6.57:1 | pass |
| Success text on Cream | success | cream | 4.96:1 | pass |
| Teal on Midnight (forbidden for text) | teal | midnight | 3.17:1 | large text only |
| Saffron on Cream (forbidden for text) | saffron | cream | 1.64:1 | fail |
| Slate on Stone | slate | stone | 9.83:1 | pass |

Rules that follow: never put Teal text on Midnight or Saffron text on Cream (both fail, as the prompt already says); Saffron is used only as a fill with Midnight text. Ember and Danger are visually close, so every error, void or destructive state carries an icon and a text label.
