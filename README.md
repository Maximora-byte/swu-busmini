# SWU Go

SWU Go 是面向西南大学北碚校区的非官方、开源校园校车导航微信小程序。项目首先解决“从哪里上车、坐哪一路、往哪个方向、在哪里下车”的问题，并保证在没有实时车辆数据时仍可使用。

> 本项目为学生个人开发的非官方项目，与西南大学官方不存在隶属或授权关系。

## 当前状态

项目已完成 **Phase 15：1 路真实线路 Demo 数据闭环校验流程**。1 路正反方向、站点引用、轨迹状态、缺失坐标预检、人工审核和生产展示门禁均已贯通。当前 1 路的 7 个相关站点仍缺少现场 verified 坐标，因此真实轨迹状态为 `missing`，页面安全回退为方向、站序和灵活停靠提示，不会绘制或请求猜测轨迹。

线路数据第一版来源为《西南大学北碚校区校园地图（2025）》左上角线路表，仅用于确认线路编号、图示站名、站序和环线结构。2026 年实际运营方向、站牌名称和停靠情况仍需结合官方通知、现场站牌与实际乘车复核。

当前共有 22 个去重站点，其中 20 个被 1～9 路引用；一号门和图书馆是从上一版数据保留的待核实站点。所有站点坐标均为 `null`，不会从图片像素位置推算 GPS。未经过现场 GCJ-02 校准的站点不会显示 marker。

定位功能仍能识别权限拒绝、超时、无效结果和系统定位失败。水平误差超过 100 米时保留定位结果，并显示低精度提示。

地图默认以已有校园中心显示西大周边；首次定位只更新当前位置和状态，保持校园视野。工具栏可切换“校园全览”“北碚城区”，或主动查看“我的位置”。`setBoundary` 和缩放限制仍约束北碚城区浏览范围；范围外定位会回退到校园视野。矩形窗口只是界面配置，不是精确行政区或校园边界，也不作为校车站点坐标来源。

## 运行方式

1. 安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。
2. 克隆仓库，并在开发者工具中导入仓库根目录。
3. 没有小程序 AppID 时使用游客模式；正式调试时在开发者工具的项目设置中换成自己的 AppID。
4. 执行 `npm install` 安装开发依赖。
5. 执行 `npm run typecheck` 进行 TypeScript 静态检查，执行 `npm run validate:data` 校验静态线路数据，执行 `npm test` 运行全部测试。

真机测试定位前，还需要在微信公众平台完成《小程序用户隐私保护指引》中的位置信息用途声明。开发者工具可模拟位置，但其结果不能替代真机的 GPS 与权限拒绝场景测试。

基础 `map` 组件不需要腾讯位置服务 Key。使用腾讯地理编码或步行路线能力时，复制 `miniprogram/config/config.example.ts` 为已被 Git 忽略的 `config.local.ts`，填写自己的 WebService Key，并在腾讯位置服务控制台配置小程序请求来源及 `https://apis.map.qq.com` 合法域名；不要提交真实 Key。

## 计划目录

```text
miniprogram/
├── pages/                 # 页面，只负责展示和用户交互
├── components/            # 可复用界面组件（按需创建）
├── config/                # 配置模板；本地密钥不入库
├── data/                  # 微信运行时 TypeScript Data Adapter 与离线 JSON 镜像
├── models/                # 稳定的 TypeScript 领域模型
├── services/
│   ├── location/          # 微信定位能力
│   ├── map/               # 腾讯地图和路线 API 适配
│   ├── navigation/        # 上下车站选择与路线计算
│   ├── repository/        # TypeScript Data Adapter / CloudBase 数据访问边界
│   ├── validation/        # 可复用的线路数据质量规则
│   └── vehicle/           # 可插拔实时车辆 Provider
└── utils/                 # 距离等无业务状态的工具函数
```

目录会在功能真正需要时创建，避免一开始生成大量空文件。页面不直接承担路线算法或数据访问，方便以后从本地静态 Data Adapter 切换到 CloudBase。

## 核心数据模型

模型定义位于 `miniprogram/models/index.ts`：

