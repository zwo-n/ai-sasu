"""플러그인 구조 테스트: 스킬·에이전트·스크립트가 서로 어긋나지 않는지."""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AGENT = ROOT / "agents" / "senior-dev.md"
CHECKER = ROOT / "agents" / "review-checker.md"
SKILLS = sorted((ROOT / "skills").glob("*/SKILL.md"))
EXPECTED_SKILLS = {"onboard", "review", "debug", "ask", "design", "growth"}
SCRIPT_CMDS = {"init", "ask-log", "open", "answer", "search", "lesson", "report"}


def frontmatter(path):
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    assert m, f"{path}: frontmatter 없음"
    fm = {}
    for line in m.group(1).splitlines():
        k, _, v = line.partition(":")
        fm[k.strip()] = v.strip().strip('"')
    return fm, text[m.end():]


def topic_list():
    text = AGENT.read_text(encoding="utf-8")
    m = re.search(r"주제는 아래 중에서만 고른다.*?\n\s+(.+)\n", text)
    return {t.strip() for t in m.group(1).split("·")}


class TestManifest(unittest.TestCase):
    def test_plugin_and_marketplace_agree(self):
        plugin = json.loads((ROOT / ".claude-plugin" / "plugin.json").read_text())
        market = json.loads((ROOT / ".claude-plugin" / "marketplace.json").read_text())
        self.assertEqual(plugin["name"], "sasu")
        entry = market["plugins"][0]
        self.assertEqual(entry["name"], plugin["name"])
        self.assertEqual(entry["version"], plugin["version"])


class TestSkills(unittest.TestCase):
    def test_expected_skills_exist(self):
        self.assertEqual({p.parent.name for p in SKILLS}, EXPECTED_SKILLS)

    def test_frontmatter(self):
        for p in SKILLS:
            fm, _ = frontmatter(p)
            with self.subTest(skill=p.parent.name):
                self.assertEqual(fm.get("name"), p.parent.name)
                self.assertTrue(fm.get("description"))
                self.assertLessEqual(len(fm["description"]), 300, "설명이 길면 매 세션 컨텍스트를 차지함")

    def test_every_skill_loads_the_mentor_principles(self):
        for p in SKILLS:
            with self.subTest(skill=p.parent.name):
                self.assertIn("${CLAUDE_PLUGIN_ROOT}/agents/senior-dev.md", p.read_text(encoding="utf-8"))

    def test_agent_routes_to_every_skill(self):
        text = AGENT.read_text(encoding="utf-8")
        for name in EXPECTED_SKILLS:
            self.assertIn(f"`{name}`", text)


class TestDocsMatchScript(unittest.TestCase):
    DOCS = [AGENT, *SKILLS]

    def test_ledger_commands_exist(self):
        pat = re.compile(r'sasu\.py"?[ \t]+([a-z-]+)|"\$S"[ \t]+([a-z-]+)')
        for p in self.DOCS:
            for m in pat.finditer(p.read_text(encoding="utf-8")):
                cmd = m.group(1) or m.group(2)
                with self.subTest(file=p.name, cmd=cmd):
                    self.assertIn(cmd, SCRIPT_CMDS)

    def test_ledger_called_by_full_path(self):
        # 데스크톱 앱은 sasu.py 의 정확한 경로만 허용한다. 변수에 담으면 거부된다.
        for p in self.DOCS:
            with self.subTest(file=p.name):
                self.assertNotIn('"$S"', p.read_text(encoding="utf-8"))

    def test_example_topics_are_from_fixed_list(self):
        topics = topic_list()
        self.assertIn("에러 처리", topics)
        for p in self.DOCS:
            for t in re.findall(r'--topic\s+"([^"]+)"', p.read_text(encoding="utf-8")):
                with self.subTest(file=p.name, topic=t):
                    self.assertIn(t, topics)


class TestReviewChecker(unittest.TestCase):
    """[반드시] 지적은 기록·판정 전에 다른 눈(review-checker)이 다시 확인한다."""

    def test_checker_agent_is_read_only(self):
        fm, body = frontmatter(CHECKER)
        self.assertEqual(fm.get("name"), "review-checker")
        tools = {t.strip() for t in fm.get("tools", "").split(",")}
        self.assertTrue(tools, "tools 를 적어 범위를 좁힌다")
        self.assertFalse(tools & {"Edit", "Write", "NotebookEdit", "WebFetch", "WebSearch"})
        for verdict in ("확인됨", "틀림", "불확실"):
            self.assertIn(verdict, body)

    def test_review_calls_checker_before_recording(self):
        text = (ROOT / "skills" / "review" / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("sasu:review-checker", text)
        self.assertLess(text.index("sasu:review-checker"), text.index("## 4. 기록"),
                        "틀린 지적이 성장 기록에 남지 않게 기록보다 먼저 확인한다")


class TestReviewFormat(unittest.TestCase):
    def test_review_sections_match_desktop_summary(self):
        # desktop/lib/summary.js 가 이 칸 이름과 "### 번호. [등급]"을 읽어 말풍선을 만든다
        text = (ROOT / "skills" / "review" / "SKILL.md").read_text(encoding="utf-8")
        for h in ("## 잘한 점", "## 아쉬운 점", "## 꼭 고칠 점", "## 판정"):
            self.assertIn(h, text)
        self.assertLess(text.index("## 아쉬운 점"), text.index("## 꼭 고칠 점"))
        self.assertNotIn("## 문제점", text)
        summary = (ROOT / "desktop" / "lib" / "summary.js").read_text(encoding="utf-8")
        self.assertIn("'잘한 점'", summary)



class TestTone(unittest.TestCase):
    def test_mentor_speaks_danakka_with_name(self):
        text = AGENT.read_text(encoding="utf-8")
        tone = text[text.index("## 말투"):text.index("## 장부")]
        self.assertIn("다나까체", tone)
        self.assertIn("님", tone)
        self.assertIn("응원", tone)
        self.assertNotIn('존댓말("~요")', tone)

    def test_sasu_example_lines_are_not_haeyo(self):
        # 사수가 하는 말의 예시는 다나까체. 팀원이 하는 말(트리거 문구 등)은 그대로 둔다
        lines = {
            "review": ['"없습니다" 한 줄', '고친 뒤에 보겠습니다"'],
            "debug": ['"어디가 의심됩니까?"'],
            "ask": ['"이렇게 찾았습니다"'],
            "growth": ['"아직 기록이 없습니다.'],
        }
        for skill, needles in lines.items():
            text = (ROOT / "skills" / skill / "SKILL.md").read_text(encoding="utf-8")
            for n in needles:
                self.assertIn(n, text, f"{skill}: {n}")


if __name__ == "__main__":
    unittest.main()
