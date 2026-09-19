# SWU Go

SWU Go 是面向西南大学北碚校区的非官方、开源校园校车导航微信小程序。项目首先解决“从哪里上车、坐哪一路、往哪个方向、在哪里下车”的问题，并保证在没有实时车辆数据时仍可使用。

> 本项目为学生个人开发的非官方项目，与西南大学官方不存在隶属或授权关系。

## 当前状态

项目已完成 **Phase 2：用户定位**。当前版本可以在微信开发者工具中打开，获取用户授权后的 GCJ-02 坐标，将地图移动到当前位置，并通过地图组件的 `show-location` 显示原生位置标记与定位状态。

定位功能能识别权限拒绝、超时、无效结果和系统定位失败。水平误差超过 100 米时仍保留定位结果，但明确显示低精度提示。当前暂不包含校车站 marker、线路和导航计算。

## 运行方式

1. 安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。
2. 克隆仓库，并在开发者工具中导入仓库根目录。
3. 没有小程序 AppID 时使用游客模式；正式调试时在开发者工具的项目设置中换成自己的 AppID。
4. 执行 `npm install` 安装开发依赖。
5. 执行 `npm run typecheck` 进行 TypeScript 静态检查，执行 `npm test` 运行定位服务单元测试。

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
│   └── vehicle/           # 可插拔实时车辆 Provider
└── utils/                 # 距离等无业务状态的工具函数
```

目录会在功能真正需要时创建，避免一开始生成大量空文件。页面不直接承担路线算法或数据访问，方便以后从本地 JSON 切换到 CloudBase。

## 核心数据模型

模型定义位于 `miniprogram/models/index.ts`：

- `BusStop`：站点名称、别名和坐标；
- `BusRoute`：一条线路的单个行驶方向及有序站点 ID；
- `CampusPOI`：可搜索校园地点及分类；
- `Coordinate` 与 `Location`：统一的 GCJ-02 坐标及带精度的定位结果；
- `VehicleLocationProvider`：未来接入经授权实时车辆数据的可插拔边界。

正反方向分别建模，可以明确站点顺序并避免环线或单向站点产生歧义。所有坐标统一使用微信地图采用的 GCJ-02 坐标系。

## MVP 开发顺序

每一步单独运行、检查和验收后，再进入下一步：

1. 显示校园地图（已完成）；
2. 获取并显示用户位置（已完成）；
3. 建立静态站点数据并显示测试站点 marker（下一步）；
4. 建立静态站点和线路数据，展示全部站点与单条线路；
5. 建立带别名的校园 POI 搜索；
6. 实现单线路直达推荐；
7. 接入上车前、下车后的步行路线；
8. 增加路线排序、时刻表和多方案；
9. 稳定后迁移可变数据到 CloudBase；
10. 仅在获得正式授权接口后接入实时车辆。

## 定位服务设计

`miniprogram/services/location/location.service.ts` 封装微信定位 API，页面只调用 `getCurrentLocation()` 并展示返回状态。服务通过 `LocationPlatformApi` 隔离微信平台对象，因此可以在 Node.js 中注入假实现，独立测试权限、精度和错误分类逻辑。

## 安全与数据原则

- 不提交 AppSecret、地图 Key、访问令牌、Cookie 或用户身份数据；
- 不调用或逆向未经授权的私有校车接口；
- 线路与站点数据需要注明来源并由校园实地信息校验；
- 实时车辆不是 MVP 的运行前提。

## License

[MIT](LICENSE)
