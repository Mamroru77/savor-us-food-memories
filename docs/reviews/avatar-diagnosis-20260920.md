# 头像问题诊断、修复与验收记录

日期：2026-09-20。分支：`integrated-with-cloud`。

状态：已按“先诊断、再修改”实施本地头像修复；专项自动检查通过。完整套件有失败，真机验收未执行，不能宣称头像问题已在 iOS/Android 上完全解决。

## 1. 工作区与证据边界

开始时工作区已经有 22 个 tracked 文件的未提交修改，以及头像测试等 untracked 文件。本次保留了这些改动。需求引用的旧实现与当前文件不同：

- Sheet 空 catch 已被替换成报错分支，本地第二次 resumeNative 已被删除。
- photos 已加入 statSync 和按文件名取后缀，但未检查真实编码/解码。
- Sheet 已有 nativeavatar 父子恢复逻辑，同时引入了选择后立即写 Store。
- Store 已有写失败后清空 outbox 再保存的重试。
- data.initialMemories 已清空；多个旧测试仍从 initialMemories[0] 构造数据。

修改前已在对话中给出完整诊断报告；下文保留当时的发现，并补上实施结果。

没有连接用户微信、读取用户头像、部署云函数或操作真实云端数据。没有修改任何 WXML/WXSS、身份协议或云端协议。

## 2. 完整本地调用链

| 步骤 | 实际文件 / 函数 / 数据 | 检查结论 |
| --- | --- | --- |
| 编辑入口 | pages/me/index.wxml 编辑按钮 → me.onEditProfile → openSheet('profile') | 当前入口是编辑按钮，头像图本身没有 onEditProfile 绑定 |
| 选择入口 | components/sheet/index.wxml edit-avatar → onAvatarChange | 当前 request + 原用户 lease；选择前验证身份 |
| 原生选择 | utils/photos.choosePhotos → wx.chooseMedia；Android 多选优先 chooseImage | 取消与选择失败分开；替代 chooser 不处理持久化错误 |
| 返回授权 | identity.resumeNative(token) | 等待正在进行的 verify；只允许同 userId、同 namespace |
| 文件处理 | photos.persistPhoto | 原图/大图优先原始复制；普通图先压缩；压缩失败可用原图 |
| 格式判断 | wx.getImageInfo(source).type | 以实际格式决定扩展名，不相信临时文件名，不假定压缩输出必为 JPEG |
| 建目录 | USER_DATA_PATH + /savor-photos/ + runtimeConfig.fileScope + userId | mkdir 后 access；失败抛出阶段/错误码；无匿名写入后门 |
| 保存文件 | copyFile(source,target)；失败时 readFile → writeFile | 二进制复制，不返回 tempFilePath；异步边界固定原 lease |
| 文件验证 | statSync(target).size > 0 → getImageInfo(target) | 返回前确认文件及图片可读；现存 userPhoto 也验证，不能仅凭前缀通过 |
| 编辑预览 | profileAvatar setData → Sheet image src | 只更新草稿。绑定 image error，失败提示并阻止 Save；重新选择清理错误 |
| 保存 | onProfileSave → store.updateProfile({name,bio,avatar}) | 图片处理中不保存；正常名字校验仍保留；失败保持表单、不报成功 |
| 分区持久化 | Store commit → identity.setStorageSync → identityPartitions.save → chunkStorage.write | manifest 是提交点。提交成功后才更新内存 state 和 listeners |
| Me 刷新 | store.subscribe → me.syncState → profile.avatar → image src | 头像改变清 imageErrors；onShow 也清错误缓存 |
| 关闭重开 | openSheet → refreshProfile → store.get | 加载已经保存的 avatar；未 Save 的选择不替换已存头像 |
| Tab 返回 | me.onShow → store.get → syncState | 同内存状态重新呈现；错误图有再次加载机会 |
| 冷启动 | App.onShow → identity.verify → partition accept → Store identity 订阅 → loadDiary → Me | 持久路径重新进入 profile；当前身份设计要求先验证账户。冷启动离线锁定不是头像文件被删除 |
| 最终显示 | 原生 image 渲染、杀进程重进 | 自动测试不能证明，必须真机验收 |

