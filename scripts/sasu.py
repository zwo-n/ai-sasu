#!/usr/bin/env python3
"""AI 사수 장부: 질문 장부 · 팀 지식 · 성장 기록.

데이터는 대상 저장소의 .sasu/ 에 둔다 (git 으로 팀과 공유).
  questions.jsonl  사수가 답하지 못한 질문 (open → answered)
  knowledge.md     팀이 답한 내용. 사수가 답하기 전에 먼저 찾아본다. 사람이 직접 고쳐도 된다.
  growth.jsonl     리뷰·디버깅에서 나온 배울 점 (사람별). 본인 것이라 git 에 올리지 않는다

질문 번호는 임의 4자리(Q-7f3a)라 브랜치마다 따로 기록해도 겹치지 않는다.

표준 라이브러리만 쓴다.
"""
import argparse
import datetime as dt
import json
import os
import re
import secrets
import subprocess
import sys
from pathlib import Path

KNOWLEDGE_HEADER = (
    "# 팀 지식\n\n"
    "사수가 질문에 답하기 전에 먼저 찾아보는 팀 답변 모음입니다.\n"
    "사람이 직접 고치거나 추가해도 됩니다. 항목은 `## 제목` 으로 나눕니다.\n"
)


def one_line(text):
    return re.sub(r"\s+", " ", text).strip()


def today():
    return dt.date.fromisoformat(os.environ.get("SASU_NOW") or dt.date.today().isoformat())


def find_root(explicit):
    if explicit:
        return Path(explicit)
    r = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True)
    return Path(r.stdout.strip()) if r.returncode == 0 else Path.cwd()


class Ledger:
    def __init__(self, root):
        self.dir = Path(root) / ".sasu"
        self.questions = self.dir / "questions.jsonl"
        self.growth = self.dir / "growth.jsonl"
        self.knowledge = self.dir / "knowledge.md"

    def exists(self):
        return self.dir.exists()

    def init(self):
        self.dir.mkdir(parents=True, exist_ok=True)
        for p in (self.questions, self.growth):
            p.touch(exist_ok=True)
        if not self.knowledge.exists():
            self.knowledge.write_text(KNOWLEDGE_HEADER, encoding="utf-8")
        ignore = self.dir / ".gitignore"
        if not ignore.exists():
            ignore.write_text("# 성장 기록은 본인 것이라 팀 저장소에 올리지 않는다\ngrowth.jsonl\n", encoding="utf-8")

    @staticmethod
    def _read(path):
        if not path.exists():
            return []
        rows = []
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip():
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                print(f"{path.name}:{n} 읽을 수 없는 줄 건너뜀 (병합 충돌 표시?): {line[:40]}", file=sys.stderr)
        return rows

    @staticmethod
    def _write(path, rows):
        path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")

    @staticmethod
    def _append(path, row):
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    # 질문 장부
    def ask_log(self, text, who, context=None):
        """새 번호를 돌려준다. 같은 열린 질문이 있으면 (그 번호, False)."""
        text = one_line(text)
        qs = self._read(self.questions)
        for q in qs:
            if q["status"] == "open" and q["question"] == text:
                return q["id"], False
        used = {q["id"] for q in qs}
        qid = f"Q-{secrets.token_hex(2)}"
        while qid in used:
            qid = f"Q-{secrets.token_hex(2)}"
        self._append(self.questions, {
            "id": qid, "question": text, "who": who, "context": context,
            "date": today().isoformat(), "status": "open",
        })
        return qid, True

    def open_questions(self):
        return [q for q in self._read(self.questions) if q["status"] == "open"]

    def answer(self, qid, text, by):
        qs = self._read(self.questions)
        same = [q for q in qs if q["id"] == qid]
        if not same:
            raise SystemExit(f"{qid}: 그런 질문이 없습니다")
        q = next((q for q in same if q["status"] == "open"), None)
        if q is None:
            raise SystemExit(f"{qid}: 이미 답한 질문입니다")
        text = re.sub(r"(?m)^#", "\\#", text.strip())
        q.update(status="answered", answer=text, answered_by=by, answered_date=today().isoformat())
        self._write(self.questions, qs)
        with self.knowledge.open("a", encoding="utf-8") as f:
            f.write(f"\n## {q['question']}\n{text}\n\n"
                    f"- 출처: {qid} · 질문 {q['who']} · 답 {by} · {q['answered_date']}\n")

    def search(self, terms):
        if not self.knowledge.exists():
            return []
        sections = self.knowledge.read_text(encoding="utf-8").split("\n## ")[1:]
        terms = [t.lower() for t in terms if t.strip()]
        scored = []
        for s in sections:
            low = s.lower()
            score = sum(1 for t in terms if t in low)
            if score:
                scored.append((score, "## " + s.strip()))
        scored.sort(key=lambda x: -x[0])
        return [s for _, s in scored[:5]]

    # 성장 기록
    def lesson(self, who, topic, note, source=None):
        """기록했으면 True. 같은 날 같은 출처·주제가 이미 있으면 False (다시 리뷰해도 횟수가 안 부풀게)."""
        row = {"date": today().isoformat(), "who": who, "topic": topic.strip(),
               "note": one_line(note), "source": source}
        def key(g):  # 출처가 있으면 출처로, 없으면 내용으로 같은 기록인지 본다
            return g["date"], g["who"], g["topic"], g.get("source") or g["note"]
        if any(key(g) == key(row) for g in self._read(self.growth)):
            return False
        self._append(self.growth, row)
        return True

    def report(self, who, days):
        end = today()
        start = end - dt.timedelta(days=days - 1)
        mine = [g for g in self._read(self.growth) if g["who"] == who]
        recent = [g for g in mine if start <= dt.date.fromisoformat(g["date"]) <= end]
        before = {g["topic"] for g in mine if dt.date.fromisoformat(g["date"]) < start}
        head = f"# {who} 성장 리포트 ({start} ~ {end}, {days}일)\n"
        if not mine:
            return head + "\n기록 없음\n"
        if not recent:
            last = max(g["date"] for g in mine)
            return head + f"\n이번 기간 기록 없음 (전체 {len(mine)}건, 마지막 {last})\n"
        counts = {}
        for g in recent:
            counts[g["topic"]] = counts.get(g["topic"], 0) + 1
        lines = [head, "## 자주 나온 주제"]
        for topic, n in sorted(counts.items(), key=lambda x: -x[1]):
            mark = " — 이전에도 나온 주제" if topic in before else ""
            lines.append(f"- {topic} {n}회{mark}")
        lines.append("\n## 기록")
        for g in sorted(recent, key=lambda g: g["date"], reverse=True):
            src = f" ({g['source']})" if g.get("source") else ""
            lines.append(f"- {g['date']} [{g['topic']}] {g['note']}{src}")
        return "\n".join(lines) + "\n"


