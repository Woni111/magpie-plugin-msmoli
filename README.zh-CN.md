# magpie-plugin-modelscope

基于 [magpie-plugin-msmoli](https://github.com/MisonL/magpie-plugin-msmoli)
整合的 ModelScope（魔搭）provider 插件。一个包提供两个完整 provider：
中国版和国际版，各自负责模型发现、聊天、图像、每日签到和魔粒用量。

## 两个 Provider

| | 中国版 | 国际版 |
|---|---|---|
| magpie provider id | `msmoli` | `msmoli-intl` |
| 显示名称 | ModelScope 中国版 | ModelScope 国际版 |
| 网页 / 签到 | `https://modelscope.cn` | `https://modelscope.ai` |
| API-Inference | `https://api-inference.modelscope.cn/v1` | `https://api-inference.modelscope.ai/v1` |
| 访问令牌 | modelscope.cn 的 `ms-...` | modelscope.ai 的 `ms-...` |

两个站点的令牌不通用。中国版令牌请求国际版会返回 401，反过来也一样。

## 功能

- 从各自站点的 `/v1/models` 动态读取模型列表。
- OpenAI Chat 兼容调用，流式响应原样透传。
- 视觉模型识别和图像输入能力。
- 图像生成与图像编辑，适配 ModelScope 的异步 `/tasks/<id>` 协议。
- 每日签到：`daily_active` 200 魔粒 + `aliyun_bindlogin` 50 魔粒。
- 账号卡片显示魔粒余额、今日领取、今日消耗和过期时间。
- 登录记录里保存 ModelScope 的稳定账号身份（邮箱或账号名），两台电脑同步时
  同一令牌即使落在不同账号 slot 也会被识别为同一账号，不再生成重复项。
- 签到结果、失败重试、账号昵称和令牌状态沿用 magpie-plugin-msmoli 的实现。

## 安装

从本地目录安装：

```powershell
magpie plugin add "C:\Users\15282\Documents\AI\magpie插件\magpie-plugin-modelscope"
```

当前工作区推送后，也可以从 GitHub fork 安装：

```powershell
magpie plugin add github:Woni111/magpie-plugin-msmoli
```

分别登录两个站点：

```powershell
magpie plugin login msmoli
magpie plugin login msmoli-intl
```

中国版令牌：<https://modelscope.cn/my/myaccesstoken>

国际版令牌：<https://modelscope.ai/my/myaccesstoken>

## 每日签到与阿里云 50 魔粒

ModelScope 没有公开的签到 API。插件调用网页的
`GET /api/v1/users/login/info`，由服务端把这次访问当成一次登录，并在当天第一次
访问时发放魔粒。请求使用：

```http
Cookie: m_session_id=ms-...
User-Agent: Chrome ...
Referer: https://modelscope.cn/
```

签到不是盲目调用一次，而是对账：

1. 读取今天的 `EARN` 账单。
2. 如果已有 `daily_active`，返回 `done`，不重复触达登录。
3. 否则触达 `login/info`。
4. 再读账单，只把触发后新增的 `daily_active` / `aliyun_bindlogin` 算作本次领取。

规则定义：

```js
const DAILY_RULES = ["daily_active", "aliyun_bindlogin"]
```

阿里云的 50 魔粒不是插件直接调用阿里云接口获得的。它是 ModelScope 的
`aliyun_bindlogin` 规则：账号已经绑定阿里云时，登录触达后服务端会自动多发 50。
没有绑定阿里云时只有 200，插件不会代替用户完成绑定。

每日魔粒自到账起 24 小时过期，不累积。签到窗口默认北京时间
08:30–10:00，按账号在窗口内分配固定分钟；可以在 `msmoli.json` 中修改或关闭。

## 模型调用

两个 provider 都注册为：

```js
npm: "@ai-sdk/openai-compatible"
```

也就是说 magpie 通过 OpenAI Chat 兼容协议调用它们。Codex 的 Responses 请求和
Anthropic 请求会由 magpie 转换成 Chat 请求；聊天、工具调用、流式和视觉输入可用。
插件不注册原生 Responses 协议，因此不会复用内置 ModelScope 预设的 Responses
缓存统计。

图像模型会出现在 magpie 的图像模型选择器中。插件把
`/images/generations` 和 multipart `/images/edits` 转成 ModelScope 的异步任务，
再把结果转换成 OpenAI Images 的 `{data:[{url}]}`。

## 同步中国版已有 Key

如果 magpie 内置的 `modelscope` 预设已经有访问令牌，可以用 fork 自带的工具同步给
插件 provider `msmoli`：

```powershell
node bin/sync.mjs --status
node bin/sync.mjs --to-plugin
```

## 风险

签到依赖网页登录副作用，不是 ModelScope 官方提供的签到接口。平台用户协议可能
限制第三方工具刷取权益，并可能触发风控。是否使用由账号所有者自行决定；插件按
MIT 许可证提供，不承诺账号、权益或服务可用性。

## 开发

```powershell
npm test
npm run check
```

测试覆盖中国版/国际版两个 profile、签到对账、用量卡片、模型列表、聊天透传、
图像生成、multipart 图像编辑和 401 令牌失效。
