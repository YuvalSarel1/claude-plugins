# images

Every image in the conversation, in a strip above the prompt: screenshots you paste, and the files Claude reads with the Read tool (or any tool that returns an image). The newest that fit across, each labelled with its number and file name.

```
/plugin marketplace add YuvalSarel1/claude-plugins
/plugin install images@yuvalsarel1
```

## Using it

| Action | How |
|---|---|
| Turn the strip on or off | `/images`. The choice holds across sessions. |
| See one large | `/images 3` opens image 3 in a pane, as wide as the pane; arrows scroll a tall one, Escape closes it. |
| See it sharp | `/images open 3` opens image 3 in Preview. `/images open` opens the newest. |
| Where it shows | The strip sits above the prompt, 12 rows tall, once the conversation has an image. |

## How it draws

Pictures are drawn in text: each character cell is a 2x2 block of pixels in two colours, using the quadrant block glyphs. That works in any truecolor terminal, including tmux, cones and `claude attach` sessions, where Claude Code's own image element falls back to text. The cost is resolution: about two pixels per column, so layout and colour read, small text does not. `/images open` is there for that.

Decoding uses macOS `sips`, so any image it reads works (PNG, JPEG, GIF, WebP). Images from the conversation are written to a temporary folder only while they are converted, and for `/images open`.

## Limits

- macOS only, for `sips` and `open`.
- After a compaction, images the summary replaced are gone from the conversation, so they leave the strip too.

## Privacy

The plugin reads the session's own conversation in memory and sends nothing anywhere.
