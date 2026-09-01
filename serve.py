import http.server
import functools
import os

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()

if __name__ == "__main__":
    import sys
    port = int(os.environ.get("PORT") or (sys.argv[1] if len(sys.argv) > 1 else 8744))
    serve_dir = os.path.dirname(os.path.abspath(__file__))
    handler = functools.partial(NoCacheHandler, directory=serve_dir)
    http.server.test(HandlerClass=handler, port=port)
