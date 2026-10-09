# Add — 最后一个遗留缺陷修复：clear-draft 图标 fallback（2026-09-30）

**未 commit / 未 push / 未 deploy。UI 注册检查点未推进（本轮不涉及 Add UI 文件）。**
未动 Header 布局 / clear-draft 定位 / morph-icon 架构 / Import / Photo / Restaurant / Notes /
Date·Rating / Tags / More details / Save / motion / 任何其它页面。

---

## 1. 根因确认（与 brief 一致）

渲染树（`automation_element_action --action wxml --selector .clear-draft`，修复前）：

```
<morph-icon name="eraser" from-name="eraser" renderer="svg">
  <view class="morph-box" style="width:21px;height:21px">
    <view class="morph-fallback">
      <components/icon name="lucide-eraser" size="37" color="#1b1c1a" stroke="1.75"></components/icon>
    </view>
  </view>
</morph-icon>
```

- **没有任何 `morph-svg` / `morph-canvas` 层**（该运行环境下 morph 不绘制）⇒ fallback 就是唯一可见路径。
- `components/morph-icon/index.wxml` 的 fallback 统一拼 **`'lucide-' + name`**；
  Add 页传的是 `name="{{clearIcon.name}}"`，其初值 `{name:'eraser', fromName:'eraser'}` ⇒ 请求 **`lucide-eraser`**。
- `miniprogram/utils/icons.js` 的别名表有 **28** 条 `lucide-*`（TabBar / morph-lab 用到的每一对都在），
  **唯独缺 `lucide-eraser`** ⇒ `iconSvg()` 对未知名返回 `''`（`if (!body) return ''`）
  ⇒ fallback 的 `<image wx:if="{{src}}">` **永不渲染** ⇒ 只剩 `.clear-draft::before` 的空圆片。

**morph 本身无罪**：`name="eraser"`（裸名）是能解析的；坏的只是 **fallback 安全网**。

---

## 2. 新增的别名（唯一一处）

`tools/icon-aliases.json`：

```json
  "lucide-check": "check",
  "lucide-eraser": "eraser",     <-- 新增（与 clear-draft 的 morph 对 eraser→check 放在一起）
```

28 → **29** 条。**没有**手动改生成产物、**没有**绕过注册表、**没有**在 Add 页塞一次性 SVG、
**没有**在 morph-icon 里加特例分支。

---

## 3. 使用的生成器 / 事实来源

`tools/build-icons.cjs`（仓库既有生成流程）——**唯一的几何来源**：

- 从 `miniprogram/images/icons/lucide/*.svg` 生成 `icons`（49 个官方图形）
- 从 `tools/icon-aliases.json` 生成别名合并
- 输出三处：`miniprogram/utils/icons.js`、`miniprogram/utils/lucideMorphNodes.js`、`tools/_gen/icons.json`

执行：`node tools/build-icons.cjs` → `Generated 49 official shapes + 29 compatibility names (no duplicate geometry source).`

**生成差异（逐行核对）**：
- `miniprogram/utils/icons.js`：**只有第 53 行的 `aliases` 字面量多了一项** `"lucide-eraser":"eraser"`。
- `miniprogram/utils/lucideMorphNodes.js`：**逐字节相同**（几何未变）。
- `tools/_gen/icons.json`：**无差异**（该文件只含 49 个官方图形，不含别名）。

`verify-icons.cjs` 内的 **generator-drift 检查**（重新跑生成器并断言三处产物不变）**通过**
⇒ 本次改动用的是生成器、且可复现。

---

## 4. 改动的确切文件

| 文件 | 改动 |
|---|---|
| `tools/icon-aliases.json` | +1 条别名 `"lucide-eraser": "eraser"` |
| `miniprogram/utils/icons.js` | **生成产物**，仅 `aliases` 字面量 +1 项（未手改） |
| `tools/verify-icons.cjs` | ① 别名计数 `28 → 29`；② 末行文案 28→29；③ **新增 morph-fallback 产品级断言**（见 §9） |

