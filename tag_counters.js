const fs = require('fs');
let code = fs.readFileSync('cards_db.js', 'utf8');

const counters = [
    'Exército de Esqueletos', 'Gangue de Goblins', 'Bárbaros', 'Lápide', 
    'Horda de Servos', 'Esqueletos', 'Guardas', 'Torre Inferno', 
    'Dragão Infernal', 'Mini P.E.K.K.A', 'Torre de Bombas', 'P.E.K.K.A', 
    'Megacavaleiro', 'Lançador', 'Caçador', 'Arqueiro Mágico', 'Goblin com Dardo', 'Canhão', 'Tesla', 'Príncipe'
];

let match;
const regex = /{([^}]+?name:\s*['"](.*?)['"][^}]+?)}/g;

code = code.replace(regex, (fullMatch, body, name) => {
    let normalizedName = name.trim();
    if (counters.includes(normalizedName) && !fullMatch.includes('isCounterToSpam')) {
        return fullMatch.replace('}', ', isCounterToSpam: true }');
    }
    return fullMatch;
});

fs.writeFileSync('cards_db.js', code);
console.log("Tagged cards.");
