# Local stand-in for ntfy.sh, used by tests when the box's own ntfy.sh allowance (250 messages/day per IP) is used up.
# It intercepts the pages' real requests (POST https://ntfy.sh/<topic>, wss://ntfy.sh/<topic>/ws) inside Playwright and
# behaves like ntfy: every subscriber of a topic, including the sender, receives {"event":"message","message":<body>}.
# App code is unchanged; only the network hop is replaced.
import json, time, itertools
SUBS = {}; LOG = []; _ids = itertools.count(1)
def _post(route):
    req = route.request
    if req.method != "POST": return route.continue_()
    topic = req.url.split("ntfy.sh/")[1].split("?")[0].split("/")[0]
    body = req.post_data or ""
    msg = {"id": f"m{next(_ids)}", "time": int(time.time()), "event": "message", "topic": topic, "message": body}
    LOG.append((topic, body))
    for ws in list(SUBS.get(topic, [])):
        try: ws.send(json.dumps(msg))
        except Exception: SUBS[topic].discard(ws)
    route.fulfill(status=200, headers={"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"}, body=json.dumps(msg))
def _ws(ws):
    topic = ws.url.split("ntfy.sh/")[1].split("/")[0]
    SUBS.setdefault(topic, set()).add(ws)
    ws.on_close(lambda *a: SUBS.get(topic, set()).discard(ws))
    ws.send(json.dumps({"id": f"o{next(_ids)}", "time": int(time.time()), "event": "open", "topic": topic}))
def install(ctx):
    ctx.route("https://ntfy.sh/**", _post)
    ctx.route_web_socket("wss://ntfy.sh/**", _ws)