**未改**（git 状态可证）：
`pages/add/index.wxml`（`22913b40…` == 检查点，逐字节未动）、`pages/add/index.wxss`、
`pages/add/index.js`（`b9a99be7…`）、`components/morph-icon/**`（**0 个文件被修改**）、任何其它页面/组件。

---

## 5. PEARL 截图

`ICON-pearl.png` + 放大 `icon-pearl-zoom.png`：
Header 右侧圆片内**eraser 图标已渲染**（深色 `#1b1c1a`），光学居中、无裁切；
与左侧 ✕（45rpx）相比 37rpx 略小，符合「次要工具」的权重。

## 6. DUSK 截图

`ICON-dusk.png` + 放大 `icon-dusk-zoom.png`：
DUSK 下同样渲染（浅色 `#eeeae3`），圆片为 `rgba(234,234,234,.12)`。
**未改任何颜色/表面** ⇒ 圆片填充与背景与修复前完全一致，只是多了字形。

---

## 7. morph + fallback 行为结果

| 项 | 结果 |
|---|---|
| fallback 路径 | **已修好**：渲染树里 fallback 内出现 `<image class="s-icon" style="width:21px;height:21px" src="data:image/svg+xml;charset=utf-8,…">`，`src` 非空 |
| morph 路径 | **未受影响**：`components/morph-icon/**` 0 文件改动；`lucideMorphNodes.js` 逐字节相同；别名只**新增**、未重命名/删除 |
| 未知名的行为 | 仍返回 `''`（`iconSvg('missing-icon')===''`）⇒ **没有**引入「静默回退」的副作用 |
| Header 几何 | **逐值未变**：heading `l16 t88 w390 h59`、closeAdd `l8 t84 50×50`、clearDraft `l364 t84 50×50`、title `l59 t88`、subtitle `l59 t126`、importEntry `l22 t165`、photoRow `l22 t233`（PEARL / DUSK 相同） |
| 位置 / 命中区 / morph 行为 / 按压 / 无障碍 | 全部未动（未碰 WXML/WXSS/JS） |

---

## 8. 图标回归结果（逐组核对，0 失败）

| 组 | 结果 |
|---|---|
| TabBar（rest/chosen） | `lucide-house` `lucide-house-heart` `lucide-map` `lucide-map-pinned` `lucide-utensils` `lucide-utensils-crossed` `lucide-users` `lucide-users-round` `lucide-user` `lucide-user-round` 全部 ✓ |
| Add clear-draft morph 对 | `lucide-eraser` ✓ `lucide-check` ✓ |
| Save | `notebook-pen` ✓ |
| Edit / Remove / Add-more | `pencil` ✓ / `x` ✓ / `plus` ✓ |
| calendar / location pin / stars | `calendar-days` ✓ / `map-pin` `map-pin-off` ✓ / `star` ✓ |
| chevron 组 | `chevron-down` `chevron-up` `chevron-left` `chevron-right` ✓ |

**总数 29 条别名，0 失败，无别名被重命名或删除**
（`verify-icons.cjs` 第 20 行的 `icons[alias] === icons[name]` 循环对**每一条**别名都做了等值断言）。

---

## 9. verify-icons 的加固（产品要求，不是只数个数）

`tools/verify-icons.cjs` 新增（在别名等值循环之后）：

```js
assert.match(morph-icon.wxml, /'lucide-'\s*\+/);              // fallback 前缀约定仍成立
const morphDriven = new Set();                                 // 扫描所有 WXML 的 <s-morph name/from-name 静态值>
for (… pages/add/index.js …) morphDriven.add(clearIcon 的 name/fromName 字面量);
assert(morphDriven.has('eraser'));                             // Add quick-clear 必须被覆盖
for (const n of morphDriven) assert(icons['lucide-' + n]);      // 每个 morph 名都必须解析到非空图标
assert.equal(aliases['lucide-eraser'], 'eraser');
assert.match(decodeURIComponent(iconSvg('lucide-eraser')), /<(path|line|rect|…)\s/);
```

