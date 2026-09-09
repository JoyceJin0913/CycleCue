# V1 数据库集合

V1 创建以下集合：

| 集合 | 用途 | 客户端权限 |
|---|---|---|
| `users` | 小程序身份与当前方案指针 | 仅管理端 |
| `regimen_versions` | 21+7 方案版本 | 仅管理端 |
| `dose_records` | 每日已服/未服事实 | 仅管理端 |
| `photo_uploads` | 照片上传票据与服药记录绑定状态 | 仅管理端 |
| `care_invites` | 48 小时单次朋友邀请 | 仅管理端 |
| `care_links` | 服药用户与监督朋友的关系 | 仅管理端 |
| `subscription_grants` | 一次性订阅授权近似账本 | 仅管理端 |
| `reminder_jobs` | at-most-once 微信提醒任务 | 仅管理端 |
| `idempotency_requests` | 写请求幂等状态 | 仅管理端 |

所有读写由 `app-api` 或 `reminder-dispatcher` 完成。不要从小程序页面调用 `wx.cloud.database()`。

服药照片本体保存在云存储；`photo_uploads` 只保存一小时有效的上传路径票据和绑定状态，不保存图片二进制。

集合建立后必须在开发环境执行权限测试：普通客户端对任一集合的 get/add/update/remove 均应失败，而 `app-api` 使用管理端数据库客户端可以访问。
