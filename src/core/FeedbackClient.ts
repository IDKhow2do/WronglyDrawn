/**
 * [INPUT]: 玩家确认的建议、游戏快照与可选设备信息。
 * [OUTPUT]: 提交反馈并返回服务器回执。设备信息只由显式选择触发。
 * [POS]: 浏览器走同源 API：默认在游戏目录旁的 `api/feedback`，构建时设了 VITE_FEEDBACK_URL 就用它。iOS App 通过 WebKit 将报告交给原生 HTTPS 客户端。不加入游戏帧循环，不读取身份或存档。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { OrganType } from '../organs/Organ';

export interface OrganReportEvent {
  action: 'dropped' | 'collected';
  type: OrganType;
  seconds: number;
  source: string | null;
}

export interface GameReport {
  release: string;
  state: string;
  run?: {
    level: string; levelName: string; difficulty: string; objective: string; artStyle: string;
    xyz: [number, number, number]; seconds: number; hp: number; paint: number; crowns: number;
    organs: OrganReportEvent[];
  };
}

export interface DeviceReport {
  os: string; browser: string; viewport: [number, number]; dpr: number;
  cores: number | null; memoryGb: number | null; gpu: string | null;
  graphics: string; controls: 'touch' | 'desktop'; correction?: string;
}

interface FeedbackSubmission {
  message: string;
  game: GameReport;
  device?: DeviceReport;
  deviceConfirmed?: true;
}

export function detectFeedbackDevice(
  context: WebGLRenderingContext | WebGL2RenderingContext, graphics: string, touch: boolean,
): DeviceReport {
  const n = navigator as Navigator & { deviceMemory?: number };
  const ua = n.userAgent;
  const os =
    /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && n.maxTouchPoints > 1) ? 'iOS/iPadOS'
      : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
        : /CrOS/.test(ua) ? 'ChromeOS' : /Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown';
  const versions = [
    ['Edge', /(?:Edg|EdgiOS|EdgA)\/(\d+)/], ['Opera', /(?:OPR|OPiOS)\/(\d+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/], ['Chrome', /(?:Chrome|CriOS)\/(\d+)/],
    ['Safari', /Version\/(\d+).*Safari/],
  ] as const;
  let browser = 'Unknown';
  for (const [name, pattern] of versions) {
    const version = pattern.exec(ua)?.[1];
    if (version) { browser = `${name} ${version}`; break; }
  }
  let gpu: string | null = null;
  try {
    const ext = context.getExtension('WEBGL_debug_renderer_info');
    const label = ext && context.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    if (typeof label === 'string' && label.trim()) gpu = label.trim().slice(0, 160);
  } catch { /* 浏览器不提供 GPU 型号时保留未知。 */ }
  return {
    os, browser, gpu, graphics, controls: touch ? 'touch' : 'desktop',
    viewport: [window.innerWidth, window.innerHeight],
    dpr: Math.round(window.devicePixelRatio * 100) / 100,
    cores: n.hardwareConcurrency || null,
    memoryGb: n.deviceMemory || null,
  };
}

type FeedbackReceipt = { status: number; id?: string };

function receiptId(receipt: FeedbackReceipt): string {
  if (receipt.status === 429) throw new Error('rate-limit');
  if (receipt.status !== 201) throw new Error('unavailable');
  if (typeof receipt.id !== 'string' || !/^[0-9a-f]{12}$/.test(receipt.id)) throw new Error('bad-receipt');
  return receipt.id;
}

export async function sendFeedback(submission: FeedbackSubmission): Promise<string> {
  const { webkit } = window as Window & {
    webkit?: { messageHandlers?: { wdFeedback?: { postMessage(payload: string): Promise<FeedbackReceipt> } } };
  };
  const payload = JSON.stringify(submission);
  const bridge = webkit?.messageHandlers?.wdFeedback;
  if (bridge) return receiptId(await bridge.postMessage(payload));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    // 游戏放在子目录（网站的 /play/）时，构建用 VITE_FEEDBACK_URL 指回网站根部的接口。
    const url: string = import.meta.env.VITE_FEEDBACK_URL || `${import.meta.env.BASE_URL}api/feedback`;
    const response = await fetch(url, {
      method: 'POST', credentials: 'same-origin', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    const id = response.status === 201 ? (await response.json() as { id?: string }).id : undefined;
    return receiptId({ status: response.status, id });
  } finally {
    clearTimeout(timer);
  }
}