要点：
- **直接断言 `lucide-eraser` 存在且能渲染出 SVG 形状** —— 而不是只依赖别名总数。
- 额外做了**通用覆盖**：凡是 WXML 里静态传给 `<s-morph name/from-name>` 的名字、
  以及 Add 页 `clearIcon` 的字面量（`eraser` / `check`），都必须有 `lucide-` 别名 ⇒
  **同类缺陷（任何 morph fallback 拿不到图标）都会被抓住**，而不只是这一个。
- 计数断言 `28 → 29` 只是「合法的注册表增长」，**没有把测试改弱**：
  原有断言（49 图形 / 等值 / 未知名为空 / 87 处模板声明 / generator 无漂移 / 语义角色 / 原生 SVG·PNG 契约）**全部保留**。

**RED 证明**（内存副本回注，不碰文件）：把 `lucide-eraser` 从别名表移除后重放同一组断言
⇒ **FAIL `morph fallback name lucide-eraser must resolve`**；保留别名 ⇒ **PASS**。

---

## 10. 验证结果

| 套件 | 结果 |
|---|---|
| `verify-icons.cjs` | **EXIT 0** —— `ICON VERIFICATION PASSED: 49 official SVGs, 29 compatibility aliases (incl. morph-fallback coverage), …` |
| `verify-visual-language.cjs` | **EXIT 0** |
| `verify-ui-quality.cjs` | **EXIT 0** |
| `npm run verify`（verify-miniprogram） | **EXIT 0** |
| `npm run verify:all` | **EXIT 1 —— 唯一红点 = Add UI 注册闸门**（见下） |

**唯一红点（预期，与图标无关）**：`verify-cloud.cjs:281` —— `pages/add/index.wxss`
现为 `df572eae…`，检查点仍是 `337b92fa…`。
这正是 **Final Optical Pass 已改 Add WXSS、但那份单独批准的哈希尚未推进** 造成的；
`npm run verify:all` 的日志显示 **`verify` / `verify:tabbar` / `verify:assets` / `verify:icons` 都先通过了**，
才在 `verify:cloud` 停住。
**图标修复本身没有改 Add WXML/WXSS**：`pages/add/index.wxml` 哈希仍是 `22913b40…`（== 检查点），
`pages/add/index.wxss` 的哈希与本轮之前完全一致（`df572eae…`）。

---

## 11. 遗留 Add 缺口

1. **UI 注册检查点待推进（行政步骤，非缺陷）**：`pages/add/index.wxss` = `df572eae…`
   需授权后写进 `tools/add-page-review.json` 的 `sha256`（`baseSha256` / `review` 不动）。
   `pages/add/index.wxml` 哈希未变，无需改动。
2. **Date 文本内边距 6rpx vs 其它输入框 22rpx（约 8px 差）—— 接受的权衡，非待修缺陷**：
   Date 列宽被**冻结的五星预留（444rpx）**限制为 219rpx，"Choose a date" 本身要 165rpx，
   加上图标 32rpx / gap 6rpx / 边框 2rpx，每侧最多只能分到 ~7rpx。
   要消除它必须**重开 Rating 响应式契约**（已被连续两次明确冻结）⇒ 记录为权衡，不在本轮动。

**除此之外，Add 页没有已知的可见缺陷。**

---

## 12. 一句话结论

**根因确认无误：`lucide-eraser` 别名缺失 ⇒ morph fallback 的 `iconSvg()` 返回空串 ⇒ 空圆片。
已按仓库既有生成流程在 `tools/icon-aliases.json` 补上该别名并重新生成，
`icons.js` 只多一项、几何文件逐字节不变、morph-icon 与 Add 三件套完全未动；
PEARL 与 DUSK 都已渲染出 eraser 字形，Header 几何逐值未变，29 条别名 0 失败。
`verify-icons` 除计数 28→29 外，还新增了直接断言 `lucide-eraser` 可解析 + morph 名全覆盖的产品级守卫（附 RED 证明）。**
