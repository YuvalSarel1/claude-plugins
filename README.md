# claude-plugins

Claude Code plugins by Yuval Sarel. Add the marketplace once, then install what you want.

```
/plugin marketplace add YuvalSarel1/claude-plugins
```

| Plugin | What it does |
|---|---|
| [fleet](plugins/fleet) | Your `claude agents` list in a side pane, with optional model, context, cost, CPU and memory columns |

![Claude Code with the fleet pane beside the conversation](plugins/fleet/assets/fleet.svg)

## Developing

```
claude --plugin-dir plugins/fleet     # load it from this checkout
claude plugin validate plugins/fleet  # check the manifest and module
claude plugin test plugins/fleet      # run hooks/*.test.ts
```

Saving a file reloads the plugin in a running session.

`bun assets/compare.ts` draws the real `claude agents` view in a scratch tmux and checks every folder, name, state word, glyph and age against what fleet makes of the same sessions. Run it from any project after a Claude Code update; it exits 1 on a difference.

`python3 assets/capture.py` regenerates `plugins/fleet/assets/fleet.svg`. It runs Claude Code in a throwaway home against a local stand-in for the API, with demo sessions in Claude's own file formats, so no model is called and none of your sessions appear. `--set width=30` captures with a setting changed, and `--out` writes somewhere else.


## License

MIT or Apache-2.0, at your option.
