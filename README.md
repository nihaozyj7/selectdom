# SelectDom · 任意网页 DOM 选择器

一个零依赖的纯前端脚本，注入任意网页后即可通过悬浮面板拾取页面上的 DOM 元素：悬停高亮、点击选中，并在面板中管理已选列表、复制「序号:选择器:元素文本」或唯一 CSS 选择器。单文件 IIFE，同一份代码既可 `<script>` 引入，也可作为书签 / 控制台脚本运行。

## 功能特性

- **悬浮面板**：默认位于右上角，工具栏一行可拖动；拖到屏幕左右边缘（10px 阈值内）自动吸附并贴边隐藏成窄条，悬停即展开
- **选择模式**：点击「选择元素」进入，悬停高亮目标元素，点击加入已选列表；重复选择自动提示
- **列表管理**：单条移除、清空、收起/展开、实时计数
- **复制输出**：每项可复制「序号:选择器:元素文本」（元素文本压缩空白、超 30 字符自动截断加省略号），也可仅复制唯一 CSS 选择器；支持一键复制全部
- **唯一选择器算法**：优先 `id` → 唯一 class 组合 → 兄弟 `nth-of-type`，生成后经 `querySelector` 校验
- **互不干扰**：选择模式下屏蔽页面点击，`Esc` 或再次点击「退出选择」立即恢复；iframe 内元素不可选，Shadow DOM 内元素按宿主节点处理
- 零全局污染，仅暴露 `window.__selectDomCleanup()` 用于卸载

## 通过 jsDelivr CDN 引入

### 方式一：书签小工具（推荐）

新建书签，把下面内容粘贴到网址栏。之后在任意网页点击该书签即可加载：

```javascript
javascript:(function(){var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/gh/nihaozyj7/selectdom@main/dom-picker.js';document.head.appendChild(s);})();
```

### 方式二：HTML 一行引入

在页面 `</body>` 前加入一行：

```html
<script src="https://cdn.jsdelivr.net/gh/nihaozyj7/selectdom@main/dom-picker.js"></script>
```

### 方式三：控制台动态注入

在任意页面的开发者工具（F12）控制台中粘贴执行：

```js
(function () {
  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/gh/nihaozyj7/selectdom@main/dom-picker.js';
  document.head.appendChild(s);
})();
```

> 说明：`dom-picker.js` 本身即自执行 IIFE，也可直接把文件全部内容粘贴为书签（`javascript:` + 内容），无需网络依赖。
>
> 卸载：执行 `window.__selectDomCleanup()` 即可移除界面并恢复原状；刷新页面同样生效。

## 使用方法

1. 页面右上角出现悬浮面板，点击工具栏「选择元素」进入选择模式
2. 鼠标悬停目标元素，出现橙色虚线高亮框，点击将其加入已选列表
3. `Esc` 或点击「退出选择」退出选择模式
4. 在列表中点击「复制」输出「序号:选择器:元素文本」、「选择器」仅复制 CSS 选择器、「✕」移除该项；工具栏支持「复制全部」「清空」「收起」

## 本地调试

仓库包含 `demo.html`（内置测试用例：嵌套 id/class、iframe、Shadow DOM），本地起静态服务器即可：

```bash
python -m http.server 8123
# 访问 http://localhost:8123/demo.html
```

## 文件结构

```
dom-picker.js   核心脚本（单文件、零依赖）
demo.html       本地演示与调试页
README.md       本文档
```
