# Verification：证据而不是仪式

## 共通门禁

每张卡至少回答：

1. 是否满足任务卡验收标准？
2. 是否超范围或修改了禁止区域？
3. 是否引入接口/数据/安全回归？
4. 证据能否被下一位 Agent 或人复现？

## Evidence Profiles

### docs

- 链接/引用/结构检查；
- 术语与事实一致性；
- 必要时运行文档构建或 lint；
- 不要求无意义的代码测试/截图。

### backend / library

- 相关单测/集成测试；
- 类型/静态检查；
- 关键错误路径；
- 公共 API/兼容性；
- build 仅在项目有 build 门禁时执行。

### frontend / UI

- 相关测试 + build；
- 真实浏览器交互；
- 截图用于视觉/布局任务；
- 关键响应式或可访问性检查按验收标准选择。

### infra / automation

- dry-run / validate / plan；
- 配置语法与幂等性；
- 不能把真实 deploy 当默认验证手段；
- 涉及生产副作用必须升级授权。

### security / risk

- 独立 evaluator；
- 威胁模型/滥用路径；
- 负向测试；
- 明确 blast radius 与不可逆性。

## Evaluator 原则

独立 evaluator 最适合：

- 大改动；
- 主观质量；
- 安全/权限；
- 执行者已经 repair 一次；
- 结果容易“自我感觉良好”但难客观判断。

Evaluator 输入优先是：任务卡 + diff + 可复现证据，而不是整段执行聊天历史。

## Repair

同一失败原因允许一次有针对性的 repair。第二次仍失败时停止并标记 `BLOCKED`；不要用“再试一次”制造无限循环。
