const fs = require('fs');

let content = fs.readFileSync('app_v2.js', 'utf8');

const regex1 = /function processVoiceTranscript\(transcript\) \{[\s\S]*?handleVoicePlay\(parsed\.cost, parsed\.cardText\);\n\}/;
const newCode1 = fs.readFileSync('patch_v2.js', 'utf8');

const regex2 = /recognition\.onresult = \(event\) => \{[\s\S]*?processVoiceTranscript\(transcript\);\n        \}\n    \};/;
const newCode2 = fs.readFileSync('patch_onresult.js', 'utf8');

let c1 = content.replace(regex1, newCode1.trim());
let c2 = c1.replace(regex2, newCode2.trim());

fs.writeFileSync('app_v2.js', c2, 'utf8');
console.log("Success");