- `BusStop`：站点名称、别名和坐标；
- `BusStopCoordinate`：带 `verified` 状态的 GCJ-02 站点坐标；
- `VerifiedBusStop`：Repository 已验证、可以交给地图的站点类型；
- `BusDirection`：一个方向、已知有序站点 ID，以及可选的人工确认 GCJ-02 线路轨迹；
- `BusRoute`：包含一个或多个方向、服务类型、沿途停靠策略和数据可信状态的校车线路；
- `RouteGeometry`：以线路 ID、方向 ID 和 GCJ-02 点列表示的厂商无关线路轨迹；
- `RouteGeometryCacheEntry`：以出行模式、起终点和返回点列保存的开发阶段 API 缓存；
- `RouteNavigation`：线路方向、已知参考站点、轨迹、服务类型和候车提示；
- `RouteNavigationViewModel`：页面可直接消费的单线路、单方向、已知站点、verified geometry 和停靠提示；
- `CampusPOI`：可搜索校园地点、分类、关联站点及数据状态，不包含推测坐标；
- `RouteRecommendation`：由地点关联关系推导出的候选线路、匹配站点、可用方向、服务类型和数据状态；
- `RoutePathRecommendation`：起点与终点之间按站序确认可直达的线路、上下车站、方向、服务类型、数据状态和提示；
- `NearestStopResult`：用户坐标到已验证站点的距离、站点标识、名称和坐标；
- `CandidateCoordinate`：外部地图服务返回、必须人工复核且固定为未验证状态的候选坐标；
- `CoordinateReview`：候选坐标针对目标站点的审核状态、来源和审核时间；
- `WalkingRouteResult`：以米、秒和 GCJ-02 折线表达的厂商无关步行路线结果；
- `Coordinate` 与 `Location`：统一的 GCJ-02 坐标及带精度的定位结果；
- `VehicleLocationProvider`：未来接入经授权实时车辆数据的可插拔边界。

`BusDirection.isLoop` 显式区分环线；普通重复 stopId 会被拒绝，环线首尾同站允许出现一次。图中 6 路和 9 路还明确重复经过二号门，因此使用 `allowedRepeatedStopIds` 单独声明。`BusStop.coordinate` 在未采集时为 `null`；已填写但尚未确认的坐标使用 `verified: false`，只有 `verified: true` 才能进入地图。所有坐标统一使用微信地图采用的 GCJ-02 坐标系。

校园车不完全等同于标准城市公交。`BusRoute.serviceType` 支持 `fixed_stop` 和 `flexible_campus_bus`；`allowIntermediateStop` 明确是否允许沿途停靠；`dataStatus` 使用 `needs_review` 或 `verified` 表示服务方式、方向和站序是否已经人工复核。`stopIds` 始终表示当前已知站点：固定站点线路的每个方向必须至少有一个已知站点，灵活校园车可以暂时使用空数组表达“完整站点集合尚未采集”，但已填写的站点仍必须存在于 `stops.json`。

## MVP 开发顺序

每一步单独运行、检查和验收后，再进入下一步：

1. 显示校园地图（已完成）；
2. 获取并显示用户位置（已完成）；
3. 建立 1 路静态站点和线路数据（已完成）；
4. 完成坐标验证、marker 管线和线路详情 UI（代码已完成；现场坐标采集待完成）；
5. 录入 1～9 路静态线路第一版并建立环线校验规则（已完成）；
6. 建立可供本地和 CI 使用的线路数据质量验证系统（已完成）；
7. 完成 CI 自动质量门禁并加固全局数据完整性规则（已完成）；
8. 建立校园 POI 模型、别名搜索和线路关联（已完成）；
9. 实现单线路直达推荐及灵活停靠提示（已完成）；
10. 实现起点-终点双端直达线路及方向匹配（已完成）；
11. 建立坐标、距离计算和最近已验证站点查询能力（已完成）；
12. 建立地图 Provider 抽象、腾讯位置服务适配与候选坐标流程（已完成）；
13. 建立候选坐标的人工审核、过滤和运行时应用流程（已完成）；
14. 建立以线路方向、已知站点和可选轨迹为核心的线路导航（已完成）；
15. 建立基于已验证站点和路线 API 缓存的离线轨迹生成 Pipeline（已完成）；
16. 完成线路列表、方向切换、站序和地图轨迹展示（已完成）；
17. 建立 1 路缺项检查、轨迹审核和生产展示门禁（已完成；现场坐标与真实轨迹待采集）；
18. 结合 2026 年站牌、通知和实际乘车复核线路、POI 关系、站点坐标及线路轨迹；
19. 在页面接入上车前、下车后的步行路线；
20. 增加路线排序、时刻表和多方案；
21. 稳定后迁移可变数据到 CloudBase；
22. 仅在获得正式授权接口后接入实时车辆。

## 定位服务设计