补充检索了 App/i18n、identityPartitions/chunkStorage、uiFeedback、Add.pickPhotos、space.addMedia、sharedMedia.persistPhoto 调用、legacyRecovery.copyProfile、memory-row、mapMarkers、memoryPreview、Us 头像绑定、Cloud tools 模板及相关验证脚本/历史说明。样式和历史截图中的 avatar 命中不参与文件或账户持久化。

## 3. 修改前根因候选与验证

### 高概率 / 已复现代码缺陷

1. **把非零文件当成可用图片。** copyIn 只 stat，没有解码；extensionFor 看的是路径后缀。给实际生产函数传入内容为三个字节 `png` 的文件，它也返回“成功”的持久路径。证明文件校验缺口，不证明用户的某张照片一定损坏。
2. **Save 与 chooser 竞争。** refreshProfile 每次设 uploading=false；模板的 ghosted 样式不阻止 bindtap，Save 没有处理锁。生产 Sheet 函数复现：chooser 未完成 → refresh → Save 关闭 Sheet，随后合法结果无处回填。
3. **恢复标志不属于当前请求。** 旧 chooser finally 无条件发送 nativeavatar:end，能清新请求的父级恢复意图；observer 对所有 native 请求都不 reset，换到 Together 再回 Profile 仍能收到旧头像。两个分支均在修改前复现。
4. **持久化失败会删除待同步队列。** updateProfile 首次 commit 抛错后，用 outbox:[] 二次写入。注入一次失败后，函数返回而队列长度变成 0。不是合理的空间回收策略。

### 中概率 / 已确认机制但需真机归因

- **异常丢失或错分。** 原需求中的 cancelled 空 catch 已不在当前 Sheet，但 photos 仍把持久化错误包成 All photos failed，并吞掉一些 assertLease 异常。旧日志会包含完整路径。现在保留原失败阶段、有限错误码，取消只识别原生 chooser 取消。
- **真实格式不等于后缀。** 压缩输出无法从函数签名证明一定是 JPEG。微信官方 API 类型说明 iOS 压缩仅支持 JPG；getImageInfo 有图片 type。故保存的是原图 fallback 时，PNG 必须仍被当作 PNG，而不是改名成 JPG。
- **正常原生返回会触发验证。** App.onShow 每次调用 verify；它增加 generation，i18n.syncPage 因此关闭 Sheet。已有同用户恢复代码必要，不能删除。修复将其限于当前 request 和验证产生的短暂隐藏；明示关闭、换表单、卸载、换用户均失效。若文件回调先于 Sheet 属性恢复，等待一次恢复事件，不轮询、不增加定时器。
- **已有文件被清理、损坏或无法原生渲染。** 需要设备日志、stat 和 getImageInfo；本地测试不能替代设备。不会自动擦掉 Store 里的引用来伪装正常。

### 已基本排除

- **双层 resumeNative 自身导致 generation 变化。** 此函数不启动 verify、不递增 epoch。重复调用不是该竞争的根因。实现中保留了照片服务和 UI 接收边界各一次检查，后者覆盖返回到消费之间的身份变化；新测试改为验证其不依赖删除安全检查。
- **正常 Store commit 丢掉 avatar。** commit 先写分区，再变 state/通知。loadDiary 合并 profile 时保留 avatar。问题是此前失败重试的副作用，不是正常字段遗漏。
- **新文件永久命中旧 imageErrors。** 文件名唯一，Sheet 重新选图清空错误，Me 路径变更/onShow 清空错误。同路径在当前展示期仍会 fallback，这是缓存的实际边界；不是冷启动头像被删除的证据。