def main(argv=None):
    p = argparse.ArgumentParser(prog="sasu", description="AI 사수 장부")
    p.add_argument("--root", help="저장소 루트 (기본: git 최상위, 없으면 현재 폴더)")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("init", help=".sasu/ 만들기")
    a = sub.add_parser("ask-log", help="사수가 답하지 못한 질문 기록")
    a.add_argument("question")
    a.add_argument("--who", required=True)
    a.add_argument("--context", help="관련 파일:줄 등")
    sub.add_parser("open", help="열린 질문 목록")
    a = sub.add_parser("answer", help="질문에 답하고 팀 지식에 추가")
    a.add_argument("id")
    a.add_argument("answer")
    a.add_argument("--by", required=True)
    a = sub.add_parser("search", help="팀 지식 검색")
    a.add_argument("terms", nargs="+")
    a = sub.add_parser("lesson", help="배울 점 기록")
    a.add_argument("--who", required=True)
    a.add_argument("--topic", required=True)
    a.add_argument("--note", required=True)
    a.add_argument("--source", help="예: review:src/pay.py:40")
    a = sub.add_parser("report", help="성장 리포트")
    a.add_argument("--who", required=True)
    a.add_argument("--days", type=int, default=7)
    args = p.parse_args(argv)

    if args.cmd == "report" and args.days < 1:
        raise SystemExit("--days 는 1 이상이어야 합니다")
    led = Ledger(find_root(args.root))
    if args.cmd in ("init", "ask-log", "answer", "lesson"):
        led.init()

    if args.cmd == "init":
        print(f"{led.dir} 준비됨")
    elif args.cmd == "ask-log":
        if not args.question.strip():
            raise SystemExit("질문이 비어 있습니다")
        qid, new = led.ask_log(args.question, args.who, args.context)
        print(f"{qid} 기록함" if new else f"{qid} 이미 열려 있는 같은 질문")
    elif args.cmd == "open":
        qs = led.open_questions()
        if not qs:
            print("열린 질문 없음")
        for q in qs:
            ctx = f" [{q['context']}]" if q.get("context") else ""
            print(f"{q['id']} {q['date']} {q['who']}: {q['question']}{ctx}")
    elif args.cmd == "answer":
        led.answer(args.id, args.answer, args.by)
        print(f"{args.id} 답함, 팀 지식에 추가")
    elif args.cmd == "search":
        hits = led.search(args.terms)
        print("\n\n".join(hits) if hits else "팀 지식에 없음")
    elif args.cmd == "lesson":
        print("기록함" if led.lesson(args.who, args.topic, args.note, args.source) else "이미 기록됨")
    elif args.cmd == "report":
        print(led.report(args.who, args.days), end="")


if __name__ == "__main__":
    sys.exit(main())
