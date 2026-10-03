#!/usr/bin/env python3
"""Record plugins/fleet/assets/fleet.svg: a real Claude Code session with the fleet pane beside it.

Run: python3 assets/capture.py [--claude /path/to/claude]

Claude Code runs for real in an isolated home, against a loopback provider that
answers with a scripted edit, and loads the fleet plugin from this checkout. The
other sessions are demo fixtures in Claude's own formats (a job's state.json, a
live session's registry entry held by a stand-in process), so `claude agents`
and the pane report them as they would any session. Nothing on this machine's
own session list reaches the image, and no model is called.
"""
import argparse
import html
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import threading
import time
import uuid

REPO = Path(__file__).resolve().parent.parent
COLS, ROWS = 170, 34
SOCKET = "fleet-demo"
# Terminal background and text, as in the cones README capture.
BG, FG = "#191a1b", "#cccccc"
CW, LH, PAD, FS = 9, 18, 14, 15

PROMPT = "retry_delay should back off exponentially, capped at 60 seconds"
BEFORE = "def retry_delay(attempt):\n    return 2\n"
AFTER = "def retry_delay(attempt):\n    return min(2 ** attempt, 60)\n"
REPLY = ("**Backoff is in place.** `retry_delay` now doubles the wait on each attempt "
         "and stops growing at **60 seconds**.\n\nWant jitter as well, so retries from "
         "many clients spread out?")

# folder, name, state, line, minutes since it started
SESSIONS = [
    ("api", "Token rotation", "blocked", "Keep a five-minute grace period for old tokens?", 42),
    ("api", "Pagination cursors", "working", "Running python3 -m pytest tests/test_cursors.py", 18),
    ("web", "Keyboard navigation", "working", "Wrapping focus at the end of the menu", 9),
    ("web", "Session timeout policy", "blocked", "Sign inactive users out after 15 or 60 minutes?", 31),
    ("web", "Settings page", "idle", "Settings form saved and validated", 54),
    ("infra", "Container health checks", "working", "Adding a readiness probe to the api image", 6),
    ("infra", "CI cache keys", "done", "Cache keys now include the lockfile hash; builds reuse layers", 95),
    ("infra", "Build images", "done", "Multi-arch images published for api and web", 160),
]


def provider():
    """Answer Claude Code's Messages API calls: read the file, edit it, then reply."""
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])) or b"{}")
            tools = {t.get("name") for t in body.get("tools", [])}
            results = sum(
                1 for m in body.get("messages", []) if isinstance(m.get("content"), list)
                for b in m["content"] if b.get("type") == "tool_result"
            )
            path = str(ROOT / "projects/api/retry.py")
            if "Edit" not in tools:
                blocks = [{"type": "text", "text": "Retry backoff"}]
            elif results == 0:
                blocks = [{"type": "tool_use", "id": "toolu_read", "name": "Read", "input": {"file_path": path}}]
            elif results == 1:
                blocks = [{"type": "tool_use", "id": "toolu_edit", "name": "Edit", "input": {
                    "file_path": path, "old_string": "    return 2\n",
                    "new_string": "    return min(2 ** attempt, 60)\n"}}]
            else:
                blocks = [{"type": "text", "text": REPLY}]
            stop = "tool_use" if blocks[0]["type"] == "tool_use" else "end_turn"
            message = {"id": f"msg_{uuid.uuid4().hex}", "type": "message", "role": "assistant",
                       "model": body.get("model", "claude-sonnet-4-6"), "content": blocks,
                       "stop_reason": stop, "stop_sequence": None,
                       "usage": {"input_tokens": 1200, "output_tokens": 60}}
            if not body.get("stream"):
                return self.send(200, "application/json", json.dumps(message).encode())
            self.send(200, "text/event-stream", None)
            self.event("message_start", message={**message, "content": [], "stop_reason": None})
            for i, block in enumerate(blocks):
                if block["type"] == "text":
                    self.event("content_block_start", index=i, content_block={"type": "text", "text": ""})
                    self.event("content_block_delta", index=i, delta={"type": "text_delta", "text": block["text"]})
                else:
                    self.event("content_block_start", index=i, content_block={**block, "input": {}})
                    self.event("content_block_delta", index=i, delta={
                        "type": "input_json_delta", "partial_json": json.dumps(block["input"])})
                self.event("content_block_stop", index=i)
            self.event("message_delta", delta={"stop_reason": stop, "stop_sequence": None},
                       usage={"output_tokens": 60})
            self.event("message_stop")

        def send(self, code, kind, data):
            self.send_response(code)
            self.send_header("Content-Type", kind)
            self.end_headers()
            if data is not None:
                self.wfile.write(data)

        def event(self, kind, **data):
            self.wfile.write(f"event: {kind}\ndata: {json.dumps({'type': kind, **data})}\n\n".encode())
            self.wfile.flush()

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n")


