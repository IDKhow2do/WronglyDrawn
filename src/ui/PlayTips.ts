/**
 * [INPUT]: IOS_APP、ANDROID_APP、DESKTOP_APP、SOFTWARE_GPU 与 Quality.gpu 来自 render/Quality；t 来自 i18n。
 * [OUTPUT]: WEB_PLAY 表示在浏览器里在线游玩。slowLoadTip 在加载超时后显示网络提示，返回撤下函数。
 *           frameTip 按显卡情况给出画面卡顿的文案键。PAUSE_TIP 是暂停菜单里常驻的一行。
 * [POS]: ui/ 的网页版卡顿提示。UI 调用它。iOS、Android、桌面 App 与 TapTap 包不显示这些提示。
 *        开机画面（index.html）在脚本到达前用同一句网络提示，两处文案保持一致。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { ANDROID_APP, DESKTOP_APP, IOS_APP, Quality, SOFTWARE_GPU } from '../render/Quality';
import { t } from '../i18n';

export const WEB_PLAY = !IOS_APP && !ANDROID_APP && !DESKTOP_APP && import.meta.env.MODE !== 'taptap';

/** 加载超过这个时长才提示网络。正常网络在这之前已进标题。 */
const SLOW_LOAD_MS = 8000;

const NET_TIP = 'Loading slowly? If your connection is lagging, try a network accelerator.';
export const PAUSE_TIP = 'Choppy? Lower Graphics first, then turn on hardware acceleration in your browser. Slow network? Try a network accelerator.';

/** 加载超时后在 host 底部显示网络提示。返回的函数撤下提示或取消计时。 */
export function slowLoadTip(host: HTMLElement): () => void {
  const tip = document.createElement('p');
  tip.className = 'play-tip';
  const timer = setTimeout(() => {
    tip.textContent = t(NET_TIP);
    host.appendChild(tip);
  }, SLOW_LOAD_MS);
  return () => {
    clearTimeout(timer);
    tip.remove();
  };
}

/** 画面卡顿的提示。浏览器没在用显卡时，直接点明原因。 */
export function frameTip(): string {
  return SOFTWARE_GPU.test(Quality.gpu.toLowerCase())
    ? 'Your browser is drawing without the graphics card. Turn on hardware acceleration in its settings, then restart the browser.'
    : 'Choppy frames? Set Graphics to Low in the pause menu, and turn on hardware acceleration in your browser settings.';
}
