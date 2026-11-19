/**
 * [INPUT]: 入口按钮、打开时的游戏快照和玩家主动请求的设备信息。
 * [OUTPUT]: 可预览的反馈表单。只在玩家提交时发送。
 * [POS]: 标题与暂停共用。设备默认不采集，并须单独核对后才发送。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { t, onLangChange } from '../i18n';
import { ORGAN_DEFS } from '../organs/Organ';
import { sendFeedback, type GameReport, type DeviceReport } from '../core/FeedbackClient';
import './FeedbackPanel.css';

type CaptureGame = () => GameReport | null;
type CollectDevice = () => DeviceReport;

export class FeedbackPanel {
  private readonly dialog = document.createElement('dialog');
  private readonly form: HTMLFormElement;
  private readonly heading: HTMLElement;
  private readonly message: HTMLTextAreaElement;
  private readonly preview: HTMLElement;
  private readonly optIn: HTMLInputElement;
  private readonly details: HTMLElement;
  private readonly hardware: HTMLElement;
  private readonly confirm: HTMLInputElement;
  private readonly correction: HTMLInputElement;
  private readonly status: HTMLElement;
  private readonly submit: HTMLButtonElement;
  private readonly close: HTMLButtonElement;
  private readonly triggers: HTMLButtonElement[] = [];
  private game: GameReport | null = null;
  private device: DeviceReport | null = null;

  constructor(title: HTMLElement, pause: HTMLElement, captureGame: CaptureGame, collectDevice: CollectDevice) {
    this.dialog.className = 'feedback-dialog';
    this.dialog.setAttribute('aria-labelledby', 'feedback-heading');
    this.dialog.innerHTML = `
      <h2 id="feedback-heading" tabindex="-1" data-feedback-label="Feedback"></h2>
      <form>
        <label for="feedback-message" data-feedback-label="What happened, or what would you change?"></label>
        <textarea id="feedback-message" required maxlength="2000" rows="3"></textarea>
        <section class="feedback-block">
          <strong data-feedback-label="Game snapshot sent with this report"></strong>
          <div class="feedback-snapshot"></div>
        </section>
        <section class="feedback-block">
          <label class="feedback-check"><input type="checkbox" class="feedback-opt">
            <span data-feedback-label="Share device details (optional)"></span></label>
          <div class="feedback-details" hidden>
            <div class="feedback-device"></div>
            <label for="feedback-correction" data-feedback-label="Anything incorrect? Add a correction (optional)"></label>
            <input id="feedback-correction" type="text" maxlength="240">
            <label class="feedback-check"><input type="checkbox" class="feedback-confirm">
              <span data-feedback-label="I checked these device details and agree to send them"></span></label>
          </div>
        </section>
        <div class="feedback-status" role="status" aria-live="polite"></div>
        <div class="feedback-actions">
          <button type="button" class="feedback-button feedback-close" data-feedback-label="Close feedback"></button>
          <button type="submit" class="feedback-button feedback-send" data-feedback-label="Send feedback"></button>
        </div>
      </form>`;
    this.heading = this.dialog.querySelector('h2')!;
    this.form = this.dialog.querySelector('form')!;
    this.message = this.dialog.querySelector('textarea')!;
    this.preview = this.dialog.querySelector('.feedback-snapshot')!;
    this.optIn = this.dialog.querySelector('.feedback-opt')!;
    this.details = this.dialog.querySelector('.feedback-details')!;
    this.hardware = this.dialog.querySelector('.feedback-device')!;
    this.confirm = this.dialog.querySelector('.feedback-confirm')!;
    this.correction = this.dialog.querySelector('#feedback-correction')!;
    this.status = this.dialog.querySelector('.feedback-status')!;
    this.submit = this.dialog.querySelector('.feedback-send')!;
    this.close = this.dialog.querySelector('.feedback-close')!;
    document.body.appendChild(this.dialog);

    for (const [parent, kind] of [[title, 'title'], [pause, 'pause']] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `feedback-open feedback-open-${kind} feedback-button`;
      this.triggers.push(button);
      if (kind === 'pause') parent.querySelector('.to-title')!.after(button);
      else parent.appendChild(button);
      button.addEventListener('click', () => {
        if (this.dialog.open) return;
        const game = captureGame();
        if (!game) return;
        this.game = game;
        this.device = null;
        this.optIn.checked = this.confirm.checked = false;
        this.correction.value = '';
        this.details.hidden = true;
        this.confirm.required = false;
        this.hardware.textContent = '';
        this.status.textContent = '';
        this.renderSnapshot();
        this.dialog.showModal();
        this.heading.focus();
      });
    }
    this.optIn.addEventListener('change', () => {
      this.device = this.optIn.checked ? collectDevice() : null;
      this.confirm.checked = false;
      this.confirm.required = !!this.device;
      this.details.hidden = !this.device;
      if (!this.device) this.correction.value = '';
      this.renderDevice();
    });
    this.correction.addEventListener('input', () => { this.confirm.checked = false; });
    this.close.addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('cancel', (event) => { if (this.submit.disabled) event.preventDefault(); });
    this.dialog.addEventListener('keydown', (event) => event.stopPropagation());
    this.dialog.addEventListener('keyup', (event) => event.stopPropagation());
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.send();
    });
    this.translate();
    onLangChange(() => this.translate());
  }

  get open(): boolean { return this.dialog.open; }

  private translate(): void {
    for (const button of this.triggers) button.textContent = t('Feedback');
    for (const node of this.dialog.querySelectorAll<HTMLElement>('[data-feedback-label]')) {
      node.textContent = t(node.dataset.feedbackLabel!);
    }
    this.renderSnapshot();
    this.renderDevice();
  }

  private renderSnapshot(): void {
    const g = this.game;
    if (!g) return;
    const lines = [`${t('Game version')}: ${g.release}`];
    if (g.run) {
      const r = g.run;
      lines.push(`${t('Level')}: ${r.levelName} · ${t('Difficulty')}: ${t(r.difficulty[0].toUpperCase() + r.difficulty.slice(1))}`);
      lines.push(`X ${r.xyz[0]} · Y ${r.xyz[1]} · Z ${r.xyz[2]}`);
      lines.push(`${t('Current objective')}: ${r.objective}`);
      const { seconds, hp, paint, crowns } = r;
      lines.push(t('Run: {seconds}s · HP {hp} · Paint {paint}% · Crowns {crowns}', { seconds, hp, paint, crowns }));
      if (r.organs.length) {
        lines.push(t('Recent sticker events'));
        for (const item of r.organs) {
          const action = t(item.action === 'dropped' ? 'Dropped' : 'Picked up');
          const source = item.source ? ` (${item.source})` : '';
          lines.push(`  ${item.seconds}s · ${action}: ${t(ORGAN_DEFS[item.type].name)}${source}`);
        }
      }
    } else {
      lines.push(t('Title screen — no player coordinates'));
    }
    this.preview.textContent = lines.join('\n');
  }

  private renderDevice(): void {
    const d = this.device;
    if (!d) { this.hardware.textContent = ''; return; }
    this.hardware.textContent = [
      `${t('System and browser')}: ${d.os} · ${d.browser}`,
      `CPU: ${d.cores ?? t('Not reported')} · RAM: ${d.memoryGb == null ? t('Not reported') : `~${d.memoryGb} GB`}`,
      `GPU: ${d.gpu ?? t('Not reported')}`,
      `${t('Viewport')}: ${d.viewport[0]} × ${d.viewport[1]} · DPR ${d.dpr}`,
      `${t('Graphics')}: ${d.graphics} · ${t(d.controls === 'touch' ? 'Touch controls' : 'Desktop controls')}`,
    ].join('\n');
  }

  private async send(): Promise<void> {
    const message = this.message.value.trim();
    if (!this.game || this.submit.disabled) return;
    if (!message) {
      this.status.textContent = t('Please write a suggestion or describe what happened.');
      this.message.focus();
      return;
    }
    const device = this.device && this.optIn.checked && this.confirm.checked
      ? { ...this.device, correction: this.correction.value.trim() }
      : undefined;
    this.submit.disabled = this.close.disabled = true;
    this.form.setAttribute('aria-busy', 'true');
    for (const field of [this.message, this.optIn, this.confirm, this.correction]) field.disabled = true;
    this.status.textContent = t('Sending feedback…');
    try {
      const id = await sendFeedback({ message, game: this.game, ...(device ? { device, deviceConfirmed: true } : {}) });
      this.message.value = '';
      this.status.textContent = t('Feedback sent. Reference: {id}', { id });
    } catch (error) {
      this.status.textContent = t(error instanceof Error && error.message === 'rate-limit'
        ? 'Too many reports. Wait a minute and try again.'
        : 'Could not send. Your text is still here; try again.');
    } finally {
      this.submit.disabled = this.close.disabled = false;
      this.form.removeAttribute('aria-busy');
      for (const field of [this.message, this.optIn, this.confirm, this.correction]) field.disabled = false;
    }
  }
}
