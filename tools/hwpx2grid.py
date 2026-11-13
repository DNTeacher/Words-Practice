"""HWPX(한글 새 형식) 본문을 문단·표로 꺼낸다. 사용: python3 hwpx2grid.py 파일.hwpx [out.json]"""
import sys, zipfile, json, re
import xml.etree.ElementTree as ET

def local(tag): return tag.rsplit('}', 1)[-1]

def para_text(p):
    out = []
    for el in p.iter():
        t = local(el.tag)
        if t == 't':
            out.append(el.text or '')
            for ch in el:  # tab, lineBreak 등 안쪽 요소 뒤의 글자
                if local(ch.tag) == 'tab': out.append('\t')
                elif local(ch.tag) == 'lineBreak': out.append('\n')
                out.append(ch.tail or '')
    return ''.join(out).strip()

def walk(el, blocks):
    for ch in el:
        t = local(ch.tag)
        if t == 'tbl':
            rows = int(ch.get('rowCnt', 0)); cols = int(ch.get('colCnt', 0))
            grid = [[''] * cols for _ in range(rows)]
            for tc in ch.iter():
                if local(tc.tag) != 'tc': continue
                addr = next((x for x in tc if local(x.tag) == 'cellAddr'), None)
                if addr is None: continue
                r, c = int(addr.get('rowAddr')), int(addr.get('colAddr'))
                sub = next((x for x in tc if local(x.tag) == 'subList'), None)
                texts = [para_text(p) for p in (sub if sub is not None else []) if local(p.tag) == 'p']
                if r < rows and c < cols: grid[r][c] = ' / '.join(x for x in texts if x)
            blocks.append({'table': grid})
        elif t == 'p':
            # 문단 안에 표가 들어 있으면 표를 먼저 꺼내고, 표 밖 글자만 문단으로
            tbls = [x for x in ch.iter() if local(x.tag) == 'tbl']
            if tbls:
                own = []
                for run in ch:
                    for x in run:
                        if local(x.tag) == 't': own.append(x.text or '')
                if ''.join(own).strip(): blocks.append({'p': ''.join(own).strip()})
                for tb in tbls:
                    if not any(tb in anc.iter() for anc in tbls if anc is not tb):
                        walk_tbl = ET.Element('w'); walk_tbl.append(tb); walk(walk_tbl, blocks)
            else:
                txt = para_text(ch)
                if txt: blocks.append({'p': txt})
        else:
            walk(ch, blocks)

def parse(path):
    z = zipfile.ZipFile(path)
    names = sorted([n for n in z.namelist() if re.match(r'Contents/section\d+\.xml', n)], key=lambda n: int(re.findall(r'\d+', n)[0]))
    blocks = []
    for n in names: walk(ET.fromstring(z.read(n)), blocks)
    return blocks

if __name__ == '__main__':
    bl = parse(sys.argv[1])
    if len(sys.argv) > 2: json.dump(bl, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for b in bl:
        if 'p' in b: print('P:', b['p'][:150])
        else:
            print(f"TABLE {len(b['table'])}x{len(b['table'][0]) if b['table'] else 0}")
            for r in b['table']: print('  |', ' | '.join(x.replace('\n', ' / ') for x in r))
