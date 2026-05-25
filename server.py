import http.server
import urllib.request
import json

OLLAMA = "http://localhost:11434"

class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            with open("index.html", "rb") as f:
                self.wfile.write(f.read())
            return
        self.proxy("GET")

    def do_POST(self):
        self.proxy("POST")

    def proxy(self, method):
        body = None
        if method == "POST":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
        url = f"{OLLAMA}{self.path}"
        req = urllib.request.Request(url, data=body,
            headers={"Content-Type": "application/json"},
            method=method)
        try:
            with urllib.request.urlopen(req) as res:
                data = res.read()
                self.send_response(res.status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(e.read())
        except urllib.error.URLError:
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Ollama not running"}).encode())

    def log_message(self, fmt, *args):
        print(f"[server] {args[0]} {args[1]} {args[2]}")

if __name__ == "__main__":
    port = 8080
    srv = http.server.HTTPServer(("0.0.0.0", port), ProxyHandler)
    print(f"Serving at http://localhost:{port}")
    print(f"Proxying API to {OLLAMA}")
    srv.serve_forever()
