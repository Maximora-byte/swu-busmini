# Station reference directions implementation plan

**Goal:** 每个相近站区最多两个参考方向，选择后规划遵守该方向。
**Architecture:** 独立方向展示服务与可选端点visit约束；原始数据不改。
**Spec:** ../specs/2026-11-14-station-reference-directions-design.md
**Tech Stack:** TypeScript、WXML、WXSS、node:test、官方开发工具自动化。

## Constraints and review focus
- 同名80米完整组距、公开别名白名单，不生成物理两侧坐标。
- 局部几何方向不是已确认运营方向；分岔和零长段不强制归类。
- 直达与换乘首尾、重复经过、隔离点、最近候选截断均须遵守方向限制。
- 编辑、交换、定位与原生选点应正确重置或保留各端点限制。
- 不冒称模拟器检查为手机体验版或平台审核验收。

## Tasks
- [x] 先写方向聚合与规划约束失败用例，再实现服务。
- [x] 改为两个参考方向卡片，加入页面状态生命周期回归。
- [x] 完成所有数据／类型／覆盖率检查及最终候选开发工具检查。
- [ ] 独立复核、脱敏、PR及新版本上传；审核状态按实际证据记录。
