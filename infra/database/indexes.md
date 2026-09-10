# V1 数据库索引

在 CloudBase 控制台建立：

| 集合 | 索引名 | 组合索引 | 用途 |
|---|---|---|---|
| `regimen_versions` | `owner_effective_from` | `ownerUserId ASC, effectiveFrom ASC` | 查找用户全部方案版本 |
| `dose_records` | `owner_local_date` | `ownerUserId ASC, localDate ASC` | 查询月历区间 |
| `photo_uploads` | `status_expires_at` | `status ASC, expiresAt ASC` | 清理过期或未绑定的上传票据 |
| `care_invites` | `owner_status_expires_at` | `ownerUserId ASC, status ASC, expiresAt ASC` | 查询有效邀请与过期清理 |
| `care_links` | `owner_status` | `ownerUserId ASC, status ASC` | Owner 查询监督者与人数限制 |
| `care_links` | `caregiver_status` | `caregiverUserId ASC, status ASC` | 朋友查询正在关注的人 |
| `subscription_grants` | `recipient_template_status_accepted` | `recipientUserId ASC, templateKey ASC, status ASC, acceptedAt ASC` | 查找本人或朋友的可用授权 |
| `reminder_jobs` | `status_scheduled_at` | `status ASC, scheduledAt ASC` | dispatcher 到期扫描 |
| `reminder_jobs` | `recipient_status_scheduled_at` | `recipientUserId ASC, status ASC, scheduledAt ASC` | 本人和朋友的下一次提醒覆盖 |
| `idempotency_requests` | `user_expires_at` | `userId ASC, expiresAt ASC` | 维护与过期清理 |

`_id` 自带唯一性，以下唯一语义通过确定性 `_id` 实现：

- occurrence：`hash(regimenVersionId + localDate)`；
- reminder job：`hash(recipientUserId + templateId + occurrenceId + stage)`；
- grant：`hash(userId + requestId)`；
- idempotency：`hash(userId + action + requestId)`。
- care invite：数据库 `_id = sha256(rawToken)`，原始 token 只存在于分享路径；
- care link：`hash(ownerUserId + caregiverUserId + "care-link")`。
- caregiver reminder job：`hash(grantId + "care-overdue-job")`，未实际发送时可顺延到下一个计划日。
