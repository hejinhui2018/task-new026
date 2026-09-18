// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../App';

declare global {
  // 让 React 知道在测试环境中使用 act
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('App 冒烟测试', () => {
  it('完整渲染工作台，并可切换到冲突视图', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => {
      root.render(<App />);
    });

    const text = el.textContent ?? '';
    expect(text).toContain('RightsWindow');
    expect(text).toContain('品牌主直播');
    expect(text).toContain('上海');
    expect(text).toContain('伦敦');
    expect(text).toContain('关键时刻');
    expect(text).toContain('最终选材');

    // 切到"冲突"标签页：内置案例的三类冲突都应列出
    const conflictsBtn = [...el.querySelectorAll<HTMLButtonElement>('.rtabs button')].find((b) =>
      b.textContent?.includes('冲突'),
    );
    expect(conflictsBtn).toBeTruthy();
    await act(async () => {
      conflictsBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const after = el.textContent ?? '';
    expect(after).toContain('授权重叠');
    expect(after).toContain('授权空档');
    expect(after).toContain('地区不匹配');

    await act(async () => {
      root.unmount();
    });
    el.remove();
  });
});
