// One CDP client for every driver in this folder.
//
// Why it exists: shots.mjs, sweep.mjs and cdp.mjs each carried a hand-copied
// connect class. They drifted, and a fix applied to one (the mouse helper) was
// missing from another. Import from here instead of copying.
//
// Requires node >= 22 for the global WebSocket. No dependencies.
//
//   import { connect, CdpDown, errmsg } from './lib/cdp.mjs';
//   const c = await connect({ port: 9222 });          // throws CdpDown
//   const [page] = await c.pages();
//   const sid = await c.attach(page.targetId);
//   const title = await c.ev(sid, 'document.title');  // awaits promises
//
// Every pending call rejects if the socket dies, so a closed browser surfaces
// as one clear error instead of a hang.

export const errmsg = e => String((e && e.message) || e);

/** Thrown when nothing usable is listening on the debug port. Message prints as-is. */
export class CdpDown extends Error {
  constructor(port, extra) {
    super(`Nothing usable is listening for CDP on http://localhost:${port} (${extra}).

Start the QA browser, sign into the app in that window, then rerun:
  ./launch-chrome.sh <start-url>
Check it is up with:
  curl -s http://localhost:${port}/json/version`);
    this.name = 'CdpDown';
    this.port = port;
  }
}

export class CDP {
  constructor(ws, callTimeout) {
    this.ws = ws;
    this.callTimeout = callTimeout;
    this.id = 0;
    this.p = new Map();
    this.listeners = [];
    this.dead = null;
  }

  /** Raw protocol call. Rejects on protocol error, timeout, or a dead socket. */
  send(method, params = {}, sessionId) {
    if (this.dead) return Promise.reject(this.dead);
    const id = ++this.id;
    return new Promise((res, rej) => {
      const t = setTimeout(() => {
        if (this.p.delete(id)) rej(new Error(`timeout ${method}`));
      }, this.callTimeout);
      this.p.set(id, { res, rej, t });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  /** Subscribe to unsolicited protocol events, for example Network.responseReceived. */
  on(fn) { this.listeners.push(fn); }

  /** Page targets, devtools windows excluded. */
  async pages() {
    return (await this.send('Target.getTargets')).targetInfos
      .filter(t => t.type === 'page' && !t.url.startsWith('devtools://'));
  }

  async attach(targetId) {
    return (await this.send('Target.attachToTarget', { targetId, flatten: true })).sessionId;
  }

  /**
   * Evaluate in the page and return the value. Promises are awaited.
   * A thrown expression comes back as { __err } rather than rejecting, because
   * a probe that throws is a result to record, not a run to abort.
   */
  async ev(sessionId, expression) {
    const r = await this.send('Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise: true }, sessionId);
    return r.exceptionDetails
      ? { __err: r.exceptionDetails.exception?.description || r.exceptionDetails.text }
      : r.result.value;
  }

  /** Real mouse move. Synthetic DOM events do not open tooltips. */
  mouse(sessionId, x, y) {
    return this.send('Input.dispatchMouseEvent',
      { type: 'mouseMoved', x, y, button: 'none', buttons: 0, clickCount: 0, pointerType: 'mouse' }, sessionId);
  }

  /** PNG of the visible viewport as a Buffer. The caller decides where it lands. */
  async screenshot(sessionId, opts = {}) {
    const r = await this.send('Page.captureScreenshot', { format: 'png', ...opts }, sessionId);
    return Buffer.from(r.data, 'base64');
  }

  close() { try { this.ws.close(); } catch {} }
}

/**
 * Connect to the browser websocket endpoint.
 * @throws {CdpDown} when the port is unreachable, returns junk, or refuses the socket.
 */
export async function connect({ port = Number(process.env.CDP_PORT) || 9222,
                                callTimeout = 120000 } = {}) {
  let url;
  try {
    const res = await fetch(`http://localhost:${port}/json/version`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    url = (await res.json()).webSocketDebuggerUrl;
    if (!url) throw new Error('no webSocketDebuggerUrl in /json/version');
  } catch (e) {
    throw new CdpDown(port, errmsg(e));
  }

  const ws = new WebSocket(url);
  try {
    await new Promise((r, j) => {
      ws.onopen = r;
      ws.onerror = () => j(new Error('websocket refused'));
    });
  } catch (e) {
    throw new CdpDown(port, errmsg(e));
  }

  const c = new CDP(ws, callTimeout);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && c.p.has(m.id)) {
      const { res, rej, t } = c.p.get(m.id);
      c.p.delete(m.id);
      clearTimeout(t);
      m.error ? rej(new Error(m.error.message || JSON.stringify(m.error))) : res(m.result);
    } else {
      for (const fn of c.listeners) fn(m);
    }
  };
  ws.onclose = () => {
    c.dead = c.dead || new Error('CDP socket closed, the browser or the tab went away');
    for (const { rej, t } of c.p.values()) { clearTimeout(t); rej(c.dead); }
    c.p.clear();
  };
  return c;
}
