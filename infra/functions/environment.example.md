# 云函数环境变量

在 CloudBase 控制台配置，不提交真实值。

## app-api

```text
USER_ID_HASH_SECRET=<至少 32 字节随机值>
SELF_DUE_TEMPLATE_ID=<公众平台的一次性模板 ID>
# 可选；不配置时朋友提醒复用 SELF_DUE_TEMPLATE_ID
CAREGIVER_OVERDUE_TEMPLATE_ID=<可选的朋友提醒模板 ID>
MINIPROGRAM_STATE=developer
```

## reminder-dispatcher

```text
SELF_DUE_TEMPLATE_ID=<与 app-api 相同>
# 可选；不配置时朋友提醒任务使用其登记时保存的 SELF_DUE_TEMPLATE_ID
CAREGIVER_OVERDUE_TEMPLATE_ID=<可选的朋友提醒模板 ID>
MINIPROGRAM_STATE=developer
```

体验版改为 `trial`，正式版改为 `formal`。

## 模板映射发布门槛

本人和朋友提醒复用“吃药提醒”模板的 `thing1`、`time15`、`thing5`。两类授权仍以 `SELF_DUE` 与 `CAREGIVER_OVERDUE` 分开落库；朋友内容使用主动填写的称呼，且不出现具体药名、方案或照片。
