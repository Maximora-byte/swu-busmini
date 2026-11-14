# Unified stations implementation plan

**Goal:** 统一重叠站点图钉，展示途经线路，保留原始乘降身份。
**Architecture:** 独立展示分组服务，页面复用地图浮层和现有规划入口。
**Tech Stack:** TypeScript、WXML、WXSS、node:test。
**Spec:** ../specs/2026-11-14-unified-stations-design.md

## Constraints
- 同名、完整组内距离≤20米；使用已发布坐标；不更改源数据和换乘规则。
- 不把几何站序作为实际运营方向；不新增权限或实时数据。

## Review focus
- 距离链条不能串联远点，源数据不能被修改。
- 途经线路按route/visit保留隔离状态和重复经过。
- 线路切换、规划、卡片关闭不能留下旧卡片。
- 统一卡片通用操作自动比较线路，单条操作定位到原始记录。

## Tasks
- [x] 写分组与卡片交互测试，验证先失败。
- [x] 增加展示分组服务，地图图钉引用站区和源记录集合。
- [x] 增加途经线路卡片、关闭/看线/起终点操作。
- [x] 运行针对测试和仓库规定检查；检查脱敏差异并提交变更。
