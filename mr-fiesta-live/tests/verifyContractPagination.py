from pathlib import Path
import pdfplumber

root = Path(__file__).resolve().parents[1] / 'tmp' / 'contract-pagination'
for filename in ['full-details.pdf', 'single-long-item.pdf', 'short.pdf', 'browser.pdf']:
    with pdfplumber.open(root / filename) as doc:
        text = '\n'.join(p.extract_text() or '' for p in doc.pages)
        for marker in ['SERVICIO_FINAL', 'CRONOGRAMA_FINAL', 'JUEGO_FINAL', 'ADICIONAL_FINAL']:
            assert marker in text, (filename, marker)
        for number, page in enumerate(doc.pages, 1):
            assert f'Página {number} de {len(doc.pages)}' in page.extract_text()
            for c in page.chars:
                assert 0 <= c['top'] < c['bottom'] <= page.height, (filename, number, c)
            # Body must stay above the dark footer at 277 mm.
            body = [c for c in page.chars if c['top'] < 277 / 25.4 * 72]
            assert all(c['bottom'] < 277 / 25.4 * 72 for c in body)
        print(filename, len(doc.pages), 'pages; all markers and page bounds pass')