`miniprogram/services/location/location.service.ts` 封装微信定位 API，页面只调用 `getCurrentLocation()` 并展示返回状态。服务通过 `LocationPlatformApi` 隔离微信平台对象，因此可以在 Node.js 中注入假实现，独立测试权限、精度和错误分类逻辑。

## 校车数据设计

- `miniprogram/data/stops.ts` 保存微信运行时使用的去重站点记录；
- `miniprogram/data/routes.ts` 只用站点 ID 表达各方向的有序站点；
- `miniprogram/data/sources.json` 记录数据来源、允许用途和待复核状态；
- `miniprogram/data/coordinate-reviews.ts` 独立保存微信运行时使用的候选坐标及人工审核状态，不覆盖正式站点数据；
- `miniprogram/data/route-geometries.ts` 独立保存微信运行时使用的方向轨迹，不改写线路站序；
- 同名 JSON 文件是离线维护数据源，TypeScript Adapter 由 `npm run sync:data` 生成；CI 检查和一致性测试共同防止遗漏同步；
- `miniprogram/data/geometry-cache.json` 只由 Node.js 开发脚本读取，缓存分段路线结果并减少重复 API 消耗，不进入小程序运行时；
- Repository 负责读取和验证 TypeScript Data Adapter，禁止页面和 Service 直接导入静态数据文件；
- `getVerifiedStops()` 只返回坐标完整且明确标记 `verified: true` 的站点；
- Route Catalog Service 负责连接线路与站点，检查所有方向中的重复 stopId 和未定义站点，并只把已验证站点交给地图；
- 以后切换到 CloudBase 时可以替换 Repository，而不改变页面和领域模型。

当前已录入 1～9 路第一版，但不将其声明为 2026 年官方实时线路。图片中的“中图”完整名称、它与既有“图书馆”站的关系，以及图示双向箭头对应的实际运营方向仍需人工确认。项目不接入未经授权的实时公交接口。

线路记录的服务策略格式如下：

```json
{
  "id": "route_1",
  "name": "1路",
  "serviceType": "flexible_campus_bus",
  "allowIntermediateStop": true,
  "dataStatus": "needs_review",
  "directions": []
}
```

当前 1～9 路保留原有已知站序，并根据校园车允许沿途停靠的业务特征标记为 `flexible_campus_bus`。该策略仍处于 `needs_review`，不代表已经完成 2026 年现场运营核验。

## 校园 POI 知识层

`miniprogram/data/pois.ts` 保存微信运行时使用的少量高价值校园地点，字段包括稳定 ID、名称、别名、分类、关联站点 ID 和数据状态。POI 不包含 GPS 坐标，也不根据校园地图推算位置。第一版只包含图书馆、学生宿舍、二食堂、一号门和五号门；关系不确定的地点使用空 `relatedStopIds` 并保持 `needs_review`。

查询链路为：

```text
地点名称或别名
  → PoiRepository
  → CampusPOI.relatedStopIds
  → PoiRouteService
  → Route Catalog
  → 包含相关站点的线路
```

例如二食堂关联同名站点后可以查询到 4 路；图书馆与当前“图书馆 / 中图”站点关系尚未确认，因此不会猜测关联，也不会返回推测线路。当前 POI 坐标、真实步行距离和地点到站点的可达关系仍需后续现场校验。

## 单线路直达推荐

`RouteRecommendationService` 提供 `recommendRoutesForPoi(poiId)` 和 `searchAndRecommend(keyword)`。它只组合 POI Repository、POI 与站点关联服务及 Route Catalog，不直接读取 JSON，也不生成页面专用结构。

推荐流程为：

```text
目的地关键词
  → PoiRepository.search()
  → CampusPOI.relatedStopIds
  → Route Catalog 中包含相关站点的线路
  → RouteRecommendation（匹配站点、方向、服务方式、数据状态）
```

例如搜索“第二食堂”会命中二食堂，并推荐 4 路及其匹配方向。`flexible_campus_bus` 会附带“该线路支持沿途停靠，请结合现场情况确认上车位置”的提示。没有关联站点的 POI 返回空推荐，不会报错或猜测线路；不存在的 POI ID 会返回明确错误。

当前推荐不计算距离、不计算步行路线、不判断最近站点，也不代表实时车辆可用性。

## 起点-终点路线匹配

`OriginDestinationService.findDirectRoutes(originPoiId, destinationPoiId)` 通过 Repository 与 Route Catalog 查询数据，不直接读取 JSON。匹配链路为：

