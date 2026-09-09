# CycleCue

CycleCue 是一个微信小程序形式的 21+7 避孕药计划与记录工具。

当前仓库处于 V1 架构阶段，范围严格限定为：

- 首次设置服药方案；
- 今日是否需要服药及“已服/未服”记录；
- 21+7 日历；
- 微信一次性订阅提醒。

V1 不包含照片、系统日历、监督者、多药物或医疗建议。

## 文档

- [V1 实施规格](./docs/v1/SPEC.md)
- [未来完整产品规格](./docs/future/FULL_SPEC.md)
- [产品与技术研究](./docs/research/PRODUCT_AND_TECH_RESEARCH.md)

## 目录

```text
miniprogram/                 微信原生小程序
packages/domain/             无平台依赖的日期与周期规则
cloudfunctions/app-api/      小程序唯一业务入口
cloudfunctions/reminder-dispatcher/  微信提醒定时发送
infra/                       数据库、索引和函数权限说明
docs/                        版本化规格与研究
```

## 本地检查

```bash
npm install
npm run check
```

## 微信开发者工具

1. 用微信开发者工具导入仓库根目录。
2. 在本机 `project.private.config.json` 中配置真实 AppID。
3. 开发时在 `miniprogram/config/runtime.ts` 填写开发环境 ID 和订阅模板 ID，提交前恢复为空；示例见相邻的 `runtime.example.ts`。
4. 在 CloudBase 控制台配置云函数环境变量，参见 `infra/functions/environment.example.md`。
5. 创建 CloudBase 集合、索引和函数权限，参见 `infra/`。
6. 执行 `npm run build:functions` 后部署两个云函数。

真实 AppID、CloudBase 环境 ID、模板 ID 和任何密钥不得提交到 Git。

## 当前状态

已建立页面、领域层、云函数边界和 at-most-once 提醒状态机骨架。接入真实小程序账号前，需要在微信公众平台确认可用的一次性订阅模板及字段；模板 keyword 未确认前不得部署正式提醒。

云函数持久化代码目前属于首版架构实现，正式灰度前还需要在真实 CloudBase 开发环境运行事务、权限、并发与消息错误集成测试，完成标准见 [V1 Spec](./docs/v1/SPEC.md)。
