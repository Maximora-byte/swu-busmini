# 享坐车静态数据公交导航

用户要求取得完整静态站点/轨迹，实施不依赖实时车辆的公交导航并提交PR；另要求完整本地保存、上传脱敏。已有PR9保留，本分支基于它单独提交。

## 已取得的证据

从用户正常打开的享坐车会话取得十条线路、162个站点节点以及对应绘制轨迹。凭证未保存，原始静态快照与采集工具保留本地。采集的旧bus_line字段在7/8号线等包含外地占位坐标，导航只采用小程序schoolLine实际绘制的、按line_id对应的西大几何。

节点数组不是行车排序。按原客户端的站点投影里程排序构造两个轨迹方向，明确标注依据为运营方客户端的正/反里程规则；不声称另取得独立上下行车道轨迹。发布的6/7/8轨迹未闭合，不补尾到头的猜测道路或套用旧环线，规划仅覆盖提供的路径范围。

## 产品与资料边界

增加独立公交导航页作为默认入口，旧index页保留2025资料并可返回。当前导航使用独立数据集，历史POI、轨迹和9路不混入。支持按实际站点起终点查询、我的位置选候车点、直达/一次换乘、上/下车名称及乘车区段图。无车辆、ETA或等待时间依赖。

地图显示运营方发布坐标/轨迹及日期，不冒称实地审核。站点投影偏移超过35米时提示；超过150米或坐标不在北碚范围时拒绝导入。步行接驳只提供直线距离及打开站点地图，不将两点连线称作步行道路。

物理站ID由原始名称与六位小数坐标共同决定；不同名或不同位置不按模糊相似合并。换乘只连接确证同名同位置的站ID。visit保留sourceIndex、沿线锚点和里程，裁剪使用出现位置，不用站名猜路径。

## 稳定接口

`models/current-transit.ts`: TransitStop(id,name,coordinate), TransitVisit(stopId,sourceIndex,segmentIndex,ratio,mileageMeters,offsetMeters), TransitRoute(id,name,color,points,visits,warnings), TransitDataset(id,source,observedAt,coordinateSystem,quality,stops,routes)。所有发布轨迹按输入顺序保留；visits按投影里程排序。

Repository: `currentTransitRepository.getDataset()/getStop(id)/getRoute(id)`；工厂验证unknown输入与返回防御副本。

Planner: `createTransitJourneyService(dataset)`，`plan(origin,destination): TransitJourneyResult`。endpoint为 `{kind:'stop',stopId}` 或 `{kind:'coordinate',coordinate}`。结果含最多六个journeys及message；journey含id、legs、accessDistanceMeters、egressDistanceMeters、rideDistanceMeters、transferStopId?、warnings；leg含routeId/routeName/color、directionId('forward'|'reverse')、boardingStopId/alightingStopId、boardingVisitIndex/alightingVisitIndex、stopIds、points和distanceMeters。坐标候选取800米内最多六站；未知/无效端点明确拒绝；排序换乘数→接驳直线距离→乘车里程，不声明最快。

## 验证与交付

导入可重现；校验十线、站点身份、几何关联、范围、锚点、排序与脱敏。合成测试覆盖反向、重复站、相同坐标不同名、同名异点、次近站可达、无数据、定位拒绝/旧回调和乘车区段显示。新增模板需wcc/wcsc编译；完整data-sync/validate/typecheck/coverage通过，独立审查后开PR，不合并。真机未验收应明确报告。
