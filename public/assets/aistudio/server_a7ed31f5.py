# Local-only static hosting with restrictive browser security headers.
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
ROOT=Path(__file__).resolve().parent
os.chdir(ROOT)
class Handler(SimpleHTTPRequestHandler):
 def end_headers(self):
  self.send_header('X-Content-Type-Options','nosniff')
  self.send_header('X-Frame-Options','DENY')
  self.send_header('Referrer-Policy','no-referrer')
  self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' data: blob:; font-src 'self' data:; worker-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
  super().end_headers()
 def send_head(self):
  path=Path(self.translate_path(self.path)).resolve()
  if not path.is_relative_to(ROOT) or any(p.startswith('.') for p in path.relative_to(ROOT).parts):
   self.send_error(403);return
  if path.is_dir() and path!=ROOT:self.send_error(403);return
  if path.suffix not in {'.js','.css','.html','.svg','.png','.json',''}:self.send_error(403);return
  return super().send_head()
if __name__=='__main__':
 print('WinCreate: http://127.0.0.1:8765')
 ThreadingHTTPServer(('127.0.0.1',8765),Handler).serve_forever()
