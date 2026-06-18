#!/usr/bin/env python3
"""Saltinup launcher — installs loguru if available, then starts the server."""
import subprocess, sys, os

def main():
    # Try installing loguru
    try:
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "loguru", "-q"],
            timeout=30, check=False
        )
    except Exception:
        pass  # Offline — stdlib logger will be used

    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    import server
    from database import init_db
    from http.server import HTTPServer
    init_db()
    port = int(os.environ.get("PORT", 8000))
    srv = HTTPServer(("0.0.0.0", port), server.SaltinupHandler)
    server.logger.success(f"🚀 Saltinup running at http://localhost:{port}")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        server.logger.info("Server stopped.")
        srv.server_close()

if __name__ == "__main__":
    main()
