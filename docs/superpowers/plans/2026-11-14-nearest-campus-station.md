# Nearest campus station implementation plan

**Goal:** 地图点选位置后推荐最近可用站区，并从手机当前位置打开到站导航。
**Architecture:** 独立只读附近站区服务，复用地图浮层及wx.openLocation。
**Tech Stack:** TypeScript、WXML、WXSS、node:test、官方开发工具自动化。
**Spec:** ../specs/2026-11-14-nearest-campus-station-design.md

## Constraints and review focus
- 站区去重，目标使用最近可用原始记录，范围800米，最多3个。
- 所选点只用于找站，导航起点为手机当前位置；直线距离不是步行路线。
- 不新增定位、密钥、插件或付费请求；不改原始资料。
- 显式OD选点优先，附近查站不改变行程；关闭可恢复。
- 导航失败、重复点击、过期回调与隐藏生命周期须回归。

## Tasks
- [x] 附近站区服务先失败后通过：去重、隔离、范围、原始坐标和防御副本。
- [x] 地图点选／附近卡片／导航操作和状态回归。
- [x] 运行规定检查、开发者工具回归与独立复核。
- [ ] 脱敏后提交PR及发布候选，平台状态按实际回执记录。
