from pathlib import Path
import runpy
import sys

SRC_DIR = Path(__file__).resolve().parents[1] / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

if __name__ == "__main__":
    runpy.run_path(str(SRC_DIR / "bot2_service" / "main.py"), run_name="__main__")
