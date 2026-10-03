# fleet

`claude agents` shows every session on the machine, but only in its own screen. fleet keeps that list beside the conversation you are in, so you see which sessions need you without leaving it.

```
/plugin marketplace add YuvalSarel1/claude-plugins
/plugin install fleet@yuvalsarel1
```

![Claude Code with the fleet pane beside the conversation](assets/fleet.svg)

The list comes from `claude agents --json --all`. States, lines and ages follow the agents view, and working rows animate with Claude's own spinner.

## Using it

| Action | How |
|---|---|
| Turn the pane on or off | `/fleet`. The choice holds across sessions. |
| Where it shows | Docked beside the transcript in fullscreen from 110 columns; above the prompt otherwise. It opens by itself from 144 columns. |
| Refresh | Every 3 seconds (the Refresh setting) the pane checks the session files Claude Code writes, and reruns `claude agents` only when one changed, or every 30 seconds. Nothing runs while the pane is closed or hidden. |

## Settings

Each setting is a row in `/config`. Extra columns are off, so the default row reads like `claude agents`.

| Setting | Default | Shows |
|---|---|---|
| Spinner | on | Working rows animate as in Claude Code. Off saves about 2% of a core with four sessions working. |
| Status width | 20 | Columns kept for the status text. Long names shrink first. |
| Pane width | 0 | Share of the terminal the docked pane takes, in percent. 0 keeps Claude Code's own width, about 45%. Dragging the pane's edge still wins. |
| Refresh | 3 | Seconds between checks for changed sessions. |
| Model | off | `opus[1m]` |
| Effort | off | `medium` |
| Tokens | off | `32.9k` |
| Tasks | off | Background tasks running |
| Kind | off | `bg` or interactive |
| Prompt | off | The session's first request |
| Context | off | `174k/1.0M` |
| Cost | off | `$4.38` |
| CPU | off | `3%` |
| Memory | off | `650M` |

Model, effort, tokens, tasks and prompt come from each background job's `~/.claude/jobs/<id>/state.json`. CPU and memory come from `ps`.

Context and cost are what Claude Code reports to your statusLine, so they need your statusLine command to save that report. With the command's stdin read into `$input`, add:

```sh
mkdir -p ~/.claude/statusline
printf '%s' "$input" > ~/.claude/statusline/"$(jq -r .session_id <<<"$input")".json
```

This is the same file [cones](https://github.com/YuvalSarel1/cones) reads. Without it those two columns show `-`.

## What it runs, reads and sends

fleet sends nothing anywhere. It makes no network requests, starts no server, and writes nothing outside the plugin's own Claude Code storage, where it keeps your `/fleet` on or off choice.

It starts two local programs, only while the pane is on screen:

| Program | Exact command | Why |
|---|---|---|
| Claude Code | `claude agents --json --all` | The session list and each session's state. It runs when a session or job file changed, and at most every 30 seconds otherwise. |
| `ps` | `ps -A -o pid=,%cpu=,rss=` | CPU and Memory columns, keeping only the process ids `claude agents` reported. It runs only when one of those columns is on. |

It reads these files, all written by Claude Code or your own statusLine command:

| File | Why |
|---|---|
| `~/.claude/sessions/*.json`, `~/.claude/jobs/*/state.json` | Noticing changes, and each row's line, age and the Model to Prompt columns |
| `~/.claude/statusline/<session>.json` | Context and Cost, when those columns are on |

`CLAUDE_CONFIG_DIR` replaces `~/.claude` when it is set. What it reads is drawn in the pane and nowhere else.

It hooks three Claude Code events: `session.start` to register `/fleet` and open the pane, `command.run` for `/fleet` only, and `ui.render` for its own pane only, which it draws. It does not see or change any other command, drawing, prompt or tool call.

## Privacy

fleet collects nothing and sends nothing. The session names, folders and prompts it shows stay on your machine, read from Claude Code's own files each time the pane refreshes and kept only in memory. The one thing it saves is your `/fleet` on or off choice, in Claude Code's plugin storage. [What it runs, reads and sends](#what-it-runs-reads-and-sends) lists every program and file involved.

## Limits

| Limit | Why |
|---|---|
| The pane is always on the right | Claude Code places plugin panes; a plugin cannot pick the side. |
| Rows are not clickable | Open sessions from `claude agents` itself. |
| No pinned group, PR column, `/loop` next-run time or live transcript line | Those come from files and lookups `claude agents --json` does not report. |
| Can break on a Claude Code update | The view's rules are read from Claude Code 2.1.288, the plugin API is early access, and `state.json` is not a documented format. `bun assets/compare.ts` in the repo checks fleet against the live view. |

## License

MIT or Apache-2.0, at your option.
