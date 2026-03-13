const fs = require('fs');
let content = fs.readFileSync('app_v2.js', 'utf8');

// Replace the duplicate block blindly inserted by my previous patch
const badBlock = `
    const allBtns = els.cardButtons.querySelectorAll('.btn-card');
    allBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    const allBtns = els.cardButtons.querySelectorAll('.btn-card');
    allBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    btn.classList.remove('flash'); void btn.offsetWidth; btn.classList.add('flash');
`;

const goodBlock = `
    const allBtns = els.cardButtons.querySelectorAll('.btn-card');
    allBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    btn.classList.remove('flash'); void btn.offsetWidth; btn.classList.add('flash');
`;

// It might be duplicated in two places based on the grep output
content = content.replace(/    const allBtns = els\.cardButtons\.querySelectorAll\('\.btn-card'\);\n    allBtns\.forEach\(b => b\.classList\.remove\('active'\)\);\n    btn\.classList\.add\('active'\);\n    \n    const allBtns = els\.cardButtons\.querySelectorAll\('\.btn-card'\);\n    allBtns\.forEach\(b => b\.classList\.remove\('active'\)\);\n    btn\.classList\.add\('active'\);\n    btn\.classList\.remove\('flash'\); void btn\.offsetWidth; btn\.classList\.add\('flash'\);/g, goodBlock);

fs.writeFileSync('app_v2.js', content, 'utf8');
