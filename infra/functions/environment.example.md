# 云函数环境变量

在 CloudBase 控制台配置，不提交真实值。

## app-api

```text
USER_ID_HASH_SECRET=<至少 32 字节随机值>
SELF_DUE_TEMPLATE_ID=<公众平台的一次性模板 ID>
CAREGIVER_OVERDUE_TEMPLATE_ID=<朋友逾期记录提醒的一次性模板 ID>
MINIPROGRAM_STATE=developer
```

## reminder-dispatcher

```text
SELF_DUE_TEMPLATE_ID=<与 app-api 相同>
CAREGIVER_OVERDUE_TEMPLATE_ID=<与 app-api 相同>
MINIPROGRAM_STATE=developer
```

体验版改为 `trial`，正式版改为 `formal`。

## 模板映射发布门槛

本人“吃药提醒”当前使用 `thing1`、`time15`、`thing5`。朋友提醒也暂按这三个字段构建，但必须根据公众平台实际选中的第二个模板核对字段；未确认前保持 `CAREGIVER_OVERDUE_TEMPLATE_ID` 与客户端 `careOverdueTemplateId` 为空，不得发送朋友提醒。
