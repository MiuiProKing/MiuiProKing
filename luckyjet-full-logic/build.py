from pathlib import Path
root = Path(__file__).parent
html = (root / 'src/shell.html').read_text()
for marker, filename in [('STYLES', 'style.css'), ('CORE', 'core.js'), ('APP', 'app.js')]:
    html = html.replace('/*__' + marker + '__*/', (root / 'src' / filename).read_text())
assert '/*__' not in html
(root / 'index.html').write_text(html)
print('index.html ready')
