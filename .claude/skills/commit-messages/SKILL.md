---
name: commit-messages
description: 遵循我们团队的约定生成commit message。在创建commit或用户请求相关帮助时使用。
---
# Commit Message 格式

所有commit都遵循“Conventional Commits”规范：
- feat: 新功能
- fix: bug修复
- refactor: 既不修复bug也不增加功能的代码更改
- docs: 仅文档
- test: 添加或更新测试

格式: `type(scope): description`
示例: `feat(auth): add password reset flow`

描述保持在50个字符以内。如需更多上下文，添加一个空行后写入正文。