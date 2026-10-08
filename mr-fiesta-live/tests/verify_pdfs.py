"""Optional PDF content/layout regression check after npm run test:contracts.
Requires pypdf and pdfplumber. Run: python tests/verify_pdfs.py
"""
from pathlib import Path
from pypdf import PdfReader
import pdfplumber

root = Path(__file__).resolve().parents[1] / 'output' / 'pdf'
normal = PdfReader(root / 'contrato-prueba.pdf')
long = PdfReader(root / 'contrato-largo-prueba.pdf')
text = '\n'.join(page.extract_text() for page in normal.pages)
long_text = '\n'.join(page.extract_text() for page in long.pages)
assert 'CUARTO-PASO' in text
assert 'NOTA-INTERNA-NO-PUBLICAR' not in text
for marker in ['SERVICIO-FINAL', 'CRONOGRAMA-FINAL', 'JUEGOS-FINAL', 'ADICIONAL-FINAL']:
    assert marker in long_text, marker
assert len(long.pages) > len(normal.pages)
for name in ['contrato-prueba.pdf', 'contrato-largo-prueba.pdf']:
    with pdfplumber.open(root / name) as document:
        for page in document.pages:
            assert page.chars
            for char in page.chars:
                assert 0 <= char['top'] < char['bottom'] <= page.height, (name, page.page_number, char)
                assert -1 <= char['x0'] <= char['x1'] <= page.width + 1, (name, page.page_number, char)
            assert page.images, 'Missing logo/signature assets'
print(f'PASS: {len(normal.pages)} normal pages, {len(long.pages)} long pages, content and page bounds.')
