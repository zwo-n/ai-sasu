"""플러그인 구조 테스트: 스킬·에이전트·스크립트가 서로 어긋나지 않는지."""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AGENT = ROOT / "agents" / "senior-dev.md"
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


if __name__ == "__main__":
    unittest.main()
