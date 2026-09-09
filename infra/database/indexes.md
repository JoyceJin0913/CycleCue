# V1 数据库索引

在 CloudBase 控制台建立：

| 集合 | 索引名 | 组合索引 | 用途 |
|---|---|---|---|
| `regimen_versions` | `owner_effective_from` | `ownerUserId ASC, effectiveFrom ASC` | 查找用户全部方案版本 |
| `dose_records` | `owner_local_date` | `ownerUserId ASC, localDate ASC` | 查询月历区间 |
| `subscription_grants` | `recipient_template_status_accepted` | `recipientUserId ASC, templateKey ASC, status ASC, acceptedAt ASC` | 查找可用授权 |
| `reminder_jobs` | `status_scheduled_at` | `status ASC, scheduledAt ASC` | dispatcher 到期扫描 |
| `reminder_jobs` | `recipient_status_scheduled_at` | `recipientUserId ASC, status ASC, scheduledAt ASC` | 今日提醒覆盖 |
| `idempotency_requests` | `user_expires_at` | `userId ASC, expiresAt ASC` | 维护与过期清理 |

`_id` 自带唯一性，以下唯一语义通过确定性 `_id` 实现：

- occurrence：`hash(regimenVersionId + localDate)`；
- reminder job：`hash(recipientUserId + templateId + occurrenceId + stage)`；
- grant：`hash(userId + requestId)`；
- idempotency：`hash(userId + action + requestId)`。
