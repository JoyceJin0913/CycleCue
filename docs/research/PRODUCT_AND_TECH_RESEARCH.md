# 避孕药记录小程序：产品判断与技术调研

> 文档日期：2026-09-09
> 用途：供后续开发 session、协作者和 AI 助手直接阅读，作为第一版产品与技术选型的上下文。
> 当前阶段：个人及少量朋友使用的 MVP，不以大规模商业化和完整医疗合规体系为目标。

## 1. 产品背景与核心痛点

目标产品是一个以微信小程序为载体的避孕药记录工具，首先解决以下问题：

1. **服药周期复杂**：典型方案为连续服用 21 天、停药 7 天，需要日历明确告诉用户哪天服药、哪天停药。
2. **固定时间容易遗忘**：到了服药时间，用户可能在忙、手边没药，单次提醒很容易被忽略，需要延迟、重复和升级提醒。
3. **记忆容易混淆**：每天动作高度重复，用户常常无法确认当天是否已经服药，因此需要明确记录，并可附带照片作为证据。
4. **希望获得外界监督**：用户可邀请少量可信任的人查看是否完成服药；逾期未记录时，可以通知监督者，让其通过微信主动提醒。

第一版的目标不是替代医生，也不是判断避孕是否有效。它负责的是：

- 展示计划；
- 提醒用户；
- 记录事实；
- 在获得授权后通知监督者；
- 降低“我今天到底吃没吃”的不确定性。

涉及漏服后的医学处置时，应提示用户以药品说明书和医生建议为准，不由程序自行给出通用结论。

## 2. 已确认的产品边界

### 2.1 不需要单独的微信登录页面

用户进入小程序后，可通过云函数调用 `cloud.getWXContext()` 获取当前小程序下的 `OPENID`，用它完成静默身份识别。

这里的“不需要微信登录”准确含义是：

- 不需要让用户点击“微信登录”；
- 不需要获取昵称、头像、手机号才能使用；
- 仍然需要在服务端通过 `OPENID` 区分用户和隔离数据；
- 不能信任客户端自行上传的用户 ID；关键写操作必须从云函数上下文获取身份。

如果以后需要跨小程序、公众号或多个微信应用统一身份，才需要进一步考虑 `UNIONID` 等机制。第一版不需要。

### 2.2 隐私合规先保持轻量，但不能完全省略

当前只给自己和少量朋友使用，可以暂缓复杂的隐私合规体系、数据分级和企业级审计，但仍保留以下最低安全线：

- 所有记录按 `OPENID` 做服务端权限隔离；
- 照片存放在云存储中，不创建公开永久链接；
- 监督者默认只能看到“已服/未记录/明确未服”等状态，不自动看到照片；
- 邀请关系必须可撤销；
- 用户可以删除照片和服药记录；
- 邀请码不能采用长期有效、容易枚举的短数字码；
- 日志中避免打印照片 URL、药物详情和完整用户数据。

## 3. 第一版产品模型

### 3.1 服药方案

每个方案至少包含：

- 方案开始日期；
- 连续服药天数，如 21；
- 停药天数，如 7；
- 每日计划服药时间；
- 提醒宽限期；
- 方案时区；
- 启用状态。

虽然第一版界面可以只提供“21+7”，底层不应写死为 21 和 7，应该保留 `activeDays` 和 `breakDays`，以后可支持 24+4、28 天连续药板等方案。

### 3.2 当日状态

建议区分计划状态与实际记录，不要只存一个 `isTaken`：

| 类型 | 建议状态 | 含义 |
|---|---|---|
| 计划 | `active` | 当天计划服药 |
| 计划 | `break` | 当天计划停药 |
| 记录 | `taken` | 已确认服用 |
| 记录 | `late` | 迟于计划时间服用 |
| 记录 | `not_taken` | 用户明确记录没有服用 |
| 派生 | `unrecorded_overdue` | 已过宽限期但仍没有记录 |
| 派生 | `future` | 尚未到计划时间 |

