import re
import base64
import pathlib

ROOT = pathlib.Path(__file__).parent
JS_DIR = ROOT / "js"
OUT = ROOT / "DroneSimulator-standalone.html"

JS_ORDER = ["config.js", "joystick.js", "input.js", "drone.js", "main.js"]


def strip_module_syntax(src: str) -> str:
    lines = []
    for line in src.splitlines():
        if line.startswith("import "):
            continue
        if line.startswith("export "):
            line = line[len("export "):]
        lines.append(line)
    return "\n".join(lines)


bundled_js = "\n\n".join(strip_module_syntax((JS_DIR / f).read_text(encoding="utf-8")) for f in JS_ORDER)

css = (ROOT / "css" / "style.css").read_text(encoding="utf-8")
html = (ROOT / "index.html").read_text(encoding="utf-8")

icon_b64 = base64.b64encode((ROOT / "assets" / "apple-touch-icon.png").read_bytes()).decode("ascii")

# manifest/harici ikon linklerini tekli-dosya sürümünde kaldır (yan dosyalar yok), touch-icon'u gömülü yap
html = re.sub(r'\s*<link rel="manifest"[^>]*/>\n', "\n", html)
html = re.sub(r'\s*<link rel="apple-touch-icon"[^>]*/>', f'\n<link rel="apple-touch-icon" href="data:image/png;base64,{icon_b64}" />', html)
html = re.sub(r'\s*<link rel="icon"[^>]*/>', f'\n<link rel="icon" href="data:image/png;base64,{icon_b64}" />', html)

html = html.replace('<link rel="stylesheet" href="css/style.css" />', f"<style>\n{css}\n</style>")
html = re.sub(
    r'<script type="module" src="js/main\.js"></script>',
    f"<script>\n{bundled_js}\n</script>",
    html,
)

OUT.write_text(html, encoding="utf-8")
print("Yazıldı:", OUT, f"({OUT.stat().st_size / 1024:.0f} KB)")
