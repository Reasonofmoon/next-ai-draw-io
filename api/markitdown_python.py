import cgi
import json
import os
import tempfile
from http.server import BaseHTTPRequestHandler

from markitdown import MarkItDown


MAX_PDF_BYTES = 25 * 1024 * 1024


class handler(BaseHTTPRequestHandler):
    def _json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={
                    "REQUEST_METHOD": "POST",
                    "CONTENT_TYPE": self.headers.get("Content-Type", ""),
                },
            )
            if "file" not in form:
                self._json(400, {"success": False, "error": "No file field"})
                return

            item = form["file"]
            filename = getattr(item, "filename", "") or "uploaded.pdf"
            if not filename.lower().endswith(".pdf"):
                self._json(
                    400,
                    {"success": False, "error": "Only PDF files are supported"},
                )
                return

            data = item.file.read(MAX_PDF_BYTES + 1)
            if len(data) > MAX_PDF_BYTES:
                self._json(413, {"success": False, "error": "PDF exceeds 25MB"})
                return

            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                tmp.write(data)
                tmp_path = tmp.name

            try:
                md = MarkItDown(enable_plugins=False)
                result = md.convert(tmp_path)
                markdown = (
                    getattr(result, "text_content", None)
                    or getattr(result, "markdown", None)
                    or ""
                )
            finally:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

            self._json(
                200,
                {
                    "success": True,
                    "markdown": markdown,
                    "metadata": {
                        "engine": "microsoft-markitdown",
                        "filename": filename,
                    },
                },
            )
        except Exception as exc:
            self._json(500, {"success": False, "error": str(exc)})

