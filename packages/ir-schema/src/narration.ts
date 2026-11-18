/**
 * 讲解音色的备选与默认值。
 *
 * **只是建议，不是枚举**——可用音色取决于语音模型，所以界面用 `datalist`：
 * 既能从这份列表里挑，也能直接填一个这里没有的，换模型时不会把人锁在错的名字上。
 *
 * 放在共用包里是因为后台设置与工作台的项目级选择都要用同一份，别在两处各抄一遍。
 * 分组的依据是实测听感（同一段 688 字讲稿、同一个语气，语速差得很开：
 * nova 62 秒、alloy 92 秒、onyx 142 秒——**音色本身也会明显改变语速**）。
 */
export interface NarrationVoiceOption {
  id: string;
  /** 给界面看的一句话说明 */
  hint: string;
}

export const NARRATION_VOICE_OPTIONS: NarrationVoiceOption[] = [
  { id: 'onyx', hint: '男声 · 低沉，语速偏慢' },
  { id: 'echo', hint: '男声 · 明亮' },
  { id: 'ballad', hint: '男声 · 舒缓' },
  { id: 'sage', hint: '女声 · 沉稳' },
  { id: 'shimmer', hint: '女声 · 清亮，语速偏快' },
];

/** 默认音色。后台的全局设置与新建项目的快照都以它起步 */
export const DEFAULT_NARRATION_VOICE = 'onyx';
