# docs/perf/harness/
> L2 | 父级: ../../../CLAUDE.md

cdp.mjs: 启动独立 Chrome，提供静态服务、浏览器控制和计时工具。
bench.mjs: 测量已固定关卡和镜头的帧时间。
boot.mjs: 测量标题页冷启动。
census.mjs: 统计场景的绘制来源。
mobile.mjs: 采样移动端尺寸下的绘制。
payload.mjs: 统计资源传输和启动阶段。
pixdiff.mjs: 对比画面像素。
profloop.mjs: 采样稳定场景的帧循环。
profroute.mjs: 采样移动路线的帧循环。
route.mjs: 运行固定路线并记录每段性能。
run1.mjs: 调用驱动执行首关测量。
scan.mjs: 检查可见物体和绘制分组。
ab.js: 网页内的优化对照采样。
audit.js: 网页内的渲染场景检查。
probe.js: 网页内的绘制和纹理采样。
rebuild.js: 网页内固定位置并重建合批。
remain.js: 网页内核对剩余绘制调用。
switch.js: 网页内切换关卡以采样。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