def fixtures(home, stand_ins):
    """Demo sessions in Claude Code's own formats, read back through `claude agents`."""
    now = time.time()
    for n, (folder, name, state, line, minutes) in enumerate(SESSIONS):
        short = f"{n + 1:x}".rjust(8, "a")
        session = f"{short}-0000-4000-8000-{n + 1:012d}"
        started = now - minutes * 60
        stamp = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(started))
        write_json(home / f"jobs/{short}/state.json", {
            "state": {"blocked": "blocked", "done": "done"}.get(state, "working"),
            "detail": "" if state == "blocked" else line,
            "tempo": {"blocked": "blocked", "working": "active"}.get(state, "idle"),
            "output": {"result": line} if state == "done" else None,
            "template": "bg", "respawnFlags": [], "intent": name, "name": name, "nameSource": "auto",
            "sessionId": session, "daemonShort": short, "cliVersion": "2.1.288",
            "cwd": str(ROOT / "projects" / folder), "createdAt": stamp, "updatedAt": stamp,
            "firstTerminalAt": stamp if state == "done" else None, "backend": "daemon",
            **({"needs": line} if state == "blocked" else {}),
            **({"lastTerminalAt": stamp} if state == "done" else {}),
        })
        if state in ("working", "idle"):
            # `claude agents` keeps a live session's row while its pid runs.
            proc = subprocess.Popen(["sleep", "600"])
            stand_ins.append(proc)
            write_json(home / f"sessions/{proc.pid}.json", {
                "pid": proc.pid, "sessionId": session, "cwd": str(ROOT / "projects" / folder),
                "startedAt": int(started * 1000), "version": "2.1.288", "kind": "bg",
                "entrypoint": "cli", "name": name, "jobId": short,
                "status": "busy" if state == "working" else "idle", "updatedAt": int(now * 1000),
            })


def tmux(*args):
    return subprocess.run(["tmux", "-L", SOCKET, *args], capture_output=True, text=True, check=True).stdout


SGR = re.compile(r"\x1b\[([0-9;:]*)m")
XTERM = [0, 95, 135, 175, 215, 255]
ANSI16 = ["#191a1b", "#b16e7a", "#56a366", "#ebcb8b", "#81a1c1", "#b4b9f5", "#88c0d0", "#cccccc",
          "#999999", "#bf616a", "#a3be8c", "#ebcb8b", "#81a1c1", "#b4b9f5", "#8fbcbb", "#ffffff"]


