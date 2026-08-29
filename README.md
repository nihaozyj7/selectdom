# SelectDom · 任意网页 DOM 选择器

一个零依赖的纯前端脚本，注入任意网页后即可通过悬浮面板拾取页面上的 DOM 元素：悬停高亮、点击选中，并在面板中管理已选列表、复制「选择器 / DOM结构 / 用户建议」模板或唯一 CSS 选择器。单文件 IIFE，同一份代码既可 `<script>` 引入，也可作为书签 / 控制台脚本运行。

## 功能特性

- **悬浮面板**：默认位于右上角，工具栏一行可拖动；拖到屏幕左右边缘（10px 阈值内）自动吸附并贴边隐藏成窄条，悬停即展开
- **选择模式**：点击「选择元素」进入，悬停高亮目标元素，点击加入已选列表；重复选择自动提示
- **持久高亮**：已选元素在页面上保留彩色轮廓高亮，相邻/叠加的元素自动用不同颜色区分；`html`/`body` 不可选也不高亮
- **评论与建议**：每个已选元素右上角有「✏️评论」按钮（元素过小时气泡会放到元素外侧，并用箭头指向该元素），点击弹出编辑层填写用户建议；保存后元素旁出现建议气泡（悬停显示建议文字），并与面板里的「用户建议」输入框双向同步
- **列表管理**：单条移除、清空、收起/展开、实时计数
- **复制输出**：每项可复制「选择器 / DOM结构 / 用户建议」模板块；`DOM结构` 仅显示顶层结构（标签与属性，不含子内容）；`用户建议` 为每项可选填写的备注（填了才输出）；也支持仅复制唯一 CSS 选择器与一键复制全部
- **唯一选择器算法**：优先 `id` → 唯一 class 组合 → 兄弟 `nth-of-type`，生成后经 `querySelector` 校验
- **互不干扰**：选择模式下屏蔽页面点击，`Esc` 或再次点击「退出选择」立即恢复；iframe 内元素不可选，Shadow DOM 内元素按宿主节点处理
- 零全局污染，仅暴露 `window.__selectDomCleanup()` 用于卸载

## 通过 jsDelivr CDN 引入

### 方式一：书签小工具（推荐）

> 注意：不要在浏览器地址栏直接粘贴 `javascript:` 代码再回车，Chrome / Edge 会拦截。请按下面的步骤把它添加为书签，几乎所有浏览器都支持。

**第 1 步：复制下面的代码**

```javascript
javascript:(function(){var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/gh/nihaozyj7/selectdom@main/dom-picker.js';document.head.appendChild(s);})();
```

**第 2 步：新建一个书签**（在任意网页上操作即可，比如当前页面）

- 按 `Ctrl+D`（Mac 为 `Cmd+D`）收藏当前页面，名称随便填，例如 `SelectDom`

**第 3 步：编辑书签，把「网址」替换为第 1 步复制的代码**

- **Chrome / Edge**：按 `Ctrl+Shift+B` 显示书签栏 → 右键该书签 → 「修改…」；或打开书签管理器（`chrome://bookmarks`）→ 找到该书签 → 右键 → 「编辑」，把「网址」字段内容全部替换为上面的代码
- **Firefox**：按 `Ctrl+Shift+O` 打开书签库 → 右键该书签 → 「属性」，把「位置」字段内容全部替换为上面的代码

**第 4 步：保存**（Chrome / Edge 点「保存」，Firefox 关闭属性窗口即可），之后在任意网页点击该书签，页面右上角即会出现 SelectDom 面板。

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
2. 鼠标悬停目标元素出现橙色虚线高亮，点击将其加入已选列表；选中后元素保留彩色轮廓高亮（叠加元素颜色不同）
3. 点击元素右上角的「✏️评论」（小元素为外部气泡，箭头指向元素），在弹层中输入用户建议并「保存」，元素旁出现建议气泡
4. 面板列表中也可直接填写/修改「用户建议」，与页面气泡实时同步
5. `Esc` 或点击「退出选择」退出选择模式
6. 点击「复制」输出模板块；「选择器」仅复制 CSS 选择器、「✕」移除该项；工具栏支持「复制全部」「清空」「收起」

复制输出示例（复制全部）：

```
选择器: div.rec-list > div:nth-child(2) > div:nth-child(1) > div:nth-child(2)
DOM结构: <div class="title" data-id="123"></div>
用户建议: 改成红色加粗

选择器: div.next-play > div:nth-child(2)
DOM结构: <div class="play-btn"></div>
```

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
