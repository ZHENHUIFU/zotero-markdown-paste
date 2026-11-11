# 一级标题：Markdown 粘贴测试

这是一段普通正文，用来确认段落样式。这里检验**加粗**、*斜体*、***加粗斜体***、~~删除线~~、
`行内代码`，以及链接 [Zotero 官网](https://www.zotero.org/) 能否正确还原。

## 二级标题：行内公式

行内公式有两种写法，效果相同：LaTeX 旧式 \(E = mc^2\)，以及美元符号 $a^2 + b^2 = c^2$。

单符号公式也必须能转（Zotero 自带的判断逻辑会漏掉这种）：质量为 \(m\)，温度为 \(T\)，压强为 \(p\)。

### 三级标题：上下标与希腊字母

\(x_i^2 + y_i^2 = r^2\)，\(\alpha + \beta = \gamma\)，\(\sigma_{ij}\)，\(\frac{\partial u}{\partial t}\)。

#### 四级标题

##### 五级标题

###### 六级标题

## 块级公式

独立成行的公式，用 `\[ ... \]` 写：

\[
\nabla \cdot \mathbf{u} = 0
\]

也可以用 `$$ ... $$`：

$$
\int_{0}^{1} f(x)\,\mathrm{d}x = F(1) - F(0)
$$

多行公式（`aligned` 环境，用 `&` 对齐、`\\` 换行）：

\[
\begin{aligned}
\frac{\partial u}{\partial t} + u\frac{\partial u}{\partial x}
  &= -\frac{1}{\rho}\frac{\partial p}{\partial x} + \nu\frac{\partial^2 u}{\partial x^2} \\
\frac{\partial u}{\partial x} &= 0
\end{aligned}
\]

## 列表

无序列表，支持嵌套：

- 第一项
- 第二项，含公式 \(a_i\) 与 `行内代码`
  - 嵌套子项
  - 另一个子项
- 第三项

有序列表：

1. 第一步：离散化
2. 第二步：组装残差，注意 **边界条件**
3. 第三步：求解线性方程组

## 引用

> 单行引用：当 \(Re \ll 1\) 时，惯性项可以忽略。
>
> 引用的第二段，含 `行内代码` 与公式 \(O(\epsilon)\)。

## 表格

| 符号 | 含义 | 典型取值 |
| :--- | :---: | ---: |
| \(\mu\) | 动力粘度 | \(1.8\times10^{-5}\) |
| \(\rho\) | 密度 | 1.225 |
| \(\nu\) | 运动粘度 | \(1.5\times10^{-5}\) |

## 代码

代码块里的反斜杠与美元符不会被当成公式：

```python
# 这里的 \(x\) 与 $y$ 应保持原样
import numpy as np

def residual(u, dx):
    return np.gradient(u) / dx
```

行内代码同理：`\(a+b\)`、`$x$`。

## 图片

图片会被降级成链接（避免远程图片存成坏链，这是有意设计的）：

![示例图](https://www.zotero.org/static/images/theme/logo.png)

## 分隔线

---

## 不该被误转的情况

金额不是公式：$100 到 $200 之间。转义写法 \$5 也保持原样。
