"""웹앱(teacher.html)이 쓰는 페이지 틀을 Python 버전과 똑같이 만들어 저장소 app/ 폴더에 내보낸다.

사용법: python3 export_app_templates.py <저장소 폴더>
  app/student.html   학생 단어장 페이지 틀 (make_site.standalone 과 같은 머리말)
  app/list-page.html 첫 화면·빈 반 페이지 틀
template.html 이나 make_site.py 의 디자인을 바꾸면 다시 실행한다.
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make_site as ms  # noqa: E402

repo = sys.argv[1]
os.makedirs(os.path.join(repo, "app"), exist_ok=True)

tpl = open(os.path.join(HERE, "template.html"), encoding="utf-8").read()
student = ms.standalone(tpl, "__OG_TITLE__", "__OG_DESC__", "__OG_URL__")
assert "__PAGE_TITLE__" in student and "/*__WORDBOOK_DATA__*/null" in student
open(os.path.join(repo, "app", "student.html"), "w", encoding="utf-8").write(student)

head = ms.HEAD_BASE.format(og=ms.og_tags("__OG_TITLE__", "__OG_DESC__", "__OG_URL__"))
lst = ms.LIST_PAGE.format(head=head, title="__PAGE_TITLE__", css=ms.LIST_CSS, body="__BODY__")
open(os.path.join(repo, "app", "list-page.html"), "w", encoding="utf-8").write(lst)
print("app/student.html, app/list-page.html")
