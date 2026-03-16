/**
 * Clash Royale — Card Database + Meta Decks (March 2026 — Season 81)
 *
 * Cards organized by elixir cost.
 * Meta decks define the top 10 most used decks, used for probability scoring.
 * When a card is identified, decks containing it score higher, making
 * remaining deck cards appear first in suggestions.
 */

// ─── Top 10 Meta Decks (March 2026) ─────────────────────
// Order: most popular → least. Each has a weight for scoring.

const META_DECKS = [
    { name: 'PEKKA BS Mágico', weight: 15, cards: ['P.E.K.K.A', 'Aríete de Batalha', 'Bandida', 'Fantasma Real', 'Mago Elétrico', 'Flechas', 'Vácuo', 'Arqueiro Mágico'] },
    { name: 'PEKKA BS Servos', weight: 14, cards: ['P.E.K.K.A', 'Aríete de Batalha', 'Bandida', 'Fantasma Real', 'Mago Elétrico', 'Bola de Fogo', 'Zap', 'Servos'] },
    { name: 'PEKKA BS Príncipe', weight: 12, cards: ['P.E.K.K.A', 'Aríete de Batalha', 'Bandida', 'Fantasma Real', 'Mago Elétrico', 'Veneno', 'Vácuo', 'Pequeno Príncipe'] },
    { name: 'Log Bait Clássico', weight: 15, cards: ['Barril de Goblins', 'Princesa', 'Cavaleiro', 'Gangue de Goblins', 'Torre Inferno', 'Foguete', 'O Tronco', 'Espírito de Gelo'] },
    { name: 'Log Bait Tesla', weight: 14, cards: ['Barril de Goblins', 'Princesa', 'Cavaleiro', 'Gangue de Goblins', 'Tesla', 'Foguete', 'O Tronco', 'Espírito de Gelo'] },
    { name: 'Log Bait Valquíria', weight: 13, cards: ['Barril de Goblins', 'Princesa', 'Valquíria', 'Gangue de Goblins', 'Torre Inferno', 'Foguete', 'O Tronco', 'Espírito de Gelo'] },
    { name: 'Log Bait Príncipe', weight: 10, cards: ['Barril de Goblins', 'Princesa', 'Príncipe', 'Pescador', 'Tesla', 'Foguete', 'O Tronco', 'Espíritos de Fogo'] },
    { name: '2.6 Hog Cycle Clássico', weight: 15, cards: ['Corredor', 'Mosqueteira', 'Canhão', 'Esqueletos', 'Espírito de Gelo', 'Bola de Fogo', 'O Tronco', 'Golem de Gelo'] },
    { name: 'Hog EQ Pirotécnica', weight: 14, cards: ['Corredor', 'Pirotécnica', 'Terremoto', 'O Tronco', 'Esqueletos', 'Espírito de Gelo', 'Tesla', 'Cavaleiro'] },
    { name: 'Hog Exe Nado', weight: 10, cards: ['Corredor', 'Executor', 'Tornado', 'Valquíria', 'Foguete', 'O Tronco', 'Esqueletos', 'Espírito de Gelo'] },
    { name: 'LavaLoon Lápide', weight: 13, cards: ['Lava Hound', 'Balão', 'Mineiro', 'Dragões Esqueleto', 'Guardas', 'Bola de Fogo', 'Zap', 'Lápide'] },
    { name: 'LavaLoon Dragão Infernal', weight: 12, cards: ['Lava Hound', 'Balão', 'Mineiro', 'Bebê Dragão', 'Dragão Infernal', 'Bola de Fogo', 'Zap', 'Lápide'] },
    { name: 'LavaLoon Lenhador', weight: 10, cards: ['Lava Hound', 'Balão', 'Lenhador', 'Mago Elétrico', 'Megasservo', 'Flechas', 'Zap', 'Lápide'] },
    { name: 'Golem Clássico', weight: 12, cards: ['Golem', 'Bruxa Sombria', 'Pequeno Príncipe', 'Eletrocutadores', 'Relâmpago', 'Tornado', 'Barril de Bárbaro', 'Bebê Dragão'] },
    { name: 'Golem Lenhador', weight: 11, cards: ['Golem', 'Bruxa Sombria', 'Lenhador', 'Bebê Dragão', 'Megasservo', 'Relâmpago', 'Tornado', 'Barril de Bárbaro'] },
    { name: 'Miner Poison Bomb', weight: 13, cards: ['Mineiro', 'Veneno', 'Torre de Bombas', 'Valquíria', 'Morcegos', 'Esqueletos', 'O Tronco', 'Pirotécnica'] },
    { name: 'Miner Wall Breakers', weight: 14, cards: ['Mineiro', 'Destruidores de Muros', 'Morcegos', 'Lápide', 'Pequeno Príncipe', 'Veneno', 'O Tronco', 'Valquíria'] },
    { name: 'Miner WB Cavaleiro', weight: 11, cards: ['Mineiro', 'Destruidores de Muros', 'Morcegos', 'Lápide', 'Cavaleiro', 'Veneno', 'O Tronco', 'Pirotécnica'] },
    { name: 'RG Fisherman Hunter', weight: 13, cards: ['Gigante Real', 'Pescador', 'Caçador', 'Esqueletos', 'Espírito Curador', 'Bola de Fogo', 'O Tronco', 'Fantasma Real'] },
    { name: 'RG Fisherman Fênix', weight: 11, cards: ['Gigante Real', 'Pescador', 'Fênix', 'Esqueletos', 'Espírito Curador', 'Bola de Fogo', 'O Tronco', 'Mago Elétrico'] },
    { name: 'X-Bow 3.0', weight: 11, cards: ['x-Besta', 'Arqueiras', 'Cavaleiro', 'Esqueletos', 'Espírito de Gelo', 'Tesla', 'Bola de Fogo', 'O Tronco'] },
    { name: 'X-Bow Pump', weight: 8, cards: ['x-Besta', 'Coletor de Elixir', 'Arqueiras', 'Cavaleiro', 'Esqueletos', 'Espírito de Gelo', 'Tesla', 'O Tronco'] },
    { name: 'Splashyard Clássico', weight: 14, cards: ['Cemitério', 'Veneno', 'Tornado', 'Barril de Bárbaro', 'Bebê Dragão', 'Mago de Gelo', 'Torre de Bombas', 'Rei Esqueleto'] },
    { name: 'Splashyard Veneno', weight: 12, cards: ['Cemitério', 'Veneno', 'Tornado', 'Barril de Bárbaro', 'Bebê Dragão', 'Mago de Gelo', 'Lápide', 'Pequeno Príncipe'] },
    { name: 'LumberLoon Freeze', weight: 13, cards: ['Lenhador', 'Balão', 'Dragão Infernal', 'Lançador', 'Fênix', 'Gelo', 'Tornado', 'Barril de Bárbaro'] },
    { name: 'LumberLoon Bowler', weight: 11, cards: ['Lenhador', 'Balão', 'Lançador', 'Bebê Dragão', 'Mago de Gelo', 'Gelo', 'Tornado', 'Barril de Bárbaro'] },
    { name: 'MK Bait Clássico', weight: 13, cards: ['Megacavaleiro', 'Mineiro', 'Barril de Esqueletos', 'Gangue de Goblins', 'Morcegos', 'Pirotécnica', 'Zap', 'Bola de Neve'] },
    { name: 'MK Bait Príncipe', weight: 11, cards: ['Megacavaleiro', 'Mineiro', 'Barril de Esqueletos', 'Gangue de Goblins', 'Morcegos', 'Príncipe', 'Zap', 'Bola de Neve'] },
    { name: 'E-Giant Lightning', weight: 12, cards: ['Gigante Elétrico', 'Príncipe das Trevas', 'Dragão Infernal', 'Lançador', 'Tornado', 'Relâmpago', 'Barril de Bárbaro', 'Mago Elétrico'] },
    { name: 'E-Giant Bowler', weight: 10, cards: ['Gigante Elétrico', 'Lançador', 'Fênix', 'Tornado', 'Relâmpago', 'Barril de Bárbaro', 'Espíritos de Fogo', 'Pequeno Príncipe'] },
    { name: 'Sparky GG', weight: 12, cards: ['Goblin Gigante', 'Sparky', 'Fênix', 'Príncipe das Trevas', 'Mago Elétrico', 'Fúria', 'Zap', 'Curadora Guerreira'] },
    { name: 'Sparky GG Mini PEKKA', weight: 10, cards: ['Goblin Gigante', 'Sparky', 'Mini PEKKA', 'Fênix', 'Mago Elétrico', 'Fúria', 'Zap', 'Eletrocutadores'] },
    { name: 'Drill Marcher', weight: 12, cards: ['Escavadeira de Goblins', 'Arqueiro Mágico', 'Cavaleiro', 'Tornado', 'Torre de Bombas', 'Guardas', 'Veneno', 'O Tronco'] },
    { name: 'Drill Controle Clássico', weight: 11, cards: ['Escavadeira de Goblins', 'Pequeno Príncipe', 'Cavaleiro', 'Tornado', 'Mago de Gelo', 'Guardas', 'Veneno', 'O Tronco'] },
    { name: 'Recruits Hogs Zappies', weight: 12, cards: ['Recrutas Reais', 'Porcos Reais', 'Eletrocutadores', 'Máquina Voadora', 'Goblin com Dardos', 'Terremoto', 'O Tronco', 'Pequeno Príncipe'] },
    { name: 'Recruits Hogs Piro', weight: 10, cards: ['Recrutas Reais', 'Porcos Reais', 'Eletrocutadores', 'Máquina Voadora', 'Pirotécnica', 'Terremoto', 'O Tronco', 'Espíritos de Fogo'] },
    { name: 'Giant 2P Classico', weight: 11, cards: ['Gigante', 'Príncipe', 'Príncipe das Trevas', 'Fênix', 'Mago Elétrico', 'Flechas', 'Zap', 'Mineiro'] },
    { name: 'Mortar Bait Cannon Cart', weight: 11, cards: ['Morteiro', 'Mineiro', 'Gangue de Goblins', 'Horda de Servos', 'Carrinho de Canhão', 'Goblin com Dardos', 'Bola de Fogo', 'O Tronco'] },
    { name: 'E-Golem Healer', weight: 12, cards: ['Golem de Elixir', 'Curadora Guerreira', 'Dragão Elétrico', 'Fúria', 'Tornado', 'Bebê Dragão', 'Eletrocutadores', 'Zap'] },
    { name: 'E-Golem Fênix', weight: 11, cards: ['Golem de Elixir', 'Curadora Guerreira', 'Dragão Elétrico', 'Fúria', 'Tornado', 'Fênix', 'Eletrocutadores', 'Zap'] },
    { name: '3M Pump Hogs', weight: 10, cards: ['Três Mosqueteiras', 'Coletor de Elixir', 'Porcos Reais', 'Fantasma Real', 'Golem de Gelo', 'Curadora Guerreira', 'O Tronco', 'Bola de Neve'] },
    { name: 'Bowler GY Freeze', weight: 10, cards: ['Cemitério', 'Lançador', 'Bebê Dragão', 'Mago de Gelo', 'Tornado', 'Gelo', 'Barril de Bárbaro', 'Lápide'] },
];