def indexed(n):
    if n < 16:
        return ANSI16[n]
    if n >= 232:
        return "#%02x%02x%02x" % ((8 + 10 * (n - 232),) * 3)
    n -= 16
    return "#%02x%02x%02x" % (XTERM[n // 36], XTERM[n // 6 % 6], XTERM[n % 6])


def cells(ansi):
    """Terminal cells from tmux's escaped capture: text, colours, bold and dim per cell."""
    grid = []
    for line in ansi.split("\n")[:ROWS]:
        row, style = [], {"fg": None, "bg": None, "bold": False, "dim": False, "reverse": False}
        pos = 0
        for m in list(SGR.finditer(line)) + [None]:
            end = m.start() if m else len(line)
            for ch in line[pos:end]:
                row.append({"text": ch, **style})
            if not m:
                break
            pos = m.end()
            codes = [int(c or 0) for c in re.split("[;:]", m.group(1))] or [0]
            i = 0
            while i < len(codes):
                c = codes[i]
                if c == 0:
                    style = {"fg": None, "bg": None, "bold": False, "dim": False, "reverse": False}
                elif c == 1:
                    style["bold"] = True
                elif c == 2:
                    style["dim"] = True
                elif c == 22:
                    style["bold"] = style["dim"] = False
                elif c == 7:
                    style["reverse"] = True
                elif c == 27:
                    style["reverse"] = False
                elif c in (38, 48):
                    key = "fg" if c == 38 else "bg"
                    if codes[i + 1] == 5:
                        style[key], i = indexed(codes[i + 2]), i + 2
                    else:
                        style[key], i = "#%02x%02x%02x" % tuple(codes[i + 2:i + 5]), i + 4
                elif c == 39:
                    style["fg"] = None
                elif c == 49:
                    style["bg"] = None
                elif 30 <= c <= 37 or 90 <= c <= 97:
                    style["fg"] = ANSI16[c - 30 if c < 90 else c - 82]
                elif 40 <= c <= 47 or 100 <= c <= 107:
                    style["bg"] = ANSI16[c - 40 if c < 100 else c - 92]
                i += 1
        grid.append(row)
    return grid


QUADRANTS = {"▀": 0b0011, "▄": 0b1100, "█": 0b1111, "▌": 0b0101, "▐": 0b1010, "▖": 0b0100,
             "▗": 0b1000, "▘": 0b0001, "▙": 0b1101, "▚": 0b1001, "▛": 0b0111, "▜": 0b1011,
             "▝": 0b0010, "▞": 0b0110, "▟": 0b1110}
LINES = {"─": [(0, .5, 1, .5)], "│": [(.5, 0, .5, 1)], "╭": [(.5, 1, .5, .5), (.5, .5, 1, .5)],
         "╮": [(0, .5, .5, .5), (.5, .5, .5, 1)], "╰": [(.5, 0, .5, .5), (.5, .5, 1, .5)],
         "╯": [(0, .5, .5, .5), (.5, .5, .5, 0)]}


def svg(grid):
    """Draw block characters on the cell grid, as cones does, so the mascot keeps its shape."""
    width, height = COLS * CW + PAD * 2, ROWS * LH + PAD * 2
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
           f'viewBox="0 0 {width} {height}" font-family="SFMono-Regular,Menlo,Consolas,monospace" '
           f'font-size="{FS}" shape-rendering="crispEdges">',
           '<title>Claude Code with the fleet pane listing other sessions</title>',
           f'<rect width="{width}" height="{height}" rx="8" fill="{BG}" shape-rendering="auto"/>']
    for r, row in enumerate(grid):
        for c, cell in enumerate(row[:COLS]):
            x, y = PAD + c * CW, PAD + r * LH
            fg, bg = cell["fg"] or FG, cell["bg"] or BG
            if cell["reverse"]:
                fg, bg = bg, fg
            if cell["dim"]:
                fg = "#%02x%02x%02x" % tuple((int(fg[n:n + 2], 16) + int(bg[n:n + 2], 16)) // 2 for n in (1, 3, 5))
            if bg != BG:
                out.append(f'<rect x="{x}" y="{y}" width="{CW}" height="{LH}" fill="{bg}"/>')
            t = cell["text"]
            if not t.strip():
                continue
            if t in QUADRANTS:
                for bit in range(4):
                    if QUADRANTS[t] & (1 << bit):
                        out.append(f'<rect x="{x + bit % 2 * CW / 2}" y="{y + bit // 2 * LH / 2}" '
                                   f'width="{CW / 2}" height="{LH / 2}" fill="{fg}"/>')
            elif t in LINES:
                for x0, y0, x1, y1 in LINES[t]:
                    out.append(f'<line x1="{x + x0 * CW}" y1="{y + y0 * LH}" x2="{x + x1 * CW}" '
                               f'y2="{y + y1 * LH}" stroke="{fg}"/>')
            else:
                bold = ' font-weight="700"' if cell["bold"] else ""
                out.append(f'<text x="{x}" y="{y + FS - 1}" fill="{fg}"{bold}>{html.escape(t)}</text>')
    out.append("</svg>")
    return "\n".join(out) + "\n"


def main():
    global ROOT
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--claude", type=Path, default=shutil.which("claude"))
    claude = parser.parse_args().claude.resolve()
    ROOT = Path(tempfile.mkdtemp(prefix="fd-", dir="/tmp")).resolve()
    home = ROOT / ".claude"
    bin_dir = ROOT / ".local/bin"
    bin_dir.mkdir(parents=True)
    (bin_dir / "claude").symlink_to(claude)
    for folder in ("api", "web", "infra"):
        (ROOT / "projects" / folder).mkdir(parents=True)
    (ROOT / "projects/api/retry.py").write_text(BEFORE)
    server = provider()
    url = f"http://127.0.0.1:{server.server_address[1]}"
    env_vars = {
        "ANTHROPIC_API_KEY": "fixture", "ANTHROPIC_BASE_URL": url,
        "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1", "CLAUDE_CODE_NO_FLICKER": "1",
        "DISABLE_AUTOUPDATER": "1", "DISABLE_TELEMETRY": "1", "DISABLE_ERROR_REPORTING": "1",
    }
    write_json(home / ".claude.json", {
        "hasCompletedOnboarding": True, "theme": "dark",
        "customApiKeyResponses": {"approved": ["fixture"], "rejected": []},
        "projects": {str(ROOT / "projects/api"): {"hasTrustDialogAccepted": True}},
    })
    write_json(home / "settings.json", {"env": env_vars})
    stand_ins = []
    fixtures(home, stand_ins)
    env = {**env_vars, "HOME": str(ROOT), "CLAUDE_CONFIG_DIR": str(home),
           "CLAUDE_CODE_PLUGIN_DIRS": str(REPO / "plugins/fleet"),
           "PATH": f"{bin_dir}:/usr/bin:/bin:/usr/sbin:/sbin", "TERM": "xterm-256color",
           "COLORTERM": "truecolor", "LANG": "en_US.UTF-8", "SHELL": "/bin/bash"}
    command = " ".join([
        "env", "-i", *(f"{k}={v}" for k, v in env.items()), str(claude),
        "--model", "claude-sonnet-4-6", "--permission-mode", "acceptEdits",
        "-n", "'Retry backoff'", f"'{PROMPT}'",
    ])
    try:
        tmux("-f", "/dev/null", "new-session", "-d", "-s", "demo", "-x", str(COLS), "-y", str(ROWS),
             "-c", str(ROOT / "projects/api"), command)
        tmux("set", "-g", "default-terminal", "xterm-256color")
        tmux("set", "-ga", "terminal-overrides", ",*:RGB")
        deadline = time.time() + 60
        while time.time() < deadline:
            text = tmux("capture-pane", "-p", "-t", "demo")
            if "Want jitter" in text and "awaiting input" in text:
                break
            time.sleep(0.5)
        else:
            raise SystemExit("the session or the pane never drew:\n" + text)
        # One more pane refresh (every 3 s) so this session reads idle after its reply.
        time.sleep(5)
        ansi = tmux("capture-pane", "-p", "-e", "-N", "-t", "demo")
    finally:
        subprocess.run(["tmux", "-L", SOCKET, "kill-server"], capture_output=True)
        for proc in stand_ins:
            proc.kill()
        server.shutdown()
    assert (ROOT / "projects/api/retry.py").read_text() == AFTER, "Claude did not make the edit"
    plain = tmux_plain = re.sub(r"\x1b\[[0-9;:]*m", "", ansi)
    assert "/Users/" not in plain and "/private/" not in plain, "a real path reached the image"
    (REPO / "plugins/fleet/assets/fleet.svg").write_text(svg(cells(ansi)))
    shutil.rmtree(ROOT, ignore_errors=True)
    print(tmux_plain)


if __name__ == "__main__":
    main()
