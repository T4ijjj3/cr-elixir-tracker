const fs = require('fs');

let content = fs.readFileSync('app_v2.js', 'utf8');

const regex = /function processVoiceTranscript\(transcript\) \{[\s\S]*?handleVoicePlay\(parsed\.cost, parsed\.cardText\);\n\}/;
const newCode = fs.readFileSync('patch_process2.js', 'utf8');

if (regex.test(content)) {
    content = content.replace(regex, newCode.trim());
    fs.writeFileSync('app_v2.js', content, 'utf8');
    console.log("Success");
} else {
    console.log("Not found");
}
