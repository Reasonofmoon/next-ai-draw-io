#!/usr/bin/env python
import json
import os
import sys


def main() -> int:
    if len(sys.argv) != 2:
        print(
            json.dumps(
                {
                    "success": False,
                    "error": "Usage: markitdown_pdf.py <pdf-path>",
                }
            )
        )
        return 2

    path = os.path.abspath(sys.argv[1])
    if not os.path.isfile(path):
        print(json.dumps({"success": False, "error": "PDF file not found"}))
        return 2

    try:
        from markitdown import MarkItDown
    except Exception as exc:
        print(
            json.dumps(
                {
                    "success": False,
                    "error": (
                        "MarkItDown is not installed for this Python runtime. "
                        "Install it with: pip install 'markitdown[pdf]'"
                    ),
                    "detail": str(exc),
                }
            )
        )
        return 3

    try:
        md = MarkItDown(enable_plugins=False)
        result = md.convert(path)
        markdown = (
            getattr(result, "text_content", None)
            or getattr(result, "markdown", None)
            or ""
        )
        print(
            json.dumps(
                {
                    "success": True,
                    "markdown": markdown,
                    "metadata": {"engine": "microsoft-markitdown"},
                },
                ensure_ascii=False,
            )
        )
        return 0
    except Exception as exc:
        print(
            json.dumps(
                {
                    "success": False,
                    "error": str(exc),
                },
                ensure_ascii=False,
            )
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

