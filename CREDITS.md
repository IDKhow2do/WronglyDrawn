# 致谢与来源 · Credits

《错画之城》由巴特歪设计、导演和发布。全部代码由 AI 编写，大部分美术素材也是和 AI 一起做出来的。下面写清楚每样东西从哪儿来。

Wrongly Drawn is designed, directed and published by 巴特歪. All of its code was written by AI, and most of its art was made together with AI. This file states where each part comes from.

## 代码 · Code

| 部分 | 来源 |
|---|---|
| 游戏代码（TypeScript）及安卓、发布脚本 | 全部由 AI 编写（Claude Code、Codex），作者设计、导演和验收 |
| 渲染 | [three.js](https://threejs.org/) 0.187，MIT |
| 物理 | [Rapier](https://rapier.rs/)（`@dimforge/rapier3d-compat` 0.21），Apache-2.0 |
| 构建 | [Vite](https://vite.dev/) 8、[TypeScript](https://www.typescriptlang.org/) 7 |
| 模型压缩 | [glTF Transform](https://gltf-transform.dev/) |

## 美术与模型 · Art and models

| 部分 | 怎么做的 |
|---|---|
| 概念图、三视图、贴图、壁画、贴纸、增益插画、大肥鱼表情 | Codex 的图像生成，按作者的设定和参考图绘制 |
| 3D 模型（WAI、怪物、建筑部件、大肥鱼等，`public/models/`） | [Tripo](https://www.tripo3d.ai/) 多视图生成，再由作者拆件、设枢轴、绑定并接入游戏；每个模型的参数见 [docs/ASSETS.md](docs/ASSETS.md) |
| 红笔 Boss | 笔身由 Tripo 多视图生成。眼睛、弱点和旧版笔身由代码绘制，见 [docs/level3/SOULS.md](docs/level3/SOULS.md)。 |
| 盖章机、留声机等 | 用代码拼出来的程序化模型 |
| 道具和装备图标 | 代码里手写的 SVG（`src/ui/ItemArt.ts`） |

## 声音 · Sound

| 部分 | 来源 | 许可 |
|---|---|---|
| 配乐 | cynicmusic、Juhani Junkala、yd、Ville Nousiainen / XCVG、Bobjt，来自 OpenGameArt | CC0 1.0，逐曲清单见 [public/audio/music/CREDITS.md](public/audio/music/CREDITS.md) |
| 音效 | [Kenney](https://kenney.nl) 的多个音效包 | CC0 1.0，见 [public/audio/sfx/CREDITS.md](public/audio/sfx/CREDITS.md) |
| 其余音效 | 用 WebAudio 实时合成 | — |

## 字体 · Font

小赖字体（Xiaolai）的游戏用字子集，SIL Open Font License 1.1，版权归 LXGW 与 Nozomi Seto，见 [public/fonts/OFL-Xiaolai.txt](public/fonts/OFL-Xiaolai.txt)。

## AI 队友 · The AI partner

大肥鱼自带一个不联网的规则脑。玩家可以填自己的 DeepSeek 密钥让她聊天和听指挥；密钥只存在玩家自己的浏览器里，游戏的服务器不接触它。
