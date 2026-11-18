import * as React from 'react';

/**
 * JSX 运行时兜底。**必须在任何 `@lumen/slides` 导入之前执行**，所以单独成模块。
 *
 * 背景：tsx 只把 tsconfig 里的 `jsx: react-jsx` 应用到该 tsconfig 目录树内的文件。
 * packages/slides 位于 apps/worker 之外，于是 Slide.tsx 等文件被按**经典 JSX** 编译，
 * 产物里是 `React.createElement(...)`，而它们并没有 import React。
 * 这里补一个全局 React，让两种运行时都能正常渲染。
 *
 * 为什么不能像原先那样把兜底写在 render.tsx 的函数体外：ESM 的 import 会被提升，
 * `@lumen/slides` 整个模块树在 render.tsx 的第一条语句之前就已求值完毕。
 * 只要 slides 里有一处**顶层** JSX（icons.tsx 的图标表就是），它会在兜底装好之前就炸。
 * 单独成一个模块并排在最前面导入，才是真正先于它执行。
 */
const globalScope = globalThis as unknown as { React?: typeof React };
if (!globalScope.React) globalScope.React = React;

export {};
