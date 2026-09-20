# SWU Go

SWU Go 是面向西南大学北碚校区的非官方、开源校园校车导航微信小程序。项目首先解决“从哪里上车、坐哪一路、往哪个方向、在哪里下车”的问题，并保证在没有实时车辆数据时仍可使用。

> 本项目为学生个人开发的非官方项目，与西南大学官方不存在隶属或授权关系。

## 当前状态

项目已完成 **Phase 5.1：CI 自动质量门禁与 Validator 加固**。当前版本可以获取并显示用户位置，在 1～9 路之间切换并查看图示方向和纵向站序；独立验证器与 CLI 会检查线路引用、唯一 ID、重复站点、环线结构、方向名称和来源元数据，GitHub Actions 会在 push 和 pull request 时自动执行完整检查。Repository 只允许 `verified: true` 的 GCJ-02 坐标进入地图 marker。

线路数据第一版来源为《西南大学北碚校区校园地图（2025）》左上角线路表，仅用于确认线路编号、图示站名、站序和环线结构。2026 年实际运营方向、站牌名称和停靠情况仍需结合官方通知、现场站牌与实际乘车复核。

当前共有 22 个去重站点，其中 20 个被 1～9 路引用；一号门和图书馆是从上一版数据保留的待核实站点。所有站点坐标均为 `null`，不会从图片像素位置推算 GPS。未经过现场 GCJ-02 校准的站点不会显示 marker。

定位功能仍能识别权限拒绝、超时、无效结果和系统定位失败。水平误差超过 100 米时保留定位结果，并显示低精度提示。

## 运行方式

1. 安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。
2. 克隆仓库，并在开发者工具中导入仓库根目录。
3. 没有小程序 AppID 时使用游客模式；正式调试时在开发者工具的项目设置中换成自己的 AppID。
4. 执行 `npm install` 安装开发依赖。
5. 执行 `npm run typecheck` 进行 TypeScript 静态检查，执行 `npm run validate:data` 校验静态线路数据，执行 `npm test` 运行全部测试。

真机测试定位前，还需要在微信公众平台完成《小程序用户隐私保护指引》中的位置信息用途声明。开发者工具可模拟位置，但其结果不能替代真机的 GPS 与权限拒绝场景测试。

基础 `map` 组件不需要腾讯位置服务 Key。后续接入地点搜索或步行路线服务时，将 Key 放入本地的 `miniprogram/config/config.local.ts`，不要提交到仓库。

## 计划目录

```text
miniprogram/
├── pages/                 # 页面，只负责展示和用户交互
├── components/            # 可复用界面组件（按需创建）
├── config/                # 配置模板；本地密钥不入库
├── data/                  # 初期静态线路、站点和 POI JSON
├── models/                # 稳定的 TypeScript 领域模型
├── services/
│   ├── location/          # 微信定位能力
│   ├── map/               # 腾讯地图和路线 API 适配
│   ├── navigation/        # 上下车站选择与路线计算
│   ├── repository/        # 本地 JSON / CloudBase 数据访问边界
│   ├── validation/        # 可复用的线路数据质量规则
│   └── vehicle/           # 可插拔实时车辆 Provider
└── utils/                 # 距离等无业务状态的工具函数
```

目录会在功能真正需要时创建，避免一开始生成大量空文件。页面不直接承担路线算法或数据访问，方便以后从本地 JSON 切换到 CloudBase。

## 核心数据模型

模型定义位于 `miniprogram/models/index.ts`：

- `BusStop`：站点名称、别名和坐标；
- `BusStopCoordinate`：带 `verified` 状态的 GCJ-02 站点坐标；
- `VerifiedBusStop`：Repository 已验证、可以交给地图的站点类型；
- `BusDirection`：一个方向及其有序站点 ID；
- `BusRoute`：包含一个或多个方向的校车线路；
- `CampusPOI`：可搜索校园地点及分类；
- `Coordinate` 与 `Location`：统一的 GCJ-02 坐标及带精度的定位结果；
- `VehicleLocationProvider`：未来接入经授权实时车辆数据的可插拔边界。

`BusDirection.isLoop` 显式区分环线；普通重复 stopId 会被拒绝，环线首尾同站允许出现一次。图中 6 路和 9 路还明确重复经过二号门，因此使用 `allowedRepeatedStopIds` 单独声明。`BusStop.coordinate` 在未采集时为 `null`；已填写但尚未确认的坐标使用 `verified: false`，只有 `verified: true` 才能进入地图。所有坐标统一使用微信地图采用的 GCJ-02 坐标系。

