# 이북리더기 E2E용 3쪽짜리 한글 PDF(책갈피 목차 포함)를 만드는 스크립트. PyMuPDF 필요.
import pathlib
import fitz

OUT = pathlib.Path(__file__).with_name('reader-sample.pdf')
PAGES = [
    ('1장 재무상태표', '재무상태표는 한 시점의 자산과 부채와 자본을 보여준다. 자산은 부채와 자본의 합이다.'),
    ('2장 손익계산서', '손익계산서는 한 기간의 수익과 비용을 보여준다. 매출에서 비용을 빼면 이익이다.'),
    ('3장 현금흐름표', '현금흐름표는 현금이 어디서 들어와 어디로 나갔는지 보여준다.'),
]

doc = fitz.open()
for title, body in PAGES:
    page = doc.new_page(width=420, height=595)
    page.insert_text((40, 70), title, fontname='korea', fontsize=22)
    page.insert_textbox(fitz.Rect(40, 100, 380, 560), body, fontname='korea', fontsize=13, lineheight=1.6)
doc.set_toc([[1, title, index + 1] for index, (title, _) in enumerate(PAGES)])
doc.save(OUT)
print(OUT, OUT.stat().st_size, 'bytes')
