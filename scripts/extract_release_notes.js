const fs = require('fs');
const path = require('path');

const tagOrVersion = process.argv[2] || process.env.GITHUB_REF_NAME || '';
const version = tagOrVersion.replace(/^v/, '').trim();

if (!version) {
  console.error('Usage: node scripts/extract_release_notes.js <version-or-tag>');
  process.exit(1);
}

const changelogPath = path.resolve(__dirname, '../CHANGELOG.md');
if (!fs.existsSync(changelogPath)) {
  console.error('CHANGELOG.md not found at ' + changelogPath);
  process.exit(1);
}

const changelog = fs.readFileSync(changelogPath, 'utf-8');
const regex = new RegExp('## \\[' + version + '\\][^\\r\\n]*\\r?\\n([\\s\\S]*?)(?=\\r?\\n## |$)');
const match = changelog.match(regex);

let notes = '';
if (match && match[1]) {
  notes = match[1].trim();
} else {
  notes = `Release v${version}\n\nSee [CHANGELOG.md](https://github.com/lylyuanliang/agent-feedback/blob/main/CHANGELOG.md) for full details.`;
}

const outputPath = path.resolve(__dirname, '../RELEASE_NOTES.md');
fs.writeFileSync(outputPath, notes, 'utf-8');
console.log(`[extract_release_notes] Successfully generated RELEASE_NOTES.md for v${version} (${notes.length} chars)`);
