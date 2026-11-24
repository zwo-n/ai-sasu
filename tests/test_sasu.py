"""scripts/sasu.py 동작 테스트 (질문 장부·팀 지식·성장 기록)."""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "sasu.py"


class SasuCase(unittest.TestCase):
    @staticmethod
    def qid(out):
        import re
        return re.search(r"Q-[0-9a-f]{4}", out).group(0)

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def run_cli(self, *args, now="2026-11-24", ok=True):
        env = {**os.environ, "SASU_NOW": now}
        r = subprocess.run(
            [sys.executable, str(SCRIPT), "--root", str(self.root), *args],
            capture_output=True, text=True, env=env,
        )
        if ok:
            self.assertEqual(r.returncode, 0, r.stderr)
        return r

    def read_jsonl(self, name):
        p = self.root / ".sasu" / name
        return [json.loads(l) for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]


class TestInit(SasuCase):
    def test_init_creates_files(self):
        self.run_cli("init")
        d = self.root / ".sasu"
        self.assertTrue((d / "questions.jsonl").exists())
        self.assertTrue((d / "growth.jsonl").exists())
        self.assertIn("# 팀 지식", (d / "knowledge.md").read_text(encoding="utf-8"))

    def test_init_twice_keeps_data(self):
        self.run_cli("init")
        self.run_cli("ask-log", "배포는 어떻게 해요?", "--who", "민지")
        self.run_cli("init")
        self.assertEqual(len(self.read_jsonl("questions.jsonl")), 1)

    def test_commands_auto_init(self):
        r = self.run_cli("ask-log", "질문", "--who", "민지")
        self.assertRegex(r.stdout, r"Q-[0-9a-f]{4}")

    def test_init_keeps_growth_out_of_git(self):
        self.run_cli("init")
        ignore = (self.root / ".sasu" / ".gitignore").read_text(encoding="utf-8")
        self.assertIn("growth.jsonl", ignore)

    def test_read_commands_do_not_create_ledger(self):
        for cmd in (["open"], ["search", "배포"], ["report", "--who", "민지"]):
            self.run_cli(*cmd)
        self.assertFalse((self.root / ".sasu").exists())


class TestQuestions(SasuCase):
    def test_ids_are_unique(self):
        ids = {self.qid(self.run_cli("ask-log", f"질문 {i}", "--who", "민지").stdout) for i in range(30)}
        self.assertEqual(len(ids), 30)

    def test_same_open_question_reuses_id(self):
        a = self.qid(self.run_cli("ask-log", "운영 배포는  누가 하나요?", "--who", "민지").stdout)
        r = self.run_cli("ask-log", "운영 배포는 누가 하나요?", "--who", "준호")
        self.assertEqual(self.qid(r.stdout), a)
        self.assertIn("이미", r.stdout)
        self.assertEqual(len(self.read_jsonl("questions.jsonl")), 1)

    def test_newlines_in_question_flattened(self):
        q = self.qid(self.run_cli("ask-log", "줄1\n## 가짜 제목", "--who", "민지").stdout)
        self.run_cli("answer", q, "답\n## 끼어든 제목\n끝", "--by", "팀장")
        out = self.run_cli("search", "줄1").stdout
        self.assertIn("가짜 제목", out)
        self.assertIn("끝", out)

    def test_merge_conflict_lines_skipped(self):
        q = self.qid(self.run_cli("ask-log", "살아남는 질문", "--who", "민지").stdout)
        f = self.root / ".sasu" / "questions.jsonl"
        f.write_text("<<<<<<< HEAD\n" + f.read_text(encoding="utf-8") + "=======\n>>>>>>> b\n", encoding="utf-8")
        r = self.run_cli("open")
        self.assertIn(q, r.stdout)
        self.assertIn("건너뜀", r.stderr)

    def test_duplicate_id_after_merge_can_be_closed(self):
        f = self.root / ".sasu"
        self.run_cli("init")
        rows = [{"id": "Q-aaaa", "question": f"질문{i}", "who": "민지", "context": None,
                 "date": "2026-11-24", "status": "open"} for i in (1, 2)]
        (f / "questions.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")
        self.run_cli("answer", "Q-aaaa", "답1", "--by", "팀장")
        self.run_cli("answer", "Q-aaaa", "답2", "--by", "팀장")
        self.assertIn("열린 질문 없음", self.run_cli("open").stdout)

    def test_open_lists_only_unanswered(self):
        a = self.qid(self.run_cli("ask-log", "결제 재시도는 몇 번?", "--who", "민지", "--context", "src/pay.py:40").stdout)
        b = self.qid(self.run_cli("ask-log", "스테이징 주소?", "--who", "준호").stdout)
        self.run_cli("answer", b, "staging.example.com 이에요", "--by", "팀장")
        out = self.run_cli("open").stdout
        self.assertIn(a, out)
        self.assertIn("src/pay.py:40", out)
        self.assertNotIn(b, out)

    def test_open_when_empty(self):
        self.assertIn("열린 질문 없음", self.run_cli("open").stdout)

    def test_answer_moves_to_knowledge(self):
        a = self.qid(self.run_cli("ask-log", "결제 재시도는 몇 번?", "--who", "민지").stdout)
        self.run_cli("answer", a, "3번, 지수 백오프. src/pay.py:40 참고", "--by", "팀장")
        q = self.read_jsonl("questions.jsonl")[0]
        self.assertEqual(q["status"], "answered")
        self.assertEqual(q["answered_by"], "팀장")
        kn = (self.root / ".sasu" / "knowledge.md").read_text(encoding="utf-8")
        self.assertIn("## 결제 재시도는 몇 번?", kn)
        self.assertIn("3번, 지수 백오프", kn)
        self.assertIn(a, kn)

    def test_answer_unknown_id_fails(self):
        r = self.run_cli("answer", "Q-ffff", "답", "--by", "팀장", ok=False)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("Q-ffff", r.stderr)

    def test_answer_twice_fails(self):
        a = self.qid(self.run_cli("ask-log", "질문", "--who", "민지").stdout)
        self.run_cli("answer", a, "답", "--by", "팀장")
        r = self.run_cli("answer", a, "다른 답", "--by", "팀장", ok=False)
        self.assertNotEqual(r.returncode, 0)

    def test_empty_question_rejected(self):
        r = self.run_cli("ask-log", "   ", "--who", "민지", ok=False)
        self.assertNotEqual(r.returncode, 0)


