# 当前 Bug 交接

## 用户当前看到的错误

最新截图：`references/chat_screenshots/c2a6af42-5f02-4d71-a1f7-e8c07d049e9f.png`

主要错误：

```text
Bad attr `class` with message: unexpected `;` at pos8.
File: ./pages/add/index.wxml
around line 66
```

随后还有：

```text
_route_ is not defined
```

后者应当优先视为 WXML 页面编译失败后的次级运行时错误，不要先追 `_route_`。

## 当前源码的直接问题

文件：

```text
miniprogram/pages/add/index.wxml
```

当前写法：

```xml
<text wx:for="{{scores}}" wx:key="*this"
  class="star {{item &lt;= lajiChongRating ? 'on' : ''}}"
  data-who="lajiChong"
  data-score="{{item}}"
  bindtap="setRating">★</text>
```

以及：

```xml
class="star {{item &lt;= xiaoXiaoQiRating ? 'on' : ''}}"
```

之前为了避开 XML 中 `<` 的解析，把 `<=` 改成了 `&lt;=`。微信 WXML 编译器现在把实体中的 `;` 当成 class 属性表达式里的非法字符，因此报 `unexpected ';'`。

## 最小修复建议

不要在 Mustache 表达式中使用 `&lt;=`。

最简单地把比较方向反过来，使用 XML 属性中安全的 `>=`：

```xml
class="star {{lajiChongRating >= item ? 'on' : ''}}"
```

以及：

```xml
class="star {{xiaoXiaoQiRating >= item ? 'on' : ''}}"
```

这和原逻辑完全等价：评分 4 时，1~4 星为 `on`。

如果微信 WXML 对 attribute 内三元表达式仍有兼容问题，可进一步改为：

- 在 JS 中生成 `lajiChongStars` / `xiaoXiaoQiStars` 数组，每项 `{score, active}`；
- WXML 仅用 `class="star {{item.active ? 'on' : ''}}"`。

## 之前出现过但已确认不是根因的问题

### 1. `WXML file not found: ./pages/add/index.wxml`

用户最后上传的当前项目中，该文件**实际存在**，路径和 `app.json` 路由也正确。

### 2. 热重载 timeout

出现过：

```text
[loader] unexpected current frame status timeout
```

不是当前主错误。

### 3. `ignoreDevUnusedFiles`

曾尝试关闭文件过滤，但当前最新错误已经成功读取到 `pages/add/index.wxml` 并定位第 66 行，说明“找不到文件”阶段已经过去。

## 当前配置

### app.json

```json
{
  "pages": [
    "pages/index/index",
    "pages/add/index",
    "pages/example/index"
  ],
  "window": {
    "backgroundColor": "#FFF9F3",
    "backgroundTextStyle": "light",
    "navigationBarBackgroundColor": "#FFF9F3",
    "navigationBarTitleText": "垃圾虫和小小琪的觅食记",
    "navigationBarTextStyle": "black"
  },
  "sitemapLocation": "sitemap.json",
  "style": "v2",
  "lazyCodeLoading": "requiredComponents"
}
```

### 云开发

`miniprogram/app.js` 已完成 `wx.cloud.init()`，不要删除环境 ID。

### 云函数

`cloudfunctions/mealRecords/` 已存在。

修复 WXML 编译后再部署它：

```text
右键 mealRecords → 上传并部署：云端安装依赖
```

## 修复后的验证顺序

1. 清理/重新编译，确认 0 个 WXML error。
2. 首页能显示。
3. 点中间 `+`，进入“记一顿”。
4. 点击两组星级评分，确认亮星状态正确。
5. 先不选照片，填写餐厅名，部署云函数后保存。
6. 返回首页，确认最新记录出现。
7. 再加照片测试云存储。
