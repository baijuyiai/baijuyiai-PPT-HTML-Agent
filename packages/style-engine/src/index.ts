// 主入口必须保持浏览器可用：不得引入 node:* 内置模块或任何服务端专属依赖。
export * from './variant-set.js';
// 纯色彩换算（无 import）。讲解光标要按品牌色算互补色，浏览器侧得够得着
export * from './color.js';
// 浏览器安全：只依赖 ir-schema 与类型，界面据此在客户端重推版式
export * from './measured-layout.js';
export * from './grid.js';
export * from './layout-spec.js';
export * from './language.js';
export * from './pack.js';
export * from './lint.js';
export * from './builtin/index.js';