// ─── Full Card Database ──────────────────────────────────
// All cards grouped by cost. Type: T=troop, S=spell, B=building, C=champion, H=hero.

const ALL_CARDS = [
    // 0 de Elixir (Torres)
    { name: 'Canhoneiro', cost: 0, type: 'T', image: 'images/Carta Tropa De Torre Canhoneiro.png' },
    { name: 'Cozinheiro Real', cost: 0, type: 'T', image: 'images/Carta Tropa De Torre Cozinheiro Real.png' },
    { name: 'Duquesa das Adagas', cost: 0, type: 'T', image: 'images/Carta Tropa De Torre Duquesa Das Adagas.png' },
    { name: 'Princesa da Torre', cost: 0, type: 'T', image: 'images/Carta Tropa De Torre Princesa.png' },

    // 1 de Elixir
    // Espelho tem custo variável (+1 em cima da carta anterior), mas para
    // indexação/identificação usamos custo base 1.
    { name: 'Espelho', cost: 1, type: 'S', image: 'images/Espelho.png' },
    { name: 'Espírito Curador', cost: 1, type: 'T', image: 'images/Espirito Curador.png' },
    { name: 'Espíritos de Fogo', cost: 1, type: 'T', image: 'images/Espíritos de Fogo.png' },
    { name: 'Espírito de Gelo', cost: 1, type: 'T', image: 'images/Espírito de Gelo.png' },
    { name: 'Espírito Elétrico', cost: 1, type: 'T', image: 'images/Espírito Elétrico.png' },
    { name: 'Esqueletos', cost: 1, type: 'T', image: 'images/Esqueletos.png', isCounterToSpam: true },

    // 2 de Elixir
    { name: 'Arbusto Traiçoeiro', cost: 2, type: 'T', image: 'images/Goblins.png' },
    { name: 'Barril de Bárbaro', cost: 2, type: 'S', image: 'images/Barril de Bárbaro.png' },
    { name: 'Berserker', cost: 2, type: 'T', image: 'images/Carta Comum Berserker.png' },
    { name: 'Bola de Neve', cost: 2, type: 'S', image: 'images/Bola de Neve.png' },
    { name: 'Bombardeiro', cost: 2, type: 'T', image: 'images/Bombardeiro.png' },
    { name: 'Destruidores de Muros', cost: 2, type: 'T', image: 'images/Destruidores de Muros.png' },
    { name: 'Fúria', cost: 2, type: 'S', image: 'images/Fúria.png' },
    { name: 'Goblins', cost: 2, type: 'T', image: 'images/Goblins.png' },
    { name: 'Goblins Lanceiros', cost: 2, type: 'T', image: 'images/Goblins lanceiros.png' },
    { name: 'Golem de Gelo', cost: 2, type: 'T', image: 'images/Golem de Gelo.png' },
    { name: 'Maldição Goblin', cost: 2, type: 'S', image: 'images/Vinhas.png' },
    { name: 'Morcegos', cost: 2, type: 'T', image: 'images/Morcegos.png' },
    { name: 'O Tronco', cost: 2, type: 'S', image: 'images/O Tronco.png' },
    { name: 'Zap', cost: 2, type: 'S', image: 'images/Choque (Zap).png' },

    // 3 de Elixir
    { name: 'Arqueiras', cost: 3, type: 'T', image: 'images/Arqueiras.png' },
    { name: 'Bandida', cost: 3, type: 'T', image: 'images/Bandida.png' },
    { name: 'Barril de Esqueletos', cost: 3, type: 'T', image: 'images/Barril de Esqueletos.png' },
    { name: 'Barril de Goblins', cost: 3, type: 'S', image: 'images/Barril de Goblins.png' },
    { name: 'Canhão', cost: 3, type: 'B', image: 'images/Canhão.png', isCounterToSpam: true },
    { name: 'Cavaleiro', cost: 3, type: 'T', image: 'images/Cavaleiro.png' },
    { name: 'Clone', cost: 3, type: 'S', image: 'images/Clone.png' },
    { name: 'Vinhas', cost: 3, type: 'S', image: 'images/Vinhas.png' },
    { name: 'Encomenda Real', cost: 3, type: 'S', image: 'images/Encomenda Real.png' },
    { name: 'Exército de Esqueletos', cost: 3, type: 'T', image: 'images/Exército de Esqueletos.png', isCounterToSpam: true },
    { name: 'Fantasma Real', cost: 3, type: 'T', image: 'images/Fantasma Real.png' },
    { name: 'Vácuo', cost: 3, type: 'S', image: 'images/Vácuo.png' },
    { name: 'Flechas', cost: 3, type: 'S', image: 'images/Flechas.png' },
    { name: 'Gangue de Goblins', cost: 3, type: 'T', image: 'images/Gangue de Goblins.png', isCounterToSpam: true },
    { name: 'Goblin com Dardos', cost: 3, type: 'T', image: 'images/Goblin com Dardos.png' },
    { name: 'Golem de Elixir', cost: 3, type: 'T', image: 'images/Golem de Elixir.png' },
    { name: 'Guardas', cost: 3, type: 'T', image: 'images/Guardas.png', isCounterToSpam: true },
    { name: 'Lápide', cost: 3, type: 'B', image: 'images/Lápide.png', isCounterToSpam: true },
    { name: 'Mago de Gelo', cost: 3, type: 'T', image: 'images/Mago de Gelo.png' },
    { name: 'Megasservo', cost: 3, type: 'T', image: 'images/Megasservo.png' },
    { name: 'Mineiro', cost: 3, type: 'T', image: 'images/Mineiro.png' },
    { name: 'Pequeno Príncipe', cost: 3, type: 'C', image: 'images/Carta Campeao Pequeno Principe.png' },
    { name: 'Pescador', cost: 3, type: 'T', image: 'images/Pescador.png' },
    { name: 'Pirotécnica', cost: 3, type: 'T', image: 'images/Pirotécnica.png' },
    { name: 'Princesa', cost: 3, type: 'T', image: 'images/Princesa.png' },
    { name: 'Servos', cost: 3, type: 'T', image: 'images/Servos.png' },
    { name: 'Terremoto', cost: 3, type: 'S', image: 'images/Terremoto.png' },
    { name: 'Tornado', cost: 3, type: 'S', image: 'images/Tornado.png' },

    // 4 de Elixir
    { name: 'Aríete de Batalha', cost: 4, type: 'T', image: 'images/Aríete de Batalha.png' },
    { name: 'Arqueiro Mágico', cost: 4, type: 'T', image: 'images/Arqueiro Mágico.png', isCounterToSpam: true },
    { name: 'Bebê Dragão', cost: 4, type: 'T', image: 'images/Bebê Dragão.png' },
    { name: 'Bola de Fogo', cost: 4, type: 'S', image: 'images/Bola de Fogo.png' },
    { name: 'Bruxa Mãe', cost: 4, type: 'T', image: 'images/Bruxa Mãe.png' },
    { name: 'Bruxa Sombria', cost: 4, type: 'T', image: 'images/Bruxa Sombria.png' },
    { name: 'Caçador', cost: 4, type: 'T', image: 'images/Caçador.png', isCounterToSpam: true },
    { name: 'Cavaleiro Dourado', cost: 4, type: 'C', image: 'images/Cavaleiro Dourado.png' },
    { name: 'Corredor', cost: 4, type: 'T', image: 'images/Corredor.png' },
    { name: 'Curadora Guerreira', cost: 4, type: 'T', image: 'images/Curadora Guerreira.png' },
    { name: 'Dragão Infernal', cost: 4, type: 'T', image: 'images/Dragão Infernal.png', isCounterToSpam: true },
    { name: 'Dragões Esqueleto', cost: 4, type: 'T', image: 'images/Dragões Esqueleto.png' },
    { name: 'Eletrocutadores', cost: 4, type: 'T', image: 'images/Eletrocutadores.png' },
    { name: 'Escavadeira de Goblins', cost: 4, type: 'B', image: 'images/Escavadeira de Goblins.png' },
    { name: 'Cabana de Goblins', cost: 4, type: 'B', image: 'images/Cabana de Goblins.png' },
    { name: 'Fênix', cost: 4, type: 'T', image: 'images/Carta Lendaria Fenix.png' },
    { name: 'Fornalha', cost: 4, type: 'B', image: 'images/Fornalha.png' },
    { name: 'Gelo', cost: 4, type: 'S', image: 'images/Gelo.png' },
    { name: 'Goblin Demolidor', cost: 4, type: 'T', image: 'images/Carta Rara Goblin Demolidor.png' },
    { name: 'Jaula de Goblin', cost: 4, type: 'B', image: 'images/Jaula de Goblin.png' },
    { name: 'Lenhador', cost: 4, type: 'T', image: 'images/Lenhador.png' },
    { name: 'Mago Elétrico', cost: 4, type: 'T', image: 'images/Mago Elétrico.png' },
    { name: 'Máquina Voadora', cost: 4, type: 'T', image: 'images/Máquina Voadora.png' },
    { name: 'Mineiro Bombado', cost: 4, type: 'C', image: 'images/Mineiro Bombado.png' },
    { name: 'Mini PEKKA', cost: 4, type: 'T', image: 'images/Mini PEKKA.png', isCounterToSpam: true },
    { name: 'Morteiro', cost: 4, type: 'B', image: 'images/Morteiro.png' },
    { name: 'Mosqueteira', cost: 4, type: 'T', image: 'images/Mosqueteira.png' },
    { name: 'Príncipe das Trevas', cost: 4, type: 'T', image: 'images/Príncipe das Trevas.png' },
    { name: 'Rei Esqueleto', cost: 4, type: 'C', image: 'images/Rei Esqueleto.png' },
    { name: 'Tesla', cost: 4, type: 'B', image: 'images/Tesla.png', isCounterToSpam: true },
    { name: 'Torre de Bombas', cost: 4, type: 'B', image: 'images/Torre de Bombas.png', isCounterToSpam: true },
    { name: 'Valquíria', cost: 4, type: 'T', image: 'images/Valquiria.png' },
    { name: 'Veneno', cost: 4, type: 'S', image: 'images/Veneno.png' },
    { name: 'Gigante das Runas', cost: 4, type: 'T', image: 'images/Gigante das Runas.png' },

    // 5 de Elixir
    { name: 'Balão', cost: 5, type: 'T', image: 'images/Balão.png' },
    { name: 'Bárbaros', cost: 5, type: 'T', image: 'images/Bárbaros.png', isCounterToSpam: true },
    { name: 'Bruxa', cost: 5, type: 'T', image: 'images/Bruxa.png' },
    { name: 'Carrinho de Canhão', cost: 5, type: 'T', image: 'images/Carrinho de Canhão.png' },
    { name: 'Cemitério', cost: 5, type: 'S', image: 'images/Cemitério.png' },
    { name: 'Domadora de Carneiro', cost: 5, type: 'T', image: 'images/Domadora de Carneiro.png' },
    { name: 'Dragão Elétrico', cost: 5, type: 'T', image: 'images/Dragão Elétrico.png' },
    { name: 'Executor', cost: 5, type: 'T', image: 'images/Executor.png' },
    { name: 'Gigante', cost: 5, type: 'T', image: 'images/Gigante.png' },
    { name: 'Goblinstein', cost: 5, type: 'C', image: 'images/Carta Campeao Goblinstein.png' },
    { name: 'Horda de Servos', cost: 5, type: 'T', image: 'images/Horda de Servos.png', isCounterToSpam: true },
    { name: 'Lançador', cost: 5, type: 'T', image: 'images/Lançador.png', isCounterToSpam: true },
    { name: 'Mago', cost: 5, type: 'T', image: 'images/Mago.png' },
    { name: 'Máquina Goblin', cost: 5, type: 'T', image: 'images/Carta Lendaria Maquina Goblin.png' },
    { name: 'Patifes', cost: 5, type: 'T', image: 'images/Patifes.png' },
    { name: 'Porcos Reais', cost: 5, type: 'T', image: 'images/Porcos Reais.png' },
    { name: 'Príncipe', cost: 5, type: 'T', image: 'images/Príncipe.png', isCounterToSpam: true },
    { name: 'Rainha Arqueira', cost: 5, type: 'C', image: 'images/Rainha Arqueira.png' },
    { name: 'Torre Inferno', cost: 5, type: 'B', image: 'images/Torre Inferno.png', isCounterToSpam: true },
    { name: 'Monge', cost: 5, type: 'C', image: 'images/Carta Campeao Monge.png' },

    // 6 de Elixir
    { name: 'Bandida Líder', cost: 6, type: 'C', image: 'images/Carta Campea Bandida Lider.png' },
    { name: 'Bárbaros de Elite', cost: 6, type: 'T', image: 'images/Bárbaros de Elite.png' },
    { name: 'Cabana de Bárbaros', cost: 6, type: 'B', image: 'images/Bárbaros.png' }, // No dedicated hut art in this image pack
    { name: 'x-Besta', cost: 6, type: 'B', image: 'images/x-Besta.png' },
    { name: 'Coletor de Elixir', cost: 6, type: 'B', image: 'images/Coletor de Elixir.png' },
    { name: 'Esqueleto Gigante', cost: 6, type: 'T', image: 'images/Esqueleto Gigante.png' },
    { name: 'Foguete', cost: 6, type: 'S', image: 'images/Foguete.png' },
    { name: 'Gigante Real', cost: 6, type: 'T', image: 'images/Gigante Real.png' },
    { name: 'Goblin Gigante', cost: 6, type: 'T', image: 'images/Goblin Gigante.png' },
    { name: 'Relâmpago', cost: 6, type: 'S', image: 'images/Relâmpago.png' },
    { name: 'Sparky', cost: 6, type: 'T', image: 'images/Sparky.png' },
    // Carta de custo variável (3 no chão / 6 no ar). Mantemos 6 como custo-base
    // para classificação por custo alto e consistência visual no tracker.
    { name: 'Imperatriz Espiritual', cost: 6, type: 'T', image: 'images/Imperatriz Espiritual.png' },

    // 7 de Elixir
    { name: 'Gigante Elétrico', cost: 7, type: 'T', image: 'images/Gigante Elétrico.png' },
    { name: 'Lava Hound', cost: 7, type: 'T', image: 'images/Lava Hound.png' },
    { name: 'Megacavaleiro', cost: 7, type: 'T', image: 'images/Megacavaleiro.png', isCounterToSpam: true },
    { name: 'P.E.K.K.A', cost: 7, type: 'T', image: 'images/P.E.K.K.A.png', isCounterToSpam: true },
    { name: 'Recrutas Reais', cost: 7, type: 'T', image: 'images/Recrutas Reais.png' },

    // 8 de Elixir
    { name: 'Golem', cost: 8, type: 'T', image: 'images/Golem.png' },

    // 9 de Elixir
    { name: 'Três Mosqueteiras', cost: 9, type: 'T', image: 'images/Três Mosqueteiras.png' },
];