`unrecorded_overdue` 和 `not_taken` 必须区分：前者表示系统不知道发生了什么，后者表示用户明确确认没有服用。

### 3.3 照片证据

照片属于一次服药记录的附件，而不是服药完成本身。推荐流程：

1. 客户端选择或拍摄照片；
2. 上传到随机、不包含用户隐私的云存储路径；
3. 调用云函数提交服药记录和文件 ID；
4. 云函数验证当前用户、方案和当天服药事件；
5. 使用服务端时间落库；
6. 重复提交时根据唯一事件键幂等处理。

第一版可以允许“无照片确认服药”，也可以在设置中允许用户要求自己必须拍照，但不建议让监督者默认查看照片。

### 3.4 监督关系

推荐的数据关系不是共享账号，而是：

- 服药用户拥有自己的方案和记录；
- 监督者通过邀请加入；
- 关系状态为 `pending / active / revoked`；
- 每个监督者拥有明确的可见范围和通知开关；
- 用户与监督者双方都可以退出关系。

邀请 token 建议使用至少 128 bit 的安全随机值，并支持过期、一次性领取和服务端原子确认。不要仅依赖 6 位数字邀请码。

## 4. 周期计算建议

推荐采用纯日期模型计算周期，不要把未来几个月的每一天预先全部写进数据库。

```ts
const cycleLength = activeDays + breakDays
const offset = daysBetweenLocalDates(startDate, targetDate)
const dayIndex = modulo(offset, cycleLength)
const shouldTake = offset >= 0 && dayIndex < activeDays
```

关键要求：

- `startDate` 和 `targetDate` 使用 `YYYY-MM-DD` 的本地日历日期语义；
- 不要直接用两个 JavaScript `Date` 的毫秒差除以 86400000；
- `modulo` 要正确处理负数；
- 方案开始前的日期不应显示为当前方案的服药日；
- 修改方案时保留历史方案或变更生效日期，不要重写过去记录。

21+7 方案至少测试以下边界：

- 第 0、20 天：服药；
- 第 21、27 天：停药；
- 第 28 天：新周期第一天；
- 跨月、跨年、闰年；
- 修改手机时区；
- 在午夜前后记录；
- 方案暂停和重新开始。

## 5. 提醒与微信订阅消息判断

### 5.1 订阅消息的现实限制

微信小程序订阅消息不能被当成无限、自动续期的每日推送通道：

- 必须由用户主动点击操作后调用 `wx.requestSubscribeMessage`；
- 返回结果需要逐个检查模板 ID 是否为 `accept`，不能只判断接口整体调用成功；
- 一次性订阅通常只允许对应模板发送一次；
- 长期订阅消息是否可用，取决于小程序主体、服务类目和微信后台开放的模板能力，不能在设计阶段默认拥有；
- 用户拒绝、授权耗尽或微信侧发送失败后，服务端不能无限重试。

因此，第一版应把订阅消息定位成辅助通道，而不是唯一的强提醒。

在真实小程序账号和选定服务类目确定后，需要进入微信公众平台重新验证：

1. 可以选择哪些订阅消息模板；
2. 模板允许哪些字段；
3. 当前账号是否具备长期订阅能力；
4. 发送频率和审核限制；
5. 用户每次授权实际可以发送多少次。

### 5.2 推荐提醒链路

推荐第一版采用多层提醒：

1. 日历明确展示当天是否服药；
2. 用户在应用内看到醒目的待完成状态；
3. 在符合微信规则并持有有效授权时，发送订阅消息；
4. 经过宽限期仍未记录时，再次检查状态；
5. 如果仍未记录，并且监督者已授权接收消息，则通知监督者；
6. 监督者通过普通微信聊天、电话等方式人工提醒。

小程序无法保证像原生闹钟一样持续响铃。可在后续评估“添加到系统日历”的能力，将系统日历作为用户本人更稳定的提醒补充，但需要根据微信 API、手机系统授权和真机表现进行验证。

### 5.3 服务端提醒任务状态机