```text
起点 CampusPOI.relatedStopIds ─┐
                               ├→ 逐线路、逐方向检查有序 stopIds
终点 CampusPOI.relatedStopIds ─┘
                                  → RoutePathRecommendation[]
```

只有当某个起点关联站出现在同一方向的某个终点关联站之前时，该方向才会进入结果。同一线路的多个有效方向合并为一条领域结果，同时保留实际匹配的上下车站 ID。不存在的起点或终点 POI 会返回明确错误；POI 没有关联站点或不存在共同直达线路时返回空数组。

灵活校园车结果会提示“该线路支持沿途停靠，请结合现场情况确认上下车位置”，不承诺一定停靠。当前只计算静态线路连通性，不计算 GPS 或步行距离、不判断最近站点、不处理换乘，也不代表实时车辆状态。

## 空间能力基础层

`Coordinate` 统一表示微信地图使用的 GCJ-02 经纬度，不进行 WGS84 转换。`distanceBetween(a, b)` 是无状态纯函数，使用地球平均半径和 Haversine 公式计算两个坐标之间的球面距离，结果单位为米。

`NearestStopService.getNearestStops(origin)` 只通过 `BusStopRepository.getVerifiedStops()` 获取候选站点，计算距离后按由近到远排序，并返回 `NearestStopResult[]`。坐标为 `null` 或 `verified: false` 的站点不会参与计算；没有已验证站点时返回空数组。

当前正式数据仍没有完整的站点坐标，不会为了演示自动生成或从校园地图推算坐标。该能力只提供空间计算基础，不计算道路或步行距离、不判断实际步行可达性，也不提供步行导航。

## 地图服务适配层

`MapProvider` 是与厂商无关的地图能力边界，包含地理编码、逆地理编码、步行路线和驾车路线。`geocode()` 返回候选坐标数组：成功时可以包含一个或多个候选，查询无结果时返回空数组。业务与离线生成服务只依赖该接口，因此未来可以替换腾讯、高德或测试实现，不影响校园 POI、校车线路推荐和 OD 匹配逻辑。

```text
GeocodingService / WalkingRouteService
                  ↓
              MapProvider
                  ↓
 TencentMapProvider / MockProvider / future provider
```

`TencentMapProvider` 是腾讯位置服务 WebService 的唯一接入位置，内部封装 `wx.request`、腾讯响应解析、步行时长单位转换和压缩折线解码。当前适配端点为：

- `/ws/geocoder/v1/`：地址解析与逆地址解析；
- `/ws/direction/v1/walking/`：步行路线。
- `/ws/direction/v1/driving/`：仅供开发脚本离线生成候选线路轨迹。

腾讯地理编码结果只会形成 `CandidateCoordinate`，其 `verified` 固定为 `false`。候选坐标需要人工确认后，才能通过单独的数据维护流程转成正式 `BusStop.coordinate`；服务不会写入 Repository，也不会自动修改 `stops.json`。腾讯位置服务只提供地理能力，不参与决定校车线路、站点关系或推荐结果。

开发阶段可以执行一次单地址查询：

```bash
npm run geocode "西南大学北碚校区图书馆"
```

脚本在运行时读取被 Git 忽略的 `miniprogram/config/config.local.ts`，通过 `TencentMapProvider` 发起真实请求，并只向终端输出未验证候选数组。脚本不会写入任何 JSON，不会覆盖现有坐标，也不会把候选自动标记为已验证。腾讯 API 返回错误时命令以非零退出码结束；查询无结果时正常输出空数组。

## 坐标人工审核

外部地图结果遵循独立审核状态流：

```text
CandidateCoordinate
  → pending_review
  → verified / rejected
```

运行以下命令可以查看所有待确认坐标：

```bash
npm run review:coordinates
```

微信运行时审核记录由 `miniprogram/data/coordinate-reviews.ts` 提供，`coordinate-reviews.json` 保留为离线维护镜像。`pending_review` 的 `reviewedAt` 必须为 `null`；只有人工核对后才能将状态改为 `verified` 或 `rejected`，同时填写审核时间。候选对象本身始终保持 `verified: false`，审核服务只在运行时将 `status: verified` 的记录转换为可供地图和最近站点服务使用的已验证坐标。

`ReviewedBusStopRepository` 是正式站点 Repository 的只读装饰层：它不会写入或覆盖 `stops.json`，不会覆盖已经存在的正式坐标，并会过滤待审核和已拒绝候选。当前图书馆腾讯坐标仅作为 `pending_review` 示例保存，因此不会显示 marker，也不会参与最近站点计算。