## MVP 开发顺序

每一步单独运行、检查和验收后，再进入下一步：

1. 显示校园地图（已完成）；
2. 获取并显示用户位置（已完成）；
3. 建立 1 路静态站点和线路数据（已完成）；
4. 完成坐标验证、marker 管线和线路详情 UI（代码已完成；现场坐标采集待完成）；
5. 录入 1～9 路静态线路第一版并建立环线校验规则（已完成）；
6. 建立可供本地和 CI 使用的线路数据质量验证系统（已完成）；
7. 完成 CI 自动质量门禁并加固全局数据完整性规则（已完成）；
8. 结合 2026 年站牌、通知和实际乘车复核线路数据；
9. 建立带别名的校园 POI 搜索；
10. 实现单线路直达推荐；
11. 接入上车前、下车后的步行路线；
12. 增加路线排序、时刻表和多方案；
13. 稳定后迁移可变数据到 CloudBase；
14. 仅在获得正式授权接口后接入实时车辆。

## 定位服务设计

`miniprogram/services/location/location.service.ts` 封装微信定位 API，页面只调用 `getCurrentLocation()` 并展示返回状态。服务通过 `LocationPlatformApi` 隔离微信平台对象，因此可以在 Node.js 中注入假实现，独立测试权限、精度和错误分类逻辑。

## 校车数据设计

- `miniprogram/data/stops.json` 保存去重后的站点记录；
- `miniprogram/data/routes.json` 只用站点 ID 表达各方向的有序站点；
- `miniprogram/data/sources.json` 记录数据来源、允许用途和待复核状态；
- Repository 负责读取和验证静态 JSON，禁止页面直接导入数据文件；
- `getVerifiedStops()` 只返回坐标完整且明确标记 `verified: true` 的站点；
- Route Catalog Service 负责连接线路与站点，检查所有方向中的重复 stopId 和未定义站点，并只把已验证站点交给地图；
- 以后切换到 CloudBase 时可以替换 Repository，而不改变页面和领域模型。

当前已录入 1～9 路第一版，但不将其声明为 2026 年官方实时线路。图片中的“中图”完整名称、它与既有“图书馆”站的关系，以及图示双向箭头对应的实际运营方向仍需人工确认。项目不接入未经授权的实时公交接口。

## 数据维护与校验

新增或修改线路、站点、方向或来源信息后，必须执行：

```bash
npm run validate:data
```

命令会逐条输出线路结果，并以退出码 `0` 表示全部通过、退出码 `1` 表示存在数据错误，可直接用于 CI。当前规则包括：线路、站点和来源 ID 必须唯一；所有 `stopId` 必须存在；普通线路不能重复经过同一站；环线必须首尾闭合，闭合站可以重复一次，其他重复站必须通过 `allowedRepeatedStopIds` 明确声明；线路至少包含一个方向且方向站点列表不能为空；方向名称不能为空；每条线路必须在 `sources.json` 中具有非空的 `source` 和 `status`；来源关联引用的线路与来源必须存在，且同一 `routeId + source` 不能重复声明。

线路数据录入时先在 `sources.json` 登记来源及复核状态，再按原始资料录入站名和顺序。图片资料只用于其能够清晰支持的信息，不用于推算坐标；状态保持 `needs_review`，直到结合当年官方通知、现场站牌和实际乘车完成人工复核。提交前应依次运行 `npm run validate:data`、`npm run typecheck` 和 `npm test`。

## 持续集成

GitHub Actions 工作流位于 `.github/workflows/ci.yml`，在针对 `main` 的 push 和 pull request 上使用 Node.js 24 LTS 自动执行：

```bash
npm ci
npm run validate:data
npm run typecheck
npm test
```

任意一步失败都会使 workflow 失败。修改 `routes.json`、`stops.json`、`sources.json` 或 TypeScript 代码后，必须先通过本地验证和 CI，才能合并数据变更。

## 安全与数据原则

- 不提交 AppSecret、地图 Key、访问令牌、Cookie 或用户身份数据；
- 不调用或逆向未经授权的私有校车接口；
- 线路与站点数据需要注明来源并由校园实地信息校验；
- 实时车辆不是 MVP 的运行前提。

## License

[MIT](LICENSE)
