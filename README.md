# magpie-plugin-modelscope

A ModelScope provider plugin for [magpie](https://github.com/yetone/magpie),
built from [magpie-plugin-msmoli](https://github.com/MisonL/magpie-plugin-msmoli).
One package provides two complete providers, China and International, each with
model discovery, chat, images, daily check-in and magicube usage.

## Providers

| | China | International |
|---|---|---|
| magpie provider id | `msmoli` | `msmoli-intl` |
| Display name | ModelScope 中国版 | ModelScope 国际版 |
| Website / check-in | `https://modelscope.cn` | `https://modelscope.ai` |
| API-Inference | `https://api-inference.modelscope.cn/v1` | `https://api-inference.modelscope.ai/v1` |
| Access token | `ms-...` from modelscope.cn | `ms-...` from modelscope.ai |

Tokens are site-specific. A token from one site answers 401 on the other.

## Features

- Live model discovery from the site's `/v1/models`.
- OpenAI Chat-compatible requests with streaming passthrough.
- Vision-model detection and image input capabilities.
- Image generation and image editing through ModelScope's asynchronous
  `/tasks/<id>` API.
- Daily check-in: `daily_active` 200 + `aliyun_bindlogin` 50 credits.
- Account card with balance, today's grants, today's spend and expiry time.
- A stable ModelScope account id (the site's `Name`, not the shared nickname)
  on the sign-in, so Magpie sync recognizes the same token under different
  account slots on two computers instead of creating a duplicate.
- The original check-in retry, account-name write-back and token handling from
  magpie-plugin-msmoli.

## Install

From this folder:

```powershell
magpie plugin add "C:\Users\15282\Documents\AI\magpie插件\magpie-plugin-modelscope"
```

After this working tree is pushed, from the GitHub fork:

```powershell
magpie plugin add github:Woni111/magpie-plugin-msmoli
```

Sign in to each site separately:

```powershell
magpie plugin login msmoli
magpie plugin login msmoli-intl
```

China tokens: <https://modelscope.cn/my/myaccesstoken>

International tokens: <https://modelscope.ai/my/myaccesstoken>

## Check-in and the Aliyun 50

ModelScope has no public check-in endpoint. The plugin calls
`GET /api/v1/users/login/info` as a browser session, causing the server to count
that request as a website sign-in and grant the day's credits.

The request is:

```http
Cookie: m_session_id=ms-...
User-Agent: Chrome ...
Referer: https://modelscope.cn/
```

The hook reconciles the ledger:

1. Read today's `EARN` rows.
2. If `daily_active` already exists, answer `done` without touching login again.
3. Otherwise call `login/info`.
4. Read the ledger again and count only grants that appeared after the touch.

The daily rules are:

```js
const DAILY_RULES = ["daily_active", "aliyun_bindlogin"]
```

The Aliyun 50 is not an Alibaba Cloud API call by this plugin. It is ModelScope's
`aliyun_bindlogin` rule: when the ModelScope account is already bound to Aliyun,
the server grants 50 alongside the 200 login grant. An unbound account receives
only 200; the plugin does not perform the binding.

Daily credits expire 24 hours after they arrive and do not accumulate. The
default check-in window is 08:30–10:00 Beijing time, with a stable per-account
minute; it can be changed or disabled in `msmoli.json`.

## Model calls

Both providers register as:

```js
npm: "@ai-sdk/openai-compatible"
```

Magpie therefore talks to them through the OpenAI Chat-compatible protocol.
Codex Responses and Anthropic requests are translated to Chat by magpie. Chat,
tools, streaming and vision input are supported. The plugin does not register a
native Responses protocol, so it does not use the built-in ModelScope preset's
Responses cache accounting.

Image models appear in magpie's image-model picker. The plugin converts
`/images/generations` and multipart `/images/edits` into ModelScope's async task
API and returns OpenAI Images-shaped `{data:[{url}]}` responses.

## Sync an existing China key

If magpie's built-in `modelscope` preset already has a token, the fork's helper
can log the same token into provider `msmoli`:

```powershell
node bin/sync.mjs --status
node bin/sync.mjs --to-plugin
```

## Risk

Check-in relies on a website-login side effect, not a documented ModelScope
check-in API. ModelScope's terms may restrict third-party tools that claim
benefits, and risk control may refuse requests. Use is at the account owner's
discretion. The software is provided under the MIT licence without warranties.

## Development

```powershell
npm test
npm run check
```

The tests cover both profiles, check-in reconciliation, the usage card, live
models, chat passthrough, image generation, multipart edits and 401 sign-in
handling.
