# 云函数环境变量

在 CloudBase 控制台配置，不提交真实值。

## app-api

```text
USER_ID_HASH_SECRET=<至少 32 字节随机值>
SELF_DUE_TEMPLATE_ID=<公众平台的一次性模板 ID>
MINIPROGRAM_STATE=developer
```

## reminder-dispatcher

```text
SELF_DUE_TEMPLATE_ID=<与 app-api 相同>
MINIPROGRAM_STATE=developer
```

体验版改为 `trial`，正式版改为 `formal`。

## 模板映射发布门槛

`reminder-dispatcher/src/index.ts` 当前使用占位 keyword：`thing1`、`time2`、`thing3`。必须根据公众平台实际选中的模板修改并在体验版真机验证；未确认前不得发布到正式环境。
