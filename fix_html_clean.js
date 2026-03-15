const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// remove duplicated old versions
html = html.replace(/<div id="version"[^>]*>v31<\/div>/, '');

// fix the weird comment
html = html.replace(/<-\s*This fixes the 'Could not resolve script-loader!sql.js' ALERTA DE VULNERABILIDADE -->/, '<!-- ALERTA DE VULNERABILIDADE -->');

fs.writeFileSync('index.html', html);
