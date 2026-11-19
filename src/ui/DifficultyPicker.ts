/**
 * [INPUT]: depends on Difficulty, DIFFICULTY_ORDER, DIFFICULTY_TEXT from ../meta/Difficulty; t/onLangChange from ../i18n;
 *          ./difficulty.css (the tool cards, the pause row, and the boon picker's GUARANTEED card of a re-roll)
 * [OUTPUT]: exports difficultyCards (the three tool cards as markup) and bindDifficultySelect (the pause-menu row)
 * [POS]: the only UI for difficulty. ui/SetupScreen puts difficultyCards() on the one screen before a new game; UI.ts
 *        hands bindDifficultySelect the pause row. Both write Difficulty only; the game systems read the table
 *        themselves, and every word shown comes from DIFFICULTY_TEXT (a table change needs no edit here).
 * [PROTOCOL]: Update this header on change, then check docs/difficulty/NOTES.md
 */
import './difficulty.css';
import { Difficulty, DIFFICULTY_ORDER, DIFFICULTY_TEXT, type DifficultyId } from '../meta/Difficulty';
import { t, onLangChange } from '../i18n';

/** One squiggle per tool: waxy crayon, clean marker, fat permanent ink. */
const STROKE: Record<DifficultyId, string> = {
  gentle: '<path d="M12 40 C 40 12, 70 58, 100 30 S 160 20, 188 38" stroke="#ff9ec4" stroke-width="9" stroke-dasharray="2 3" />',
  normal: '<path d="M12 40 C 40 12, 70 58, 100 30 S 160 20, 188 38" stroke="#2a4be0" stroke-width="11" />',
  hard: '<path d="M12 40 C 40 12, 70 58, 100 30 S 160 20, 188 38" stroke="#141014" stroke-width="17" /><circle cx="190" cy="44" r="5" fill="#141014" />',
};
const COLOUR: Record<DifficultyId, string> = { gentle: '#ff9ec4', normal: '#22c4c0', hard: '#e8323c' };

/**
 * The three taped tool cards, `pick` marked. The names and one-liners come from DIFFICULTY_TEXT, so a change to the
 * table shows here with no edit. Each card carries `data-diff`; the caller owns selection and keyboard / pad travel.
 */
export function difficultyCards(pick: DifficultyId): string {
  return `<div class="picker-row">${DIFFICULTY_ORDER.map((id, i) => {
    const d = DIFFICULTY_TEXT[id];
    return `<button class="diff-card${id === pick ? ' on' : ''}" data-diff="${id}" style="--c:${COLOUR[id]}; --r:${[-2, 1.5, -1][i]}deg">
      <svg class="dc-art" viewBox="0 0 200 64" fill="none" stroke-linecap="round" aria-hidden="true">${STROKE[id]}</svg>
      <span class="dc-name">${t(d.name)}</span>
      <span class="dc-tag">${t(d.tag)}</span>
      <span class="dc-line">${t(d.line)}</span>
      <span class="tape"></span>
    </button>`;
  }).join('')}</div>`;
}

/**
 * The pause-menu row: a <select> like Graphics / Art style, with the chosen tool's one-liner under it.
 * A change applies at once (damage, healing, creature clock, paint toughness rescaled); extra swarm creatures
 * appear from the next spawn.
 */
export function bindDifficultySelect(row: HTMLElement): void {
  const sel = row.querySelector('select') as HTMLSelectElement;
  const note = row.parentElement?.querySelector('.diff-note') as HTMLElement | null;
  const render = () => {
    sel.innerHTML = DIFFICULTY_ORDER.map((id) => `<option value="${id}">${t(DIFFICULTY_TEXT[id].name)} · ${t(DIFFICULTY_TEXT[id].tag)}</option>`).join('');
    sel.value = Difficulty.id;
    if (note) note.textContent = t(DIFFICULTY_TEXT[Difficulty.id].line);
  };
  sel.addEventListener('change', () => {
    Difficulty.set(sel.value as DifficultyId);
    render();
  });
  onLangChange(render);
  Difficulty.onChange(render);
  render();
}