class TestSearch(SasuCase):
    def setUp(self):
        super().setUp()
        a = self.qid(self.run_cli("ask-log", "결제 재시도는 몇 번?", "--who", "민지").stdout)
        self.run_cli("answer", a, "3번, 지수 백오프", "--by", "팀장")
        b = self.qid(self.run_cli("ask-log", "스테이징 배포 방법?", "--who", "준호").stdout)
        self.run_cli("answer", b, "make deploy-staging", "--by", "팀장")

    def test_finds_matching_section(self):
        out = self.run_cli("search", "결제").stdout
        self.assertIn("결제 재시도", out)
        self.assertNotIn("스테이징", out)

    def test_case_insensitive_and_body_match(self):
        out = self.run_cli("search", "MAKE").stdout
        self.assertIn("스테이징 배포", out)

    def test_ranks_more_matches_first(self):
        out = self.run_cli("search", "결제", "스테이징", "배포").stdout
        self.assertIn("결제 재시도", out)
        self.assertLess(out.index("스테이징 배포"), out.index("결제 재시도"))

    def test_no_match(self):
        self.assertIn("팀 지식에 없음", self.run_cli("search", "쿠버네티스").stdout)

    def test_hand_written_knowledge_is_searched(self):
        kn = self.root / ".sasu" / "knowledge.md"
        kn.write_text(kn.read_text(encoding="utf-8") + "\n## 코드 리뷰 규칙\n승인 2명 필요\n", encoding="utf-8")
        self.assertIn("승인 2명", self.run_cli("search", "리뷰").stdout)


class TestGrowth(SasuCase):
    def lesson(self, who, topic, note, now):
        self.run_cli("lesson", "--who", who, "--topic", topic, "--note", note, now=now)

    def test_lesson_recorded(self):
        self.lesson("민지", "에러 처리", "빈 except", "2026-11-20")
        g = self.read_jsonl("growth.jsonl")[0]
        self.assertEqual((g["who"], g["topic"], g["date"]), ("민지", "에러 처리", "2026-11-20"))

    def test_report_counts_repeats_in_window(self):
        self.lesson("민지", "에러 처리", "빈 except", "2026-11-01")   # 창 밖
        self.lesson("민지", "에러 처리", "예외 삼킴", "2026-11-20")
        self.lesson("민지", "에러 처리", "로그 없음", "2026-11-22")
        self.lesson("민지", "네이밍", "data2", "2026-11-23")
        self.lesson("준호", "테스트", "없음", "2026-11-23")            # 다른 사람
        out = self.run_cli("report", "--who", "민지", "--days", "7").stdout
        self.assertIn("에러 처리 2회", out)
        self.assertIn("네이밍 1회", out)
        self.assertNotIn("빈 except", out)
        self.assertNotIn("테스트", out)
        self.assertTrue(out.index("에러 처리") < out.index("네이밍"))

    def test_report_flags_repeat_across_history(self):
        self.lesson("민지", "에러 처리", "빈 except", "2026-10-01")
        self.lesson("민지", "에러 처리", "예외 삼킴", "2026-11-22")
        out = self.run_cli("report", "--who", "민지", "--days", "7").stdout
        self.assertIn("이전에도 나온 주제", out)

    def test_report_empty(self):
        out = self.run_cli("report", "--who", "민지").stdout
        self.assertIn("기록 없음", out)

    def test_report_quiet_period_with_history(self):
        self.lesson("민지", "에러 처리", "빈 except", "2026-11-01")
        out = self.run_cli("report", "--who", "민지", "--days", "7").stdout
        self.assertIn("이번 기간 기록 없음", out)
        self.assertIn("전체 1건", out)
        self.assertIn("2026-11-01", out)

    def test_same_lesson_twice_is_skipped(self):
        for _ in range(2):
            self.run_cli("lesson", "--who", "민지", "--topic", "보안", "--note", "SQL 이어붙임",
                         "--source", "review:a.py:7")
        self.assertEqual(len(self.read_jsonl("growth.jsonl")), 1)

    def test_days_must_be_positive(self):
        r = self.run_cli("report", "--who", "민지", "--days", "0", ok=False)
        self.assertNotEqual(r.returncode, 0)

    def test_topic_normalized(self):
        self.lesson("민지", " 에러 처리 ", "a", "2026-11-20")
        self.lesson("민지", "에러 처리", "b", "2026-11-21")
        out = self.run_cli("report", "--who", "민지").stdout
        self.assertIn("에러 처리 2회", out)


class TestRootDetection(SasuCase):
    def test_defaults_to_git_toplevel(self):
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        sub = self.root / "src" / "deep"
        sub.mkdir(parents=True)
        env = {**os.environ, "SASU_NOW": "2026-11-24"}
        subprocess.run([sys.executable, str(SCRIPT), "init"], cwd=sub, env=env, check=True,
                       capture_output=True)
        self.assertTrue((self.root / ".sasu" / "knowledge.md").exists())
        self.assertFalse((sub / ".sasu").exists())


if __name__ == "__main__":
    unittest.main()
