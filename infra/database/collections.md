# V1 数据库集合

所有用户共用一个 CloudBase 环境和同一组集合，并通过服务端派生的内部用户 ID 做逻辑隔离；不是每位用户创建一套数据库。计划、记录、照片票据、朋友关系和提醒任务都保存在云端。客户端不能提交可信用户 ID，也不能直接读写集合。

V1 创建以下集合：

| 集合 | 用途 | 客户端权限 |
|---|---|---|
| `users` | 小程序身份与当前方案指针 | 仅管理端 |
| `regimen_versions` | 每位用户的当前药板方案与历史修正（21+7、优思悦 24+4） | 仅管理端 |
| `dose_records` | 每日已服/未服事实 | 仅管理端 |
| `photo_uploads` | 照片上传票据与服药记录绑定状态 | 仅管理端 |
| `care_invites` | 48 小时单次朋友邀请 | 仅管理端 |
| `care_links` | 服药用户与监督朋友的关系、本人是否允许逾期提醒 | 仅管理端 |
| `subscription_grants` | 一次性订阅授权近似账本 | 仅管理端 |
| `reminder_jobs` | at-most-once 微信提醒任务 | 仅管理端 |
| `idempotency_requests` | 写请求幂等状态 | 仅管理端 |

所有读写由 `app-api` 或 `reminder-dispatcher` 完成。不要从小程序页面调用 `wx.cloud.database()`。朋友提醒授权仍存入既有 `subscription_grants`，提醒任务仍存入 `reminder_jobs`，通过 `templateKey=CAREGIVER_OVERDUE` 与本人提醒隔离。

`users` 中的原始 `OPENID` 仅供云函数识别用户和发送微信订阅消息。微信号、微信昵称、头像和手机号不会被自动取得或保存；朋友称呼只是用户主动填写的应用内字段。

服药照片本体保存在云存储；`photo_uploads` 只保存一小时有效的上传路径票据和绑定状态，不保存图片二进制。

集合建立后必须在开发环境执行权限测试：普通客户端对任一集合的 get/add/update/remove 均应失败，而 `app-api` 使用管理端数据库客户端可以访问。
