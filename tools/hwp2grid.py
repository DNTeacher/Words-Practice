"""HWP 5.0 본문을 문단·표(칸 위치 포함)로 꺼낸다. 사용: python3 hwp2grid.py 파일.hwp [out.json]"""
import sys, zlib, struct, json
sys.path.insert(0, "/root/vendor/olefile")
import olefile

PARA_TEXT, CTRL_HEADER, LIST_HEADER, TABLE = 67, 71, 72, 77
EXT = {1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23}
INL = {4, 5, 6, 7, 8, 9, 19, 20}

def records(buf):
    i = 0
    while i + 4 <= len(buf):
        h = struct.unpack_from("<I", buf, i); h = h[0]; i += 4
        tag, lvl, size = h & 0x3FF, (h >> 10) & 0x3FF, (h >> 20) & 0xFFF
        if size == 0xFFF: size = struct.unpack_from("<I", buf, i)[0]; i += 4
        yield tag, lvl, buf[i:i + size]; i += size

def para_text(data):
    out, i, n = [], 0, len(data) // 2
    while i < n:
        c = struct.unpack_from("<H", data, i * 2)[0]
        if c < 32:
            if c in EXT or c in INL:
                if c == 9: out.append("\t")
                i += 8; continue
            if c == 10: out.append("\n")
            i += 1; continue
        out.append(chr(c)); i += 1
    return "".join(out).strip()

def parse(path):
    ole = olefile.OleFileIO(path)
    flags = struct.unpack("<I", ole.openstream("FileHeader").read()[36:40])[0]
    if flags & 2: raise SystemExit("암호가 걸린 HWP 파일입니다")
    secs = sorted([e for e in ole.listdir() if e[0] == "BodyText"], key=lambda e: int(e[1][7:]))
    blocks = []
    for s in secs:
        raw = ole.openstream("/".join(s)).read()
        buf = zlib.decompress(raw, -15) if flags & 1 else raw
        stack = []  # 열린 표: {lvl, rows, cols, cells, cur}
        pending_tbl = None
        for tag, lvl, data in records(buf):
            while stack and lvl <= stack[-1]["lvl"]:
                t = stack.pop(); blocks.append({"table": t["grid"]}) if not stack else stack[-1]["cur"]["text"].append("[표]")
            if tag == CTRL_HEADER:
                pending_tbl = lvl if data[:4][::-1] == b"tbl " else None
            elif tag == TABLE and pending_tbl is not None:
                rows, cols = struct.unpack_from("<HH", data, 4)
                stack.append({"lvl": pending_tbl, "rows": rows, "cols": cols, "grid": [[""] * cols for _ in range(rows)], "cur": None})
                pending_tbl = None
            elif tag == LIST_HEADER and stack and lvl == stack[-1]["lvl"] + 1:
                col, row, cs, rs = struct.unpack_from("<HHHH", data, 8)
                t = stack[-1]
                cell = {"text": [], "row": row, "col": col}
                t["cur"] = cell
                if row < t["rows"] and col < t["cols"]: t["grid"][row][col] = cell
            elif tag == PARA_TEXT:
                txt = para_text(data)
                if stack and stack[-1]["cur"] is not None:
                    stack[-1]["cur"]["text"].append(txt)
                elif txt:
                    blocks.append({"p": txt})
        while stack:
            t = stack.pop()
            if not stack: blocks.append({"table": t["grid"]})
    for b in blocks:
        if "table" in b:
            b["table"] = [[" / ".join(x for x in c["text"] if x) if isinstance(c, dict) else c for c in r] for r in b["table"]]
    return blocks

if __name__ == "__main__":
    bl = parse(sys.argv[1])
    if len(sys.argv) > 2: json.dump(bl, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for b in bl:
        if "p" in b: print("P:", b["p"])
        else:
            print(f"TABLE {len(b['table'])}x{len(b['table'][0]) if b['table'] else 0}")
            for r in b["table"]: print("  |", " | ".join(r))
