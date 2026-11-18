随仓库分发的拉丁字体
========================

来源：Google Fonts（https://fonts.googleapis.com）
许可：SIL Open Font License 1.1 —— 可随产品分发、可商用，见各字体官方仓库。

- Cormorant Garamond —— 展示字体（大标题、衬线标题）。Christian Thalmann / Catharsis Fonts
- Montserrat —— 正文无衬线。Julieta Ulanovsky

只取 Google 切好的 **latin** 子集：中文由字体栈后面的系统字体接手，
把中日韩字形也下下来只会让每个文件大好几倍，而一个都用不到。

**不要手改这里的文件。** 换字体改 `scripts/fetch-fonts.ts` 的 FONTS 再重跑，
手改会在下一次下载时被覆盖。改完要同步 `packages/ir-schema/src/html-doc.ts` 里的
BUNDLED_FACES（那份清单决定页面里怎么声明 @font-face）。
