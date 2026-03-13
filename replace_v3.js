const fs = require('fs');

let content = fs.readFileSync('app_v2.js', 'utf8');

const regex1 = /function processVoiceTranscript\(transcript, resultIndex = -1\) \{[\s\S]*?handleVoicePlay\(parsed\.cost, parsed\.cardText\);\n\}/;
const newCode1 = fs.readFileSync('patch_v3.js', 'utf8');

let c1 = content.replace(regex1, newCode1.trim());

fs.writeFileSync('app_v2.js', c1, 'utf8');
console.log("Success");
