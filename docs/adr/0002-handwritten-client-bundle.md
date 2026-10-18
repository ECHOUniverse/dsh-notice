# 手写 `__ModuleLoader__` 外壳，不复刻官方打包 preset

## Status

accepted

## Context

DSH 的客户端半插件必须是浏览器可直接执行的经典脚本，格式为：

```js
window.__ModuleLoader__.load({ id: '<npm 包名>', factory: (require) => { … return module.exports } })
```

这个外壳由 DSH monorepo 的共享构建 preset 生成（`dsh-client-modules` 的 README 称之为 "the shared preset stamps `client.js` after every package output is written"）。该 preset **未作为第三方可用的构建助手发布**：全量 grep 288 个包与 app.asar 均未找到客户端构建 preset、`tsdown.client`、`clientPreset` 之类的东西。

复刻它需要逆向 monorepo 的内部打包约定（输出包装、`require.async` 分块协议、source map 拼接、revision 戳记），任何一处不一致都会表现为"bundle 加载失败"或更难查的静默不注册。

## Decision

我们自己手写 `lib/client.js`，直接满足 `window.__ModuleLoader__.load` 契约，内部用 `require('react')` + `React.createElement`（不引入 JSX 编译），只依赖浏览器 baseline 表里的模块（`react`、`react/jsx-runtime`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-ui-primitives` 等）。不引入 tsdown/rollup/esbuild 作为客户端打包器。

## Consequences

- 构建链退化为"纯 `tsc` 编宿主半 + 手写客户端半"，无打包器版本风险，npm 产物所见即所跑。
- 客户端半代码不能写 JSX，需要 `createElement` 或 `h()` 辅助函数；对 ~200 行的通知逻辑与 ~150 行的设置表单，这个代价可接受。
- 一旦 DSH 改变 `__ModuleLoader__` 契约（例如要求 chunk 协议、或 baseline 表变更），我们必须手改，无法靠升级打包器解决。这是已知的、可接受的耦合。
- 不要"顺手"加打包器：只要有人把 `client.js` 交给 bundler，就必须重新解决 wrapper、externals 与 source map 三件事，等于回到本 ADR 要避免的问题。
