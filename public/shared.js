(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ReinoShared = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const WORLD = {
    width: 2400,
    height: 1800,
    playerRadius: 18,
    chestRadius: 20,
    lootRadius: 15,
    wallThickness: 18,
    chestRespawnMs: 28000,
    respawnMs: 3200
  };

  const RARITIES = {
    common: { id: 'common', label: 'Común', color: '#94a3b8', weight: 46, mult: 1.0 },
    rare: { id: 'rare', label: 'Raro', color: '#38bdf8', weight: 32, mult: 1.25 },
    epic: { id: 'epic', label: 'Épico', color: '#c084fc', weight: 16, mult: 1.55 },
    legendary: { id: 'legendary', label: 'Legendario', color: '#fbbf24', weight: 6, mult: 1.95 }
  };

  const ROLES = {
    archer: {
      id: 'archer',
      name: 'Arquero',
      subtitle: 'Precisión y movilidad',
      color: '#22c55e',
      accent: '#86efac',
      maxHp: 100,
      maxShield: 30,
      speed: 268,
      primaryName: 'Disparo de Arco',
      primaryCooldownMs: 370,
      primaryDamage: 26,
      primarySpeed: 840,
      primaryRange: 760,
      specialName: 'Ráfaga Triple',
      specialDesc: 'Dispara 3 flechas veloces en abanico.',
      specialCooldownMs: 3200,
      dashName: 'Voltereta',
      dashCooldownMs: 2200,
      dashDist: 145
    },
    mage: {
      id: 'mage',
      name: 'Mago',
      subtitle: 'Daño en área y control',
      color: '#a855f7',
      accent: '#67e8f9',
      maxHp: 88,
      maxShield: 50,
      speed: 242,
      primaryName: 'Orbe Arcano',
      primaryCooldownMs: 490,
      primaryDamage: 30,
      primarySplashRadius: 72,
      primarySpeed: 600,
      primaryRange: 640,
      specialName: 'Nova Glacial',
      specialDesc: 'Explosión arcana alrededor del mago que daña y ralentiza.',
      specialCooldownMs: 4200,
      dashName: 'Teletransporte',
      dashCooldownMs: 2800,
      dashDist: 195
    },
    swordsman: {
      id: 'swordsman',
      name: 'Espadachín',
      subtitle: 'Cuerpo a cuerpo y desvío',
      color: '#f97316',
      accent: '#fde047',
      maxHp: 145,
      maxShield: 55,
      speed: 256,
      primaryName: 'Tajo de Acero',
      primaryCooldownMs: 360,
      primaryDamage: 38,
      primaryRange: 86,
      primaryArc: Math.PI * 0.72,
      specialName: 'Torbellino',
      specialDesc: 'Embestida giratoria 360° que destroza proyectiles y enemigos.',
      specialCooldownMs: 3800,
      dashName: 'Carga con Escudo',
      dashCooldownMs: 2400,
      dashDist: 160
    }
  };

  // Casas en las que se puede entrar: al entrar, el techo se desvanece y ves los cofres por rol
  const HOUSES = [
    {
      id: 'house_tavern',
      name: 'Taberna del Roble',
      tag: 'Botín variado',
      x: 240,
      y: 210,
      w: 360,
      h: 260,
      floorColor: '#3b2b20',
      roofColor: '#7c2d12',
      doors: [
        { side: 'bottom', offset: 0.5, width: 82 },
        { side: 'right', offset: 0.5, width: 76 }
      ],
      furniture: [
        { x: 285, y: 260, w: 92, h: 36, kind: 'table' },
        { x: 475, y: 365, w: 68, h: 42, kind: 'bar' }
      ],
      chests: [
        { x: 300, y: 405 },
        { x: 540, y: 260 }
      ]
    },
    {
      id: 'house_mage_tower',
      name: 'Torre Arcana',
      tag: 'Reliquias mágicas',
      x: 1740,
      y: 190,
      w: 340,
      h: 290,
      floorColor: '#25213d',
      roofColor: '#4c1d95',
      doors: [
        { side: 'bottom', offset: 0.45, width: 82 },
        { side: 'left', offset: 0.55, width: 76 }
      ],
      furniture: [
        { x: 1875, y: 310, w: 72, h: 72, kind: 'altar' }
      ],
      chests: [
        { x: 1800, y: 245 },
        { x: 2015, y: 415 }
      ]
    },
    {
      id: 'house_ranger',
      name: 'Cabaña del Vigía',
      tag: 'Equipo de caza',
      x: 220,
      y: 1220,
      w: 340,
      h: 260,
      floorColor: '#2d3322',
      roofColor: '#14532d',
      doors: [
        { side: 'top', offset: 0.5, width: 82 },
        { side: 'right', offset: 0.5, width: 76 }
      ],
      furniture: [
        { x: 350, y: 1320, w: 74, h: 44, kind: 'table' }
      ],
      chests: [
        { x: 275, y: 1420 },
        { x: 500, y: 1275 }
      ]
    },
    {
      id: 'house_forge',
      name: 'Herrería Real',
      tag: 'Armas pesadas',
      x: 1760,
      y: 1220,
      w: 360,
      h: 270,
      floorColor: '#2c2627',
      roofColor: '#7f1d1d',
      doors: [
        { side: 'top', offset: 0.5, width: 84 },
        { side: 'left', offset: 0.5, width: 78 }
      ],
      furniture: [
        { x: 1910, y: 1330, w: 68, h: 52, kind: 'anvil' }
      ],
      chests: [
        { x: 1825, y: 1430 },
        { x: 2060, y: 1280 }
      ]
    },
    {
      id: 'house_townhall',
      name: 'Bastión Central',
      tag: 'Cofres de élite',
      x: 1000,
      y: 720,
      w: 400,
      h: 330,
      floorColor: '#2d313c',
      roofColor: '#1e3a5f',
      doors: [
        { side: 'top', offset: 0.5, width: 88 },
        { side: 'bottom', offset: 0.5, width: 88 },
        { side: 'left', offset: 0.5, width: 82 },
        { side: 'right', offset: 0.5, width: 82 }
      ],
      furniture: [
        { x: 1085, y: 805, w: 46, h: 46, kind: 'pillar' },
        { x: 1270, y: 805, w: 46, h: 46, kind: 'pillar' },
        { x: 1085, y: 925, w: 46, h: 46, kind: 'pillar' },
        { x: 1270, y: 925, w: 46, h: 46, kind: 'pillar' }
      ],
      chests: [
        { x: 1200, y: 885 },
        { x: 1055, y: 770 },
        { x: 1345, y: 1000 }
      ]
    },
    {
      id: 'house_chapel',
      name: 'Santuario Norte',
      tag: 'Curación y runas',
      x: 1035,
      y: 170,
      w: 330,
      h: 230,
      floorColor: '#2c303a',
      roofColor: '#374151',
      doors: [
        { side: 'bottom', offset: 0.5, width: 86 },
        { side: 'left', offset: 0.5, width: 74 },
        { side: 'right', offset: 0.5, width: 74 }
      ],
      furniture: [
        { x: 1165, y: 230, w: 70, h: 42, kind: 'altar' }
      ],
      chests: [
        { x: 1095, y: 225 },
        { x: 1305, y: 225 }
      ]
    },
    {
      id: 'house_barracks',
      name: 'Cuartel Sur',
      tag: 'Botín táctico',
      x: 1030,
      y: 1360,
      w: 340,
      h: 240,
      floorColor: '#332b24',
      roofColor: '#78350f',
      doors: [
        { side: 'top', offset: 0.5, width: 86 },
        { side: 'left', offset: 0.5, width: 74 },
        { side: 'right', offset: 0.5, width: 74 }
      ],
      furniture: [
        { x: 1165, y: 1465, w: 72, h: 38, kind: 'table' }
      ],
      chests: [
        { x: 1085, y: 1545 },
        { x: 1315, y: 1545 }
      ]
    }
  ];

  // Obstáculos exteriores (árboles, rocas y muros bajos)
  const EXTERIOR_PROPS = [
    { x: 760, y: 450, r: 30, kind: 'tree' },
    { x: 790, y: 1290, r: 32, kind: 'tree' },
    { x: 1590, y: 460, r: 30, kind: 'tree' },
    { x: 1610, y: 1290, r: 32, kind: 'tree' },
    { x: 720, y: 880, r: 26, kind: 'rock' },
    { x: 1680, y: 880, r: 26, kind: 'rock' },
    { x: 120, y: 740, r: 34, kind: 'tree' },
    { x: 140, y: 980, r: 28, kind: 'rock' },
    { x: 2250, y: 720, r: 34, kind: 'tree' },
    { x: 2240, y: 1020, r: 28, kind: 'rock' },
    { x: 640, y: 160, r: 28, kind: 'tree' },
    { x: 1640, y: 155, r: 28, kind: 'tree' },
    { x: 660, y: 1620, r: 28, kind: 'tree' },
    { x: 1660, y: 1620, r: 28, kind: 'tree' }
  ];

  // Botín específico por rol + consumibles universales
  const LOOT_BY_ROLE = {
    archer: [
      {
        id: 'archer_bow',
        slot: 'weapon',
        name: 'Arco Élfico',
        icon: '🏹',
        desc: '+Daño y velocidad de flecha',
        stats: { damageMult: 0.22, fireRateMult: 0.14, projSpeedMult: 0.22 }
      },
      {
        id: 'archer_poison',
        slot: 'ammo',
        name: 'Flechas Venenosas',
        icon: '🧪',
        desc: 'Tus flechas envenenan durante 3s',
        stats: { poisonDps: 7, damageMult: 0.08 }
      },
      {
        id: 'archer_quiver',
        slot: 'relic',
        name: 'Carcaj Ligero',
        icon: '🪶',
        desc: '+Velocidad y menor recarga de habilidades',
        stats: { speedBonus: 34, cooldownMult: 0.16 }
      },
      {
        id: 'archer_cloak',
        slot: 'armor',
        name: 'Capa del Bosque',
        icon: '🧥',
        desc: '+Vida máxima y escudo',
        stats: { maxHpBonus: 24, shieldGain: 25 }
      }
    ],
    mage: [
      {
        id: 'mage_staff',
        slot: 'weapon',
        name: 'Báculo Carmesí',
        icon: '🔮',
        desc: '+Daño arcano y mayor radio de explosión',
        stats: { damageMult: 0.24, splashBonus: 26 }
      },
      {
        id: 'mage_frost',
        slot: 'ammo',
        name: 'Grimorio Glacial',
        icon: '❄️',
        desc: 'Los orbes ralentizan al impactar',
        stats: { slowPct: 0.35, projSpeedMult: 0.16 }
      },
      {
        id: 'mage_amulet',
        slot: 'relic',
        name: 'Amuleto de Maná',
        icon: '🧿',
        desc: 'Reduce el enfriamiento de Nova y Teletransporte',
        stats: { cooldownMult: 0.24, speedBonus: 18 }
      },
      {
        id: 'mage_robe',
        slot: 'armor',
        name: 'Túnica Rúnica',
        icon: '👘',
        desc: '+Escudo máximo y regeneración pasiva',
        stats: { maxShieldBonus: 35, shieldGain: 35 }
      }
    ],
    swordsman: [
      {
        id: 'sword_blade',
        slot: 'weapon',
        name: 'Mandoble Rúnico',
        icon: '⚔️',
        desc: '+Daño y alcance de tajo',
        stats: { damageMult: 0.25, meleeRangeBonus: 22 }
      },
      {
        id: 'sword_vamp',
        slot: 'ammo',
        name: 'Filo Carmesí',
        icon: '🩸',
        desc: 'Cada tajo te cura parte del daño',
        stats: { lifesteal: 0.22, fireRateMult: 0.12 }
      },
      {
        id: 'sword_boots',
        slot: 'relic',
        name: 'Botas de Asalto',
        icon: '🥾',
        desc: '+Velocidad y menor recarga de embestida',
        stats: { speedBonus: 36, cooldownMult: 0.18 }
      },
      {
        id: 'sword_plate',
        slot: 'armor',
        name: 'Coraza Templaria',
        icon: '🛡️',
        desc: '+Vida máxima y armadura reforzada',
        stats: { maxHpBonus: 38, shieldGain: 38 }
      }
    ]
  };

  const UNIVERSAL_LOOT = [
    {
      id: 'potion_hp',
      slot: 'consumable',
      name: 'Poción de Vida',
      icon: '❤️',
      desc: 'Restaura +45 de vida al recogerla',
      heal: 45
    },
    {
      id: 'potion_shield',
      slot: 'consumable',
      name: 'Elixir de Escudo',
      icon: '💠',
      desc: 'Restaura +40 de escudo al recogerlo',
      shield: 40
    }
  ];

  function buildHouseWalls(house) {
    const t = WORLD.wallThickness;
    const walls = [];
    const sides = ['top', 'bottom', 'left', 'right'];

    for (const side of sides) {
      const door = (house.doors || []).find((d) => d.side === side);
      if (side === 'top' || side === 'bottom') {
        const y = side === 'top' ? house.y : house.y + house.h - t;
        if (!door) {
          walls.push({ x: house.x, y, w: house.w, h: t, houseId: house.id });
        } else {
          const doorCenter = house.x + house.w * door.offset;
          const dLeft = doorCenter - door.width / 2;
          const dRight = doorCenter + door.width / 2;
          if (dLeft > house.x) {
            walls.push({ x: house.x, y, w: dLeft - house.x, h: t, houseId: house.id });
          }
          if (dRight < house.x + house.w) {
            walls.push({ x: dRight, y, w: house.x + house.w - dRight, h: t, houseId: house.id });
          }
        }
      } else {
        const x = side === 'left' ? house.x : house.x + house.w - t;
        if (!door) {
          walls.push({ x, y: house.y, w: t, h: house.h, houseId: house.id });
        } else {
          const doorCenter = house.y + house.h * door.offset;
          const dTop = doorCenter - door.width / 2;
          const dBottom = doorCenter + door.width / 2;
          if (dTop > house.y) {
            walls.push({ x, y: house.y, w: t, h: dTop - house.y, houseId: house.id });
          }
          if (dBottom < house.y + house.h) {
            walls.push({ x, y: dBottom, w: t, h: house.y + house.h - dBottom, houseId: house.id });
          }
        }
      }
    }

    for (const furn of house.furniture || []) {
      walls.push({ x: furn.x, y: furn.y, w: furn.w, h: furn.h, houseId: house.id, isFurniture: true, kind: furn.kind });
    }

    return walls;
  }

  const ALL_WALLS = [];
  for (const h of HOUSES) {
    ALL_WALLS.push(...buildHouseWalls(h));
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function resolveCircleRect(entity, r, rect) {
    const closestX = clamp(entity.x, rect.x, rect.x + rect.w);
    const closestY = clamp(entity.y, rect.y, rect.y + rect.h);
    const dx = entity.x - closestX;
    const dy = entity.y - closestY;
    const distSq = dx * dx + dy * dy;

    if (distSq >= r * r) return false;

    if (distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      const overlap = r - dist;
      entity.x += (dx / dist) * overlap;
      entity.y += (dy / dist) * overlap;
    } else {
      const leftPen = entity.x - rect.x;
      const rightPen = rect.x + rect.w - entity.x;
      const topPen = entity.y - rect.y;
      const bottomPen = rect.y + rect.h - entity.y;
      const minPen = Math.min(leftPen, rightPen, topPen, bottomPen);
      if (minPen === leftPen) entity.x = rect.x - r;
      else if (minPen === rightPen) entity.x = rect.x + rect.w + r;
      else if (minPen === topPen) entity.y = rect.y - r;
      else entity.y = rect.y + rect.h + r;
    }
    return true;
  }

  function resolveWorldCollisions(entity, r) {
    entity.x = clamp(entity.x, r, WORLD.width - r);
    entity.y = clamp(entity.y, r, WORLD.height - r);
    for (let pass = 0; pass < 2; pass++) {
      for (const wall of ALL_WALLS) {
        resolveCircleRect(entity, r, wall);
      }
      for (const prop of EXTERIOR_PROPS) {
        const dx = entity.x - prop.x;
        const dy = entity.y - prop.y;
        const minDist = r + prop.r;
        const distSq = dx * dx + dy * dy;
        if (distSq < minDist * minDist && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const overlap = minDist - dist;
          entity.x += (dx / dist) * overlap;
          entity.y += (dy / dist) * overlap;
        }
      }
    }
    entity.x = clamp(entity.x, r, WORLD.width - r);
    entity.y = clamp(entity.y, r, WORLD.height - r);
  }

  function pointInRect(px, py, rect) {
    return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
  }

  function getHouseAt(px, py) {
    for (const h of HOUSES) {
      if (pointInRect(px, py, h)) return h;
    }
    return null;
  }

  function circleIntersectsSolid(x, y, r) {
    if (x - r < 0 || x + r > WORLD.width || y - r < 0 || y + r > WORLD.height) return true;
    for (const wall of ALL_WALLS) {
      const cx = clamp(x, wall.x, wall.x + wall.w);
      const cy = clamp(y, wall.y, wall.y + wall.h);
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy < r * r) return true;
    }
    for (const prop of EXTERIOR_PROPS) {
      const dx = x - prop.x;
      const dy = y - prop.y;
      const minD = r + prop.r;
      if (dx * dx + dy * dy < minD * minD) return true;
    }
    return false;
  }

  return {
    WORLD,
    RARITIES,
    ROLES,
    HOUSES,
    EXTERIOR_PROPS,
    ALL_WALLS,
    LOOT_BY_ROLE,
    UNIVERSAL_LOOT,
    clamp,
    resolveWorldCollisions,
    pointInRect,
    getHouseAt,
    circleIntersectsSolid
  };
});
