import json
import subprocess
import sys
from pathlib import Path

frontend_dir = Path(r"c:\Users\Usuario\Lexio\frontend")

# Try to run tsc using Python subprocess
try:
    result = subprocess.run(
        [sys.executable, "-m", "json.tool"],
        cwd=str(frontend_dir),
        capture_output=True,
        text=True
    )
    
    # Try running tsc via node directly
    result = subprocess.run(
        ["node", str(frontend_dir / "node_modules" / "typescript" / "bin" / "tsc"), "--noEmit"],
        cwd=str(frontend_dir),
        capture_output=True,
        text=True,
        shell=True
    )
    
    print("STDOUT:")
    print(result.stdout)
    print("\nSTDERR:")
    print(result.stderr)
    print("\nReturn code:", result.returncode)
except Exception as e:
    print(f"Error: {e}")
