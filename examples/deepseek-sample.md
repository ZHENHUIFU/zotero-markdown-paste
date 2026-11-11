## 2.1 控制方程

不可压缩流的动量方程为

\[
\rho\left(\frac{\partial \mathbf{u}}{\partial t} + \mathbf{u}\cdot\nabla \mathbf{u}\right) = -\nabla p + \mu \nabla^{2}\mathbf{u}
\]

其中 \(\mathbf{u}\) 为速度场，\(p\) 为压强，\(m\) 为质量。**注意**当 \(Re \ll 1\) 时惯性项可忽略。

### 边界条件

入口给定速度 \(u = U_0\)，出口给定压强 \(p = 0\)，壁面满足无滑移条件 \(u = 0\)。

1. 第一类边界条件：给定值
2. 第二类边界条件：给定梯度 \(\partial u / \partial n = 0\)

> 引用：当 \(\mu\) 为常数时，方程可进一步化简。

| 参数 | 含义 | 取值 |
| --- | --- | --- |
| \(\mu\) | 动力粘度 | \(1\times10^{-3}\) |
| \(\rho\) | 密度 | 998 |

```python
# 代码块里的 \(x\) 不会被当成公式
def residual(u):
    return -div(u)  # 连续性方程
```

行内代码 `\(a+b\)` 同样保持原样，金额 $100 也不会被误判成公式。
