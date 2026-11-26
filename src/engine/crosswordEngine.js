/**
 * Small arrowword/çengel placement engine.
 * A clue tile precedes each answer: left of horizontal answers, above vertical ones.
 * The generator returns null rather than publishing a conflicting grid.
 */
import { normalizeAnswer } from './wordEngine.js';

const key = (r, c) => `${r}:${c}`;

function blankGrid(size) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => null));
}

function canPlace(grid, entry, row, col, direction, id) {
  const letters = Array.from(normalizeAnswer(entry.answer));
  const dr = direction === 'down' ? 1 : 0;
  const dc = direction === 'across' ? 1 : 0;
  const clueRow = row - dr;
  const clueCol = col - dc;
  const size = grid.length;
  if (clueRow < 0 || clueCol < 0 || clueRow >= size || clueCol >= size) return null;
  if (row < 0 || col < 0 || row + dr * (letters.length - 1) >= size || col + dc * (letters.length - 1) >= size) return null;
  if (grid[clueRow][clueCol] !== null) return null;

  let crossings = 0;
  for (let i = 0; i < letters.length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    const cell = grid[r][c];
    if (cell && cell.kind !== 'letter') return null;
    if (cell && cell.char !== letters[i]) return null;
    if (cell && cell.kind === 'letter') crossings++;
  }
  if (crossings === 0 && grid.some((line) => line.some((cell) => cell?.kind === 'letter'))) return null;
  return { letters, clueRow, clueCol, crossings };
}

function applyPlacement(grid, entry, row, col, direction, id, checked) {
  const dr = direction === 'down' ? 1 : 0;
  const dc = direction === 'across' ? 1 : 0;
  grid[checked.clueRow][checked.clueCol] = {
    kind: 'clue', id, direction, clue: entry.clue, answer: normalizeAnswer(entry.answer)
  };
  checked.letters.forEach((char, i) => {
    const r = row + dr * i;
    const c = col + dc * i;
    if (!grid[r][c]) grid[r][c] = { kind: 'letter', char, entryIds: [id] };
    else grid[r][c].entryIds.push(id);
  });
}

function candidatePlacements(grid, entry) {
  const options = [];
  const letters = Array.from(normalizeAnswer(entry.answer));
  const existing = [];
  grid.forEach((line, r) => line.forEach((cell, c) => {
    if (cell?.kind === 'letter') existing.push({ r, c, char: cell.char });
  }));
  for (const cell of existing) {
    for (let i = 0; i < letters.length; i++) {
      if (letters[i] !== cell.char) continue;
      for (const direction of ['across', 'down']) {
        // Prefer turning at least one crossing; a new horizontal word crosses vertical and vice versa.
        const row = cell.r - (direction === 'down' ? i : 0);
        const col = cell.c - (direction === 'across' ? i : 0);
        const checked = canPlace(grid, entry, row, col, direction, 'candidate');
        if (checked) {
          const existingDirection = grid[cell.r][cell.c].entryIds.length;
          const edgePenalty = Math.abs(row - grid.length / 2) + Math.abs(col - grid.length / 2);
          options.push({ row, col, direction, checked, score: checked.crossings * 20 - edgePenalty - existingDirection });
        }
      }
    }
  }
  options.sort((a, b) => b.score - a.score);
  return options;
}

export function generateArrowword(entries, size = 15, attempts = 30) {
  const cleaned = (entries || [])
    .filter((e) => e?.answer && e?.clue)
    .map((e) => ({ ...e, answer: normalizeAnswer(e.answer) }))
    .filter((e) => e.answer.length >= 3 && e.answer.length <= size - 1);
  if (cleaned.length < 2) return null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const shuffled = [...cleaned].sort((a, b) => (b.answer.length - a.answer.length) || (Math.random() - 0.5));
    const grid = blankGrid(size);
    const first = shuffled[0];
    const firstCol = Math.max(1, Math.floor((size - first.answer.length) / 2));
    const firstRow = Math.floor(size / 2);
    const firstChecked = canPlace(grid, first, firstRow, firstCol, 'across', 'entry-0');
    if (!firstChecked) continue;
    applyPlacement(grid, first, firstRow, firstCol, 'across', 'entry-0', firstChecked);
    const placements = [{ ...first, id: 'entry-0', row: firstRow, col: firstCol, direction: 'across' }];

    for (let i = 1; i < shuffled.length; i++) {
      const entry = shuffled[i];
      const options = candidatePlacements(grid, entry).slice(0, 24);
      let placed = false;
      for (const option of options) {
        const id = `entry-${i}`;
        const checked = canPlace(grid, entry, option.row, option.col, option.direction, id);
        if (!checked) continue;
        applyPlacement(grid, entry, option.row, option.col, option.direction, id, checked);
        placements.push({ ...entry, id, row: option.row, col: option.col, direction: option.direction });
        placed = true;
        break;
      }
      if (!placed) continue;
    }

    if (placements.length >= Math.min(cleaned.length, 12)) {
      const valid = validateArrowword(grid, placements);
      if (valid.ok) return { size, grid, entries: placements, placedCount: placements.length };
    }
  }
  return null;
}

export function validateArrowword(grid, placements) {
  for (const entry of placements) {
    const dr = entry.direction === 'down' ? 1 : 0;
    const dc = entry.direction === 'across' ? 1 : 0;
    const chars = Array.from(normalizeAnswer(entry.answer));
    for (let i = 0; i < chars.length; i++) {
      const cell = grid[entry.row + dr * i]?.[entry.col + dc * i];
      if (!cell || cell.kind !== 'letter' || cell.char !== chars[i]) return { ok: false, reason: `Kesişim doğrulanamadı: ${entry.answer}` };
    }
  }
  return { ok: true };
}

export function demoArrowwordEntries() {
  return [
    { answer: 'EYER', clue: 'Binici oturağı' },
    { answer: 'YELE', clue: 'Atın boyun kılları' },
    { answer: 'SEYİS', clue: 'At bakıcısı' },
    { answer: 'YULAR', clue: 'At başlığı' },
    { answer: 'ÜZENGİ', clue: 'Ayak halkası' },
    { answer: 'KISRAK', clue: 'Dişi at' },
    { answer: 'ATÇILIK', clue: 'At yetiştirme uğraşı' },
    { answer: 'TURŞUCU', clue: 'Turşu hazırlayan' },
    { answer: 'MAYDANOZ', clue: 'Kokulu yeşillik' },
    { answer: 'TURŞULUK', clue: 'Salamuraya uygun' },
    { answer: 'SALATALIK', clue: 'Kabakgillerden sebze' },
    { answer: 'BİNİCİLİK', clue: 'Atlı spor dalı' },
    { answer: 'KAVANOZ', clue: 'Turşu kabı' },
    { answer: 'AHIR', clue: 'Atların barınağı' },
    { answer: 'NİŞANE', clue: 'İşaret, belirti' },
    { answer: 'MANTAR', clue: 'Sporla çoğalan canlı' },
    { answer: 'TAY', clue: 'Genç at' },
    { answer: 'OTLAK', clue: 'Hayvanların otladığı yer' }
  ];
}
