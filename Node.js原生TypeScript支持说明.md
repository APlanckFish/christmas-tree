# Node.js 原生 TypeScript 支持说明

## 版本支持

### Node.js 22.6.0+
- 引入**实验性** TypeScript 支持
- 需要使用 `--experimental-transform-types` 标志
- 只支持简单的 TypeScript 语法

### Node.js 22.18.0+
- **类型剥离（type stripping）**功能默认启用
- 可以直接运行 `.ts` 文件：`node server.ts`
- 仍然只支持简单的 TypeScript 语法

## 支持的语法 ✅

Node.js 原生支持可以处理**可擦除的 TypeScript 语法**：

- ✅ 类型注解：`const x: number = 1`
- ✅ 接口：`interface User { name: string }`
- ✅ 类型别名：`type ID = string`
- ✅ 泛型：`function f<T>(x: T): T`
- ✅ 联合类型：`string | number`
- ✅ 可选属性：`{ name?: string }`
- ✅ 类型导入：`import type { ... }`

## 不支持的语法 ❌

需要代码转换的语法**不支持**：

- ❌ **枚举（enum）**：`enum Color { Red, Blue }`
- ❌ **命名空间（namespace）**：`namespace MyNamespace { ... }`
- ❌ **装饰器（decorators）**：`@Component class MyClass`
- ❌ **参数属性**：`constructor(public name: string)`
- ❌ **一些高级类型特性**

## 当前项目情况

### 使用的 Node.js 版本
- **Dockerfile**：`node:20-alpine`（不支持原生 TypeScript）

### 代码检查
检查 `server.ts` 使用的语法：
- ✅ 只使用了简单的类型注解和接口
- ✅ 没有使用枚举、命名空间、装饰器
- ✅ **理论上可以在 Node.js 22+ 上原生运行**

### 如果升级到 Node.js 22

可以尝试使用原生支持：

```dockerfile
# Dockerfile
FROM node:22-alpine AS production
# ...
CMD ["node", "server.ts"]  # 直接运行，无需 tsx
```

**但需要注意**：
1. 需要测试确保所有语法都支持
2. 某些依赖可能仍需要转换
3. 错误堆栈可能不如 tsx 清晰

## 推荐方案

### 对于当前项目（Node.js 20）

**继续使用 tsx**，因为：
1. Node.js 20 不支持原生 TypeScript
2. tsx 稳定可靠，广泛使用
3. 性能影响可忽略

### 如果升级到 Node.js 22

**可以尝试原生支持**，但建议：
1. 先测试原生运行是否正常工作
2. 如果遇到问题，回退到 tsx
3. 对于生产环境，tsx 仍然是更安全的选择（更成熟、支持更完整）

## 总结

| 方案 | Node.js 版本 | 支持度 | 推荐度 |
|------|-------------|--------|--------|
| **tsx** | 所有版本 | 完整支持所有 TypeScript 特性 | ⭐⭐⭐⭐⭐ |
| **Node.js 原生** | 22.6.0+ | 只支持简单语法 | ⭐⭐⭐（实验性） |
| **编译为 JS** | 所有版本 | 完整支持 | ⭐⭐⭐⭐ |

**结论**：对于生产环境，**tsx 仍然是最佳选择**，即使升级到 Node.js 22。