API 依据：[微信官方 api-typings](https://github.com/wechat-miniprogram/api-typings/blob/master/types/wx/lib.wx.api.d.ts)。官方文档网页在本次网络环境无法直接打开，使用微信官方仓库中的 API 定义/说明核对；未把第三方平台文档当作微信依据。

## 4. 本地头像与云端 Profile 分开判断

云端链：workspace.chooseAvatar → chooseMedia → resumeNative → getImageInfo → compressImage(256px, quality 60) → base64 → 页面 _avatar → pushProfile → cloudfunctions/workspace.profilePayload/sanitize → 私有 profile → getProfile → applyProfile → USER_DATA_PATH/savor-workspace/{scope}{userId}/avatar-{digest}.{extension} → Store.applyCloudProfile。

- profilePayload 默认 avatar:null；push 才选 _avatar 或已有 remote base64。本地保存成功绝不代表云端已同步。
- 服务端 sanitize 只接受受限 PNG/JPEG，限制 64 KiB、512 边长，并计算 digest；不是任意本地 fileID 上传。
- Cloud tools 的 onHide/onShow/identity reset 会清 _avatar、remote、profileRead。返回顺序会影响选中头像是否还在；选择后再次 pull 可能是必要步骤。此处未做本地修复的扩散修改。
- applyProfile 用固定 digest 路径同步写入 base64，然后提交 Store，缺少写后 stat/getImageInfo。若同路径曾加载失败，Me 本次展示的错误缓存可能仍 fallback。此项没有设备证据，不宣称已修复。
- 服务端 PNG/JPEG 字节净化测试在 workspace 脚本到达后续 archive 失败之前通过，但并非真机 push/pull/apply 全流程验收。

## 5. 本次最小修改清单

| 文件 | 改动作用 |
| --- | --- |
| miniprogram/utils/photos.js | 固定 lease；删除吞身份异常/匿名 fallback；真实格式命名；大小及解码验证；保留压缩和二进制复制回退；只记录 stage + safe code |
| miniprogram/components/sheet/index.js | request 级恢复与结束；transient null/验证短暂隐藏不误丢结果；关闭/切表单/卸载失效；只预览；阻止处理中或预览失败时 Save；持久化错误不报成功且不被普通 refresh 擦掉 |
| miniprogram/pages/me/index.js | native start/end 携带 request；旧 end 不清新请求；关闭/切换表单取消恢复；Me 原生头像加载失败记录安全阶段码 |
| miniprogram/utils/store.js | updateProfile 恢复已有原子 commit 路径；保留 lease，写失败抛出，绝不清 outbox/draft |
| tools/verify-avatar-persistence.cjs | 替换不完整 FS mock，执行生产照片/身份/分区/Store/Me/Sheet；真实主机文件读写及字节断言，注入 native API 结果/错误 |
| tools/verify-sheet-edits.cjs | 保留既有有效竞争测试，纠正“选后立即保存”和“禁止第二次 resume”的错误预期，补齐缺失时序/异常/预览分支 |
| 本文 | 保存完整证据链、测试限制和设备验收步骤 |

没有新依赖，没有修改其他业务/视觉模块，没有重新引入临时路径持久化，没有更改 identity.js 或 runtimeConfig.js。package.json 的 verify:avatar 及 verify:all 接入在本次开始前就已存在，非本次新增。

## 6. 自动验证与为什么旧测试漏报

修改前：verify-sheet-edits 的 14 项合成检查通过，但没有覆盖刷新开启 Save、旧 finally 清新请求、换表单再回、实际文件解码。verify-avatar-persistence 首个用例报 FS.statSync is not a function，说明该 mock 已落后于生产代码。未采用 tools/lib/verify-avatar-real-fs.js 的 PASS 作为证据：它使用残缺 PNG 头且无图片解码断言，导入后替换 chooser 也不等于原已绑定 chooser 实际完成。

修改后专项：

- `node tools/verify-avatar-persistence.cjs`：23/23，通过。
- `node tools/verify-sheet-edits.cjs`：22/22，通过。
- 覆盖：处理成功；compress 失败原图成功；copy 失败 read/write 成功；copy+read/write 失败；mkdir/stat/零字节/解码失败；取消与程序错误；同用户恢复、换用户/复制中换用户；真实分区提交/模块冷加载；写失败不变 state、不丢 draft/outbox、不通知 listener；实际 Me + Sheet + i18n + Store 串联；Save 失败不 toast；null/隐藏返回；旧请求顺序、关闭、重开、切表单、卸载；image error 后换新图恢复。
- 文件系统确实使用 Node fs 并比较 JPG/PNG 字节，但 chooseMedia、compressImage、getImageInfo、CloudBase 传输和视图生命周期仍是模拟。不能称为微信文件系统或真机解码测试。

完整验证：执行了 `npm run verify:all`，入口 316/317 检查通过，因旧示例数据断言中断。随后把 package.json 所有 verify 脚本展开去重，独立执行 **50 条 Node 验证命令，37 条通过，13 条失败**。没有通过删除断言/刷新视觉哈希掩盖失败。

失败清单：

| 脚本 | 实际失败 |
| --- | --- |
| verify-miniprogram | 期望恢复 7 条样例，实际 0；当前 initialMemories=[] |
| verify-cloud | Add WXML 不匹配冻结视觉 SHA；未进入后面的照片测试 |
| verify-icons | 图标数量 81，断言 72 |
| verify-ui-quality | Add 测试 data mock 缺 createId |
| verify-identity-runtime | 用已不存在的 initialMemories[0] 构造记录，缺 tags，memoryToCloudRecord.slice 抛错 |
| verify-workspace | 后续 raw archive 测试同样用空样例构造不完整 memory，INVALID_RECORD |
| verify-audit-repairs | Home real-history 投影与旧样例数据假设不一致 |
| verify-account-sdk-contract | 缺 cloudfunctions/account/node_modules 中的 SDK 私有模块 |
| verify-map-save | VM 缺 setInterval，当前 Add.onSave 使用它 |
| verify-secondary-ui | Us 模板缺旧 space-management secondary-button 字串 |
| verify-menu-copy | Me 整文件冻结哈希不符；修改前规范化 LF 哈希为 1964c9d9…，已不同于期待的 a94224ef…；本次 Me 逻辑改动也会改变哈希 |
| verify-sharing-copy | 旧分享文案模板断言不匹配 |
| verify-map-veil-review | 当前 Map WXSS 与冻结哈希不同 |

这些失败涉及本次未修改的数据、Add、Us、图标、样式、依赖或已有整文件基线；Me 哈希在修改前也已不匹配。它们不是全套已通过的证据，也不应仅因与头像无关就被忽略。未授权扩展为全面基线/其他功能修复。

通过的 37 条命令：verify-tabbar、verify-assets、verify-tab-handoff、analyze-tab-capture --self-test、capture-projected-tab-loop --self-test、verify-identity、verify-spaces、verify-media、verify-avatar-persistence、verify-workspace-adapter、verify-feedback-policy、verify-identity-diagnosis、verify-account-server-diagnosis、verify-map-motion、verify-page-lifecycle、verify-audit-stages、verify-sheet-edits、verify-visual-language、verify-structure、verify-memory-return、verify-add-native-return、verify-map-empty、verify-map-viewport、verify-map-search-clearance、verify-map-photo-recovery、verify-reports-title、verify-pending-pagination、verify-report-locale、verify-map-overview-label、verify-map-preview-selection、verify-memory-preview-sources、verify-us-journey-clearance、verify-map-control-clearance、verify-map-scale-race、verify-map-scale-echo、verify-r4-local-refinements、verify-preferences-contrast。

## 7. 真机手工验收（全部待执行）

分别用一台 iOS 和一台 Android。记录 OS、微信版本、基础库版本、体验版构建号、在线/离线状态。用测试账号和可丢弃照片，不以真实用户空间填满或清数据制造故障。开发工具的结果单独记录，不替代真机。

| 场景 | 操作 | 成功条件 |
| --- | --- | --- |
| A | Me → 编辑按钮 → 编辑头像 → 相册 JPG → 等预览 → 填非空名字 → Save | 预览正确；Me 立即更新；只有持久化成功才有 Profile updated |
| B | Save 后关闭并重新进入 Sheet | 仍是已存头像。另测选图后不 Save 直接关闭：原已存头像应保持 |
| C | 切换其他 Tab 再返回 Me | 相同头像；不得无故显示默认头像 |
| D | 真正结束小程序进程并重进，联网完成账户验证 | 仍显示头像。仅返回桌面不等于冷启动；另测离线冷启动，记录身份锁定而非误报头像删除 |
| E | 相册 PNG、系统截图；另测 HEIC/WebP | PNG 不应因 iOS 压缩限制失败；实际格式与文件后缀一致。HEIC/未知格式若不能规范化/解码，应明确提示重新选图，不保存坏路径 |
| F | 大照片，分别勾选原图/非原图 | 文件非零、能解码；处理期间反复点击 Save 无效；完成后能存。观察峰值内存、耗时、空间错误 |
| G | 打开相册或相机后取消 | 原头像保留，无错误提示，无成功提示；系统取消不误作程序错误 |
| H | 用测试构建/调试器临时注入 FS copy+write 失败；另独立注入分区 setStorageSync 一次失败 | FS 失败无新预览；Store 失败保留表单、Me 原头像、draft/outbox，不提示 Profile updated。测试后恢复函数/重启，勿提交故障开关 |
| I | 连续两次选择，故意延迟首次结果；另测关闭重开、换表单、短暂 null | 后一次胜出；旧 end 不清新恢复；旧请求不能写新页面；当前合法返回可回填 |
| J | Cloud tools 单独选云端头像 → 读取 revision → push → pull → apply | 每一阶段单独核对 avatarSelected、profileRead、返回 avatar、应用文件和最终 Me；返回后若 _avatar 被 reset，明确记失败。不能用 A 成功替代 J |

每次文件失败，用本机调试器在明确断点读取以下布尔值/数字，不外发私人完整路径或 base64：

1. photosDir 建立后 access 成功；目标目录在本用户 USER_DATA_PATH 内。
2. copy 源为原生返回的本地路径，目标为本用户目录；fallback 的 read 得到 ArrayBuffer、write 完成。
3. statSync(savedPath).size > 0。
4. wx.getImageInfo({src:savedPath}) 成功且 type/尺寸合理。
5. Sheet 和 Me 的 image load 成功；如失败查看 `[avatar] preview IMAGE_LOAD_FAILED`（Sheet）、`[avatar] me-preview IMAGE_LOAD_FAILED`（Me）及 imageErrors。
6. Save 后当前 partition 中 profile.avatar 等于已核对的路径。
7. 页面重开及冷启动后再次做 3–5，区分“路径未存”“文件不存在”“解码失败”“UI fallback”“身份未解锁”。

开发日志只包含 `[avatar] 阶段 错误码`。可恢复压缩/copy 失败也会留下阶段记录；取消不记录错误。不要把 recoverable 日志本身当成最终失败，要看最后是否返回并保存有效头像。

## 8. 结论与尚不能证明的风险

确定修复的是可复现的代码缺陷：无解码成功门槛、处理中误 Save、错误的请求恢复归属、写失败清队列，以及诊断错误信息丢失。没有证据将用户所有真机症状归因于一个特定格式或某一个 API。

之前多轮修改主要验证了字符串路径和 UI 请求顺序，没有把原生选择、文件落盘、解码、分区提交和冷启动串起来；还增加了提前提交及清队列重试。因此测试局部通过不代表头像可持续使用。

剩余风险：原生 chooser/生命周期回调顺序、iOS/Android 解码差异、微信实际 USER_DATA_PATH 生命周期、低存储/超大图、重装/清理造成文件消失、Cloud tools 独立 reset/apply 问题、现有 removePhoto/pruneOrphans 为 no-op 导致旧图积累。未进行自动清理以避免误删用户数据；也未绕过冷启动身份锁定。

最终发布验收仍需真机 A–J 结果和上述 13 项失败的独立处理/确认。