## 线路导航

`RouteNavigationService` 提供线路列表、方向选项和 `getRouteNavigation(routeId, directionId)`。指定方向查询返回 `RouteNavigationViewModel`，其中只包含页面需要的线路名称、方向、服务类型、已知参考站点、verified geometry 和候车提示。线路轨迹不存在时不会阻止查询，页面继续显示已知站序并明确提示轨迹待人工采集。

```text
RouteRepository / Route Catalog
              ↓
   RouteNavigationService
              ↓
RouteNavigationViewModel
              ↓
Page → marker / RoutePolylineService → 微信 map
```

`RoutePolylineService` 只把厂商无关的 `RouteGeometry` 转换成微信地图需要的 `points`、`color` 和 `width`，不会补点、推算轨迹或转换坐标系。轨迹必须使用经过人工采集或核对的 GCJ-02 坐标；当前正式 1～9 路尚未录入轨迹，所以地图不会绘制猜测线路。

对于 `allowIntermediateStop: true` 的校园灵活停靠线路，线路导航显示“该线路支持沿途停靠，请结合现场情况选择安全位置候车”。已知站点仅作为线路运行参考，不代表只能在固定站点上下车。

页面通过 Service 获取 1～9 路列表，方向按钮同时显示方向名称和首末已知站点摘要。切换线路或方向后，站序、verified marker 与 verified polyline 会一起刷新；当前位置由独立定位服务维护，不会被线路切换清除。

对照 2025 校园地图的展示优化：

- 1～9 路选择入口始终可见，按原图色系区分线路；已验证轨迹使用对应线路色。
- 1～5 路标示往返线路，6～9 路标示环线。环线摘要显示前三个参考站点及返回站，方便区分方向。
- 站序保留中途重访和首尾闭合，并标示“再次经过”“返回起点”；地图同一站点只绘制一个标记。
- 线路详情整体滚动，包含已知参考站序、灵活停靠提示、坐标/轨迹待确认状态及数据年份说明。
- `RouteMapPresentationService` 统一生成展示状态、颜色、标记和轨迹，页面不组合领域数据或读取静态数据。

2026-09-22 再次对照用户提供的原图核对，1～9 路已录入站序未发现差异，4 路第二站仍为“二食堂”；9 路“中图”的全称及其与“图书馆”的关系继续待人工确认。本次仅调整展示，没有新增坐标、推算校园轮廓或将 2025 图中的运营时间用作当前时刻表。

微信开发者工具/真机验收：打开后检查校园默认视野；切换校园/城区并拖动后再次点击回到校园；模拟外地位置确认镜头不会跳走；左右滑动选择 1～9 路，重点检查 6/9 路方向摘要和重复站标签；展开详情后滚动至底部，确认提示在小屏幕上可见。当前无 verified 轨迹，地图不绘制线路属于预期行为。

当前线路导航不计算最近上车点、步行距离、预计到达时间或实时车辆，也不承诺图示线路与当日实际运营完全一致。

## 离线线路轨迹生成

`RouteGeometryGeneratorService` 根据一个方向的 `stopIds` 从 `BusStopRepository.getVerifiedStops()` 读取已验证 GCJ-02 坐标，并逐段调用 `MapProvider.drivingRoute()`。各段折线按站序合并，相邻重复点会被删除；任何站点缺少已验证坐标时立即停止，不会用候选坐标或图片位置补齐。

```text
BusDirection.stopIds
        ↓
VerifiedBusStop 坐标
        ↓
geometry-cache.json（优先命中）
        ↓ 未命中
MapProvider.drivingRoute()
        ↓
合并分段、去除相邻重复点
        ↓
生成器结果（generated）
        ↓ 写入审核队列
route-geometries.json（needs_review）
        ↓ 人工 approve
verified → RouteNavigation → 地图 polyline
```

开发阶段运行：

```bash
npm run generate:geometry route_1
```

脚本会先检查目标方向的全部站点是否具有 verified 坐标；存在缺项时直接输出 `missing coordinate`，不会读取 Key、创建 Provider 或发起腾讯请求。预检通过后才由 `TencentMapProvider` 调用 `/ws/direction/v1/driving/`。生成器返回 `generated`，写入独立审核文件时转为 `needs_review`；必须人工核对来源、方向和轨迹后才能改为 `verified`。脚本不会修改 `routes.json` 或 `stops.json`。