// ─── Type display names ──────────────────────────────────
const TYPE_LABELS = {
    T: 'Tropa',
    S: 'Feitiço',
    B: 'Edifício',
    C: 'Campeão',
    H: 'Herói',
};

// ─── Helper: which costs have spells / heroes / buildings ────────────
function costHasSpells(cost) {
    return ALL_CARDS.some(c => c.cost === cost && c.type === 'S');
}

function costHasHeroes(cost) {
    return ALL_CARDS.some(c => c.cost === cost && (c.type === 'H' || c.type === 'C'));
}

function costHasBuildings(cost) {
    return ALL_CARDS.some(c => c.cost === cost && c.type === 'B');
}

// ─── Deck Probability Engine ─────────────────────────────

/**
 * Given the list of already identified cards, compute a score for each
 * candidate card. The score is based on:
 *   1. How many meta decks contain BOTH the candidate AND the already-identified cards
 *   2. The weight (popularity) of those meta decks
 *
 * Cards that appear in more/stronger meta decks alongside known cards rank higher.
 */
function scoreCards(candidates, identifiedNames) {
    if (identifiedNames.length === 0) {
        // No identified cards yet — score purely by meta popularity
        return candidates.map(card => {
            let score = 0;
            META_DECKS.forEach(deck => {
                if (deck.cards.includes(card.name)) {
                    score += deck.weight;
                }
            });
            return { ...card, score };
        }).sort((a, b) => b.score - a.score);
    }

    // Co-occurrence / Probability Matrix using Non-Linear Scaling
    return candidates.map(card => {
        let score = 0;
        META_DECKS.forEach(deck => {
            // How many of the identified cards does this deck contain?
            const matchCount = identifiedNames.filter(n => deck.cards.includes(n)).length;
            if (matchCount > 0 && deck.cards.includes(card.name)) {
                // Non-linear exponentiation: variations that match MORE cards gain massively more weight.
                // This ensures specific variations overtake generic guesses.
                score += Math.pow(matchCount, 2) * deck.weight;
            } else if (deck.cards.includes(card.name)) {
                // Card is in a meta deck but no overlap with identified — small baseline bonus
                score += deck.weight * 0.1;
            }
        });
        return { ...card, score };
    }).sort((a, b) => b.score - a.score);
}

