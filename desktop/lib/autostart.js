// 맥에 로그인하면 사수를 다시 켠다. `npm start`(개발 모드)로 켜도 되게 LaunchAgent plist 로 만든다.
const LABEL = 'com.ai-sasu.buddy';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// program: 실행 파일(process.execPath), args: 개발 모드면 [앱 폴더], 패키지 앱이면 []
function launchAgentPlist(program, args = []) {
  const items = [program, ...args].map(a => `    <string>${esc(a)}</string>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${items}
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
`;
}

module.exports = { LABEL, launchAgentPlist };