提醒任务建议至少包含：

```text
pending -> claimed -> sent
                   -> rejected
                   -> grant_consumed
                   -> retryable_failure
                   -> terminal_failure
```

每条发送事件使用唯一键避免重复，例如：

```text
recipientOpenId + templateId + occurrenceId + reminderStage
```

定时任务执行时，应先以条件更新或事务将任务从 `pending` 抢占为 `claimed`，然后发送。发送前再次检查服药记录，避免用户刚刚服药但系统仍通知监督者。

## 6. GitHub 同类项目调研

以下项目不是为了直接选出一个 fork，而是用于提取可验证的领域模型、交互方式和工程实践。仓库活跃度、星标数和实现随时间变化，使用前应重新检查。

### 6.1 MedTimer

- 仓库：[Futsch1/medTimer](https://github.com/Futsch1/medTimer)
- 平台：Android，Kotlin/Java/Jetpack Compose
- 许可证：MIT
- 适合参考：周期调度、停药期、重复提醒、稍后提醒、历史记录、库存和测试。

源码模型中直接包含连续服药天数、暂停天数、周期开始日和时区等概念。调度逻辑通过周期取模判断某一天是否生效，并有大量关于 active period、时区、间隔和窗口提醒的测试。

**判断：这是最值得深入参考的周期和提醒领域实现。** 不应移植 Android 通知代码，但可以用 clean-room 方式在 TypeScript 中实现相同领域概念；若直接复用 MIT 代码，需要保留许可证和版权声明。

### 6.2 Menstrudel

- 仓库：[J-shw/Menstrudel](https://github.com/J-shw/Menstrudel)
- 平台：Flutter，iOS/Android
- 许可证：GPL-3.0
- 适合参考：21/7 和 28 天药板、服药日历、一键记录、迟服/跳过/安慰剂状态。

它的模型区分药板方案与服药记录，并使用 `taken`、`skipped`、`late` 等状态；日历层还区分 `missed`、`today`、`future` 和 `placebo`。

**判断：这是最贴近避孕药产品语义的参考。** 但其 GPL-3.0 许可证不适合直接复制到计划保持非 GPL 的小程序中，应只用于理解行为和交互，再独立实现。

### 6.3 MedTracker

- 仓库：[damacus/med-tracker](https://github.com/damacus/med-tracker)
- 平台：Ruby on Rails
- 许可证：MIT
- 适合参考：家庭/照护者、漏服通知、权限、通知去重、修正留痕和并发处理。

源码中的漏服任务会先等待宽限期，发送前复查当前剂量是否仍然未记录，并使用稳定事件键去重。它还区分个人和被照护者的接收人权限，并对服药结果修正保留审计信息。

**判断：这是监督者功能最有价值的领域参考。** Rails 技术栈和产品规模都不适合作为当前小程序底座，但其事件语义值得采用。

### 6.4 Mooneva Cycle

- 仓库：[aradar46/Mooneva-Cycle-Private-Period-Tracker](https://github.com/aradar46/Mooneva-Cycle-Private-Period-Tracker)
- 平台：React、TypeScript、Vite、Capacitor
- 许可证：GPL-3.0-or-later
- 适合参考：多种避孕方式、服药日志、隐私模式和移动端体验。

**判断：适合作为视觉和隐私体验参考，但它是更广泛的周期追踪器，避孕药并不是唯一核心；不建议用作小程序代码基础。**

### 6.5 娜娜小菜单

- 仓库：[forgetfreshness/menu](https://github.com/forgetfreshness/menu)
- 平台：微信原生小程序 + CloudBase
- 适合参考：静默 OpenID、双人绑定、拍照打卡和云存储上传。

源码使用 `cloud.getWXContext().OPENID` 做身份识别，图片先上传云存储，再由云函数检查关系和状态后记录。这与本项目的技术路径接近。

需要注意：其短邀请码领取流程缺少足够强的防枚举和并发保障；仓库 README 虽提到 MIT，但根目录没有完整清晰的许可证文件。**判断：只参考实现路径，不直接复制源码；关系绑定应改为高熵 token 和原子领取。**

### 6.6 WXAPP-SendMess

- 仓库：[TCloudBase/WXAPP-SendMess](https://github.com/TCloudBase/WXAPP-SendMess)
- 平台：微信小程序 + CloudBase
- 适合参考：订阅请求、云函数和定时触发器的最小接线方式。

该项目代码量小、时间较早，前端主要判断接口整体 `errMsg`，没有完整处理每个模板的 `accept/reject/ban`，服务端也没有完善的原子抢占、幂等、授权消耗和错误分类机制。

**判断：只适合快速验证 API 是否跑通，不适合作为生产提醒系统。** 仓库没有清晰许可证时，不直接复制代码。

### 6.7 mini-subscribe-message

- 仓库：[XieXiePro/mini-subscribe-message](https://github.com/XieXiePro/mini-subscribe-message)
- 平台：微信小程序
- 适合参考：调用 `wx.requestSubscribeMessage`，逐模板检查授权结果，通过 HTTPS 或云函数发送。

**判断：比只检查整体成功的示例更规范，但项目较老，只能作为协议示例。** 实际字段、接口和账号权限必须以当前微信官方后台为准。

### 6.8 喝水提醒小程序

- 仓库：[goudan1030/dirnkwater](https://github.com/goudan1030/dirnkwater)
- 平台：微信原生小程序 + Node.js/Express/MySQL/JWT/node-cron
- 许可证：MIT
- 适合参考：提醒配置页面、每日/工作日/单次提醒的 UI 表达。

源码调研发现，其订阅次数持久化流程并不完整，循环定时任务也没有可靠处理一次性订阅授权的消耗；同时又额外维护 JWT、独立数据库和单进程 cron，这些都不符合当前 CloudBase MVP 的需求。

**判断：可参考页面，不采用其后端架构，也不能据此假设微信订阅消息可以无限循环发送。**

### 6.9 其他低优先级项目

- [AdamGuidarini/MediTrak](https://github.com/AdamGuidarini/MediTrak)：较成熟的 Android 通用药物追踪项目，可参考多患者、间隔提醒和备注，但与微信小程序差距较大，且为 GPL-2.0。
- [Qitalach/PillApp](https://github.com/Qitalach/PillApp)：早期 Android 药物提醒项目，有 Taken/Snooze/Won't take 和历史记录，但 Android API 与工程结构已经过时，不建议采用。

## 7. 最终技术选型

推荐第一版采用：

```text
微信原生小程序 + TypeScript
        │
        ├── CloudBase 云函数：身份、权限、记录、关系和提醒任务
        ├── CloudBase 数据库：方案、服药事实、监督关系、任务事件
        ├── CloudBase 云存储：服药照片
        ├── 微信订阅消息：有授权时的辅助提醒
        └── 系统日历/人工微信提醒：补充提醒通道
```

选择原生小程序而不是 Flutter、Capacitor 或 Taro 的原因：

- 第一版页面和业务规模有限，跨端收益不高；
- 需要直接处理 CloudBase、订阅消息、相机和小程序生命周期；
- 少一层框架有利于排查微信平台能力和真机差异；
- 后续如果产品验证成功，再评估跨端客户端并不迟。

第一版也不建议使用独立 Node/MySQL 后端：CloudBase 已能覆盖少量用户所需的身份、数据、文件、定时触发和云函数能力，可以显著减少部署和运维工作。

## 8. 推荐数据集合

### `users`

- `_openid`
- `timezone`
- `createdAt`
- `settings`

### `regimens`

- `_id`
- `ownerOpenId`
- `startDate`
- `activeDays`
- `breakDays`
- `scheduledLocalTime`
- `timezone`
- `graceMinutes`
- `status`
- `effectiveFrom`

### `dose_records`

- `_id`
- `occurrenceId`
- `regimenId`
- `ownerOpenId`
- `scheduledDate`
- `status`
- `recordedAt`
- `takenAt`
- `source`
- `revision`

`occurrenceId` 应有唯一约束或通过事务保证唯一，例如：

```text
regimenId:YYYY-MM-DD:doseIndex
```

### `evidence`

- `_id`
- `doseRecordId`
- `ownerOpenId`
- `cloudFileId`
- `createdAt`

### `care_links`

- `_id`
- `ownerOpenId`
- `caregiverOpenId`
- `status`
- `permissions`
- `createdAt`
- `revokedAt`

### `care_invites`

- `_id`
- `tokenHash`
- `ownerOpenId`
- `expiresAt`
- `claimedAt`
- `claimedBy`
- `status`

### `subscription_grants`

- `_id`
- `openId`
- `templateId`
- `acceptedAt`
- `availableCount`
- `status`

这里的 `availableCount` 只是应用侧记账，不能代替微信平台的真实授权状态；最终以发送接口结果为准。

### `reminder_jobs`

- `_id`
- `occurrenceId`
- `recipientOpenId`
- `stage`
- `scheduledAt`
- `status`
- `claimedAt`
- `attemptCount`

### `notification_events`

- `_id`
- `eventKey`
- `jobId`
- `recipientOpenId`
- `templateId`
- `result`
- `platformErrorCode`
- `createdAt`

## 9. 建议实施顺序

### MVP 1：只解决个人记录

- 创建 21+7 方案；
- 首页显示今天是服药日还是停药日；
- 月历展示整个周期；
- 确认服药、明确未服和撤销误操作；
- 可选拍照；
- 历史记录查询。

### MVP 2：提醒闭环

- 到期和宽限期状态；
- 订阅授权入口；
- 定时任务、发送前复查、幂等和错误分类；
- 评估并接入系统日历。

### MVP 3：朋友监督

- 安全邀请和绑定；
- 监督者只读状态页；
- 逾期后通知监督者；
- 退出、撤销和权限控制。

这样排序可以先验证最核心的“今天是否要吃、是否已经吃”，避免一开始被微信消息权限和多人关系拖慢。

## 10. 测试重点

必须优先覆盖：

- 21+7 周期所有边界；
- 跨月、跨年、闰年和时区变化；
- 网络重试导致的重复记录；
- 连续点击确认按钮；
- 用户刚服药，提醒任务同时执行；
- 两人同时领取同一邀请；
- 邀请过期与撤销；
- 照片已上传但记录提交失败；
- 订阅被拒绝、授权耗尽和模板失效；
- 定时任务重复执行；
- 历史方案变更后，过去记录不被改变。

## 11. 许可证与复用原则

- MIT 项目可以在遵守许可证、保留版权和许可证声明的前提下复用代码，但仍建议只抽取确实需要的部分。
- GPL 项目可以用于学习产品行为和领域设计；如果不准备将衍生项目按 GPL 发布，不直接复制其源码。
- 没有清晰 `LICENSE` 文件的项目，按谨慎原则不复制源码，只参考公开展示的思路。
- 将外部代码带入仓库时，应在提交中记录来源、版本/commit 和许可证。

## 12. 当前总判断

没有一个现有 GitHub 项目同时满足：微信小程序、21+7 避孕药周期、照片记录、可靠提醒和多人监督。因此不建议 fork 单一项目。

建议采用组合式 clean-room 实现：

- 用 **MedTimer** 的思路设计周期算法和测试；
- 用 **Menstrudel** 的思路设计避孕药状态和日历体验；
- 用 **MedTracker** 的思路设计宽限期、监督权限、事件去重和修正留痕；
- 用 **CloudBase 小程序示例**理解 OpenID、云函数、云存储和订阅消息的接线方式，但重写生产逻辑；
- 第一版坚持微信原生小程序 + TypeScript + CloudBase，先实现个人记录，再实现提醒，最后加入朋友监督。

后续 session 开始开发前，应先阅读本文件，并优先确认真实小程序账号可使用的订阅消息模板和服务类目；除此之外，核心周期与记录功能可以独立推进。
