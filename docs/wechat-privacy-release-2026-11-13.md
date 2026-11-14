# 微信位置接口与隐私发布核对（2026-11-13）

本清单用于 SWUGo 校园出行的 `getLocation`、`chooseLocation` 上线准备。代码配置和模拟测试不能证明微信后台已开通接口、隐私保护指引已发布，或真实设备已通过验收；这些项目须以当前小程序后台与体验版结果为准。

## 后台核对

- 在小程序管理后台「开发 → 开发管理 → 接口设置」核对 `getLocation` 和 `chooseLocation` 的申请与开通状态。`chooseLocation` 面向与地理位置强相关的使用场景，校园附近校车站推荐及乘车规划应如实描述。
- 在后台用户隐私保护指引中按实际数据用途补齐当前位置、地图选中位置相关声明，并确认已提交、发布且覆盖当前接口；具体项目名称以后台当前表单为准。
- 逐项核对代码中的 `requiredPrivateInfos` 和 `permission.scope.userLocation.desc` 与后台声明一致。声明列表不等同于接口权限开通。
- 使用后台实际运营者信息和有效隐私联系渠道。本文不提供虚构身份、联系方式或后台完成状态。

## 可用于后台填写的用途文字

> 在用户主动点击「我的位置」、「在腾讯地图中搜索并选点」，或确认目的地并使用默认「当前位置」起点规划时，使用用户的当前位置或主动选中的位置（地点名称、地址与经纬度），推荐附近的校园校车站，并规划起终点乘车方案。用户暂不同意隐私授权时，仍可浏览校车线路、搜索本地校园地点和指定站点。

这段内容是位置用途说明片段。完整指引还需由运营者按实际处理方式补齐保存期限、第三方处理、用户权利和联系渠道等后台要求的内容。调用微信原生地图能力所涉及的平台处理方式须与实际接入情况一致。

## 代码中的同意流程

`journey` 页面挂载 `privacy-consent` 组件。普通本地浏览与搜索不会主动请求隐私同意。微信在隐私接口需要同意时触发 `wx.onNeedPrivacyAuthorization`，组件展示用途、指引入口、暂不同意及同意按钮。

指引名称通过 `wx.getPrivacySetting` 读取，指引正文通过 `wx.openPrivacyContract` 打开。查询结果或打开指引均不会代替同意。只有原生 `<button open-type="agreePrivacyAuthorization">` 的同意事件才能以对应按钮 ID 继续等待中的请求；拒绝、关闭或组件卸载会拒绝等待中的请求。并发请求集中等待这次明确选择，不写入自行保存的同意标记。

阅读指引或暂时切到后台可能触发页面隐藏。当组件确实存在尚未选择的隐私请求时，页面保留等待中的定位请求；回到页面并由用户明确同意后，原请求可以继续。普通页面隐藏仍取消没有等待隐私选择的定位；页面卸载始终作废定位结果，组件卸载仍拒绝尚未完成的隐私请求。

微信没有公开 `offNeedPrivacyAuthorization` 接口，组件卸载时清除活动组件引用并拒绝尚未完成的请求；全局分发回调在没有活动组件时只拒绝请求。若将来增加其他需要隐私接口的页面，应复用统一分发机制，避免覆盖式监听相互抢占。

## 体验版发布前验收

请由真实用户在体验版中完成下列操作，记录结果而非推定成功。不要用自动化点击代替用户同意，也不要修改系统定位或微信隐私设置来伪造通过状态。

1. 未同意时先浏览线路、使用本地搜索及指定站点，确认无需位置授权。
2. 主动使用定位或腾讯地图选点，确认出现用途与指引入口；可打开后台正式隐私指引，名称与运营主体正确。
3. 分别选择暂不同意、关闭，确认请求结束且本地浏览和搜索仍能继续；重新点击位置功能可以再次选择。
4. 由用户明确同意，再按微信及系统实际提示决定是否给予位置权限。隐私同意不等于系统定位权限，也不等于后台接口开通。
5. 分别验收定位成功、拒绝位置权限、地图取消、有效选点、网络或平台不可用；用户选择有效地点后应出现附近校车站与乘车规划，取消不应替换原位置。
6. 核对开发者工具、基础库与真机体验版实际表现，确认后台开通与隐私指引发布后，再上传、提交审核和发布。每一步保留实际版本号及后台结果，不能将本地编译结果记为已发布。

## 官方依据

- [chooseLocation 接口、授权及开通说明](https://developers.weixin.qq.com/miniprogram/dev/api/location/wx.chooseLocation.html)
- [app.json requiredPrivateInfos 配置](https://developers.weixin.qq.com/miniprogram/dev/reference/configuration/app.html#requiredPrivateInfos)
- [隐私授权开发指南](https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/PrivacyAuthorize.html)
- [onNeedPrivacyAuthorization 与 pending resolve](https://developers.weixin.qq.com/miniprogram/dev/api/open-api/privacy/wx.onNeedPrivacyAuthorization.html)
- [getPrivacySetting](https://developers.weixin.qq.com/miniprogram/dev/api/open-api/privacy/wx.getPrivacySetting.html)
- [openPrivacyContract](https://developers.weixin.qq.com/miniprogram/dev/api/open-api/privacy/wx.openPrivacyContract.html)