/**
 * Returns the top predicted deck variations based on already-identified cards.
 * Uses an exponential scoring model to distinguish between similar sub-variants.
 */
function predictDecks(identifiedNames) {
    if (identifiedNames.length === 0) return META_DECKS.slice(0, 3);

    return META_DECKS.map(deck => {
        // Calculate the raw intersection
        const matchCount = identifiedNames.filter(n => deck.cards.includes(n)).length;
        // The more cards match, the exponentially higher the algorithm's confidence
        const matchRatio = matchCount / identifiedNames.length;
        
        // Exponential reward for discovering exact variations
        const variationConfidence = Math.pow(matchCount, 2.5);
        
        return { 
            ...deck, 
            matchCount, 
            matchRatio, 
            matchScore: variationConfidence * deck.weight * matchRatio 
        };
    })
        .filter(d => d.matchCount > 0)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 3);
}

// ─── Get cards for cost, filtered and scored ─────────────

function getScoredCardsForCost(cost, type, identifiedNames) {
    let cards = ALL_CARDS.filter(c => c.cost === cost);

    // Filter by type if specified
    if (type === 'troop') cards = cards.filter(c => c.type === 'T');
    if (type === 'spell') cards = cards.filter(c => c.type === 'S');
    if (type === 'building') cards = cards.filter(c => c.type === 'B');
    if (type === 'hero') cards = cards.filter(c => c.type === 'H' || c.type === 'C');

    // Remove already identified cards
    cards = cards.filter(c => !identifiedNames.includes(c.name));

    // Score and sort by probability
    return scoreCards(cards, identifiedNames);
}
