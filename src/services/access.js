// Markt-Zutrittsregelung: offener, beschränkter und geschlossener Marktzugang.
const LEVELS = { open: 0, restricted: 1, closed: 2 };

const LEVEL_LABELS = {
  open: 'Offen',
  restricted: 'Beschränkt',
  closed: 'Geschlossen',
};

// Zugangsstufe, mit der ein Besucher den Markt betritt.
function effectiveLevel(user) {
  if (!user) return 'open';
  if (user.role === 'admin' || user.role === 'datapfleger') return 'closed';
  return user.access_level || 'open';
}

// Alle Marktsegmente, die mit einer Zugangsstufe sichtbar sind.
function visibleLevels(level) {
  return Object.keys(LEVELS).filter((l) => LEVELS[l] <= LEVELS[level]);
}

function canAccess(user, requiredLevel) {
  return LEVELS[effectiveLevel(user)] >= LEVELS[requiredLevel];
}

module.exports = { LEVELS, LEVEL_LABELS, effectiveLevel, visibleLevels, canAccess };
