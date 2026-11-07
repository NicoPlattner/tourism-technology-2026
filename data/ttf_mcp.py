"""Minimal client for the TTF Space MCP endpoint (JSON-RPC over streamable HTTP).

The API key is never handled here: in the cloud session the network proxy
injects `Authorization: Bearer <key>` for space.ttf.nexyo.io. Locally, set
TTF_SPACE_API_KEY. Never commit a key.

    python3 data/ttf_mcp.py tools                     # list tools
    python3 data/ttf_mcp.py call <tool> '<json args>' # call one tool
"""
import json
import os
import sys
import urllib.request

URL = "https://space.ttf.nexyo.io/api/v1/mcp"


class Client:
    def __init__(self):
        self.sid, self.n = None, 0
        self.rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {},
                                "clientInfo": {"name": "c04-data-models", "version": "0.1"}})
        self.rpc("notifications/initialized", None, notify=True)

    def rpc(self, method, params, notify=False):
        self.n += 1
        body = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            body["params"] = params
        if not notify:
            body["id"] = self.n
        h = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream",
             "Authorization": f"Bearer {os.environ.get('TTF_SPACE_API_KEY', 'proxy-injected')}"}
        if self.sid:
            h["Mcp-Session-Id"] = self.sid
        req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers=h)
        with urllib.request.urlopen(req, timeout=120) as r:
            self.sid = r.headers.get("Mcp-Session-Id", self.sid)
            raw = r.read().decode()
        if notify or not raw.strip():
            return None
        msgs = [json.loads(l[5:]) for l in raw.splitlines() if l.startswith("data:")] or [json.loads(raw)]
        m = msgs[-1]
        if "error" in m:
            raise RuntimeError(m["error"])
        return m["result"]

    def tools(self):
        return self.rpc("tools/list", {})["tools"]

    def call(self, name, args=None):
        res = self.rpc("tools/call", {"name": name, "arguments": args or {}})
        if res.get("structuredContent") is not None:
            return res["structuredContent"]
        texts = [c.get("text", "") for c in res.get("content", []) if c.get("type") == "text"]
        out = "\n".join(texts)
        try:
            return json.loads(out)
        except json.JSONDecodeError:
            return out


if __name__ == "__main__":
    c = Client()
    if sys.argv[1] == "tools":
        for t in c.tools():
            print(f"- {t['name']}: {t.get('description', '')[:150]}")
            print("    args:", list(t.get("inputSchema", {}).get("properties", {}).keys()))
    else:
        r = c.call(sys.argv[2], json.loads(sys.argv[3]) if len(sys.argv) > 3 else {})
        print(json.dumps(r, indent=1, ensure_ascii=False)[:6000] if not isinstance(r, str) else r[:6000])
