from pathlib import Path

_src_pkg = Path(__file__).resolve().parents[1] / "src" / "bot2_service"
if _src_pkg.exists():
    __path__.append(str(_src_pkg))