缓存键由出行模式、起点经纬度和终点经纬度组成，方向不同会使用不同缓存项。即使一次生成在后续分段失败，已经成功获得的分段仍会写入缓存，避免再次消耗额度。

`RouteGeometryRepository` 同时提供普通查询和已验证查询；运行时 `RouteNavigationService` 只调用 `getVerifiedGeometry()`。小程序页面不会构造 `TencentMapProvider`，用户查看、切换或查询线路时不会实时请求腾讯路线 API。当前正式站点坐标不足，因此仓库中的轨迹文件保持为空，不会为了演示生成假轨迹。

## 1 路 Demo 审核闭环

运行以下命令查看 1 路两个方向、首末站、轨迹状态、点数量和缺失坐标：

```bash
npm run review:geometry
```

当前检查结果为：正向“经管院 → 五号门”、反向“五号门 → 经管院”，两方向均为 `missing`、点数量为 0；缺少 `jingguanyuan`、`gate_6`、`gate_2`、`building_8`、`tianjiabing`、`yuanding`、`gate_5` 的 verified 坐标。该结果是数据缺口，不会用地图图片或腾讯候选坐标补齐。

生成候选后，使用明确方向名称执行人工审核：

```bash
npm run review:geometry route_1 approve "图示正向"
npm run review:geometry route_1 reject "图示正向"
```

`approve` 将已有 `generated` 或 `needs_review` 候选改为 `verified`；`reject` 将候选从轨迹数据集中移除。两者都不会修改 `routes.json`。生产页面只读取 `verified`，开发测试可以通过 Service 的 `previewUnverifiedGeometry` 显式查看未审核轨迹。

## 数据维护与校验

维护 `stops.json`、`routes.json`、`pois.json`、`coordinate-reviews.json`、`route-geometries.json` 后运行：

```bash
npm run sync:data
npm run check:data-sync
```

JSON 是离线编辑入口，生成的同名 `.ts` 是微信运行时 Data Adapter；请将两者一起提交。同步只复制数据，不生成坐标，也不改变审核状态。脚本先解析全部 JSON，再更新 Adapter；同步不代替领域校验，需要继续执行以下校验与测试。轨迹生成和审核脚本使用同一生成逻辑，自动同步两种文件。

`check:data-sync` 只读检查，发现缺失或过期的 Adapter 时以退出码 1 结束。运行时保持 `Page → Service → Repository → Data Adapter`。启动回归测试使用只允许 TypeScript 编译后 JS 模块的加载器，检查首页依赖及 1～9 路方向查询，拒绝 JSON、Node 模块和本地密钥依赖；它不能替代微信开发者工具和真机上的地图、定位验收。

新增或修改线路、站点、方向或来源信息后，必须执行：

```bash
npm run validate:data
```

命令会逐条输出线路、POI、坐标审核与线路轨迹检查结果，并以退出码 `0` 表示全部通过、退出码 `1` 表示存在数据错误，可直接用于 CI。除既有规则外，每条线路轨迹必须引用存在的线路和方向、包含至少两个合法坐标点；已验证轨迹必须注明来源。站点坐标和线路轨迹经纬度范围分别为 `-90～90` 和 `-180～180`。

线路数据录入时先在 `sources.json` 登记来源及复核状态，再按原始资料录入站名和顺序。图片资料只用于其能够清晰支持的信息，不用于推算坐标；状态保持 `needs_review`，直到结合当年官方通知、现场站牌和实际乘车完成人工复核。提交前应依次运行 `npm run validate:data`、`npm run typecheck` 和 `npm test`。

## 持续集成

GitHub Actions 工作流位于 `.github/workflows/ci.yml`，在针对 `main` 的 push 和 pull request 上使用 Node.js 24 LTS 自动执行：

```bash
npm ci
npm run check:data-sync
npm run validate:data
npm run typecheck
npm test
```

任意一步失败都会使 workflow 失败。修改 `routes.ts`、`stops.ts`、对应 JSON 镜像、`sources.json` 或其他 TypeScript 代码后，必须先通过本地验证和 CI，才能合并数据变更。

## 安全与数据原则

- 不提交 AppSecret、地图 Key、访问令牌、Cookie 或用户身份数据；
- 不调用或逆向未经授权的私有校车接口；
- 线路与站点数据需要注明来源并由校园实地信息校验；
- 实时车辆不是 MVP 的运行前提。

## License

[MIT](LICENSE)
