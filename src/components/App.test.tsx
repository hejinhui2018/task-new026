// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { App } from './App';
import { StoreProvider } from '../state/store';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render() {
  act(() => {
    root.render(
      <StoreProvider>
        <App />
      </StoreProvider>,
    );
  });
}

function buttonByText(text: string): HTMLButtonElement {
  const btn = [...container.querySelectorAll('button')].find((b) =>
    b.textContent?.includes(text),
  );
  if (!btn) throw new Error(`找不到按钮: ${text}`);
  return btn as HTMLButtonElement;
}

it('工作台挂载并显示内置案例：默认时刻上海播出主片', () => {
  render();
  expect(container.textContent).toContain('RightsWindow');
  expect(container.textContent).toContain('品牌直播正片');
  // 默认时钟 12:30Z = 上海 20:30，主片在授权内
  expect(container.textContent).toContain('最终播出：品牌主片《全球发布》');
  // 同时展示三地时钟
  expect(container.textContent).toContain('上海');
  expect(container.textContent).toContain('新加坡');
  expect(container.textContent).toContain('伦敦');
});

it('健康案例体检无冲突', () => {
  render();
  expect(container.textContent).toContain('未发现重叠、空档、地区不匹配');
});

it('应用「临时撤权」情景后，20:30 临界时刻降级到安全垫片', () => {
  render();
  act(() => {
    buttonByText('临时撤权').click();
  });
  // 主片 20:30 已结束（半开区间），区域版 21:00 才开始 → 垫片
  expect(container.textContent).toContain('最终播出：安全垫片（品牌循环片）');
  expect(container.textContent).toContain('已降级到安全垫片');
  // 路径里能看到主片失效的解释
  expect(container.textContent).toContain('授权已于当地边界结束');
});

it('切换地区到伦敦，时间轴与选材随之按当地时间重算', () => {
  render();
  const selects = container.querySelectorAll('select');
  // 工具栏顺序：段落、地区、渠道
  const regionSelect = selects[1] as HTMLSelectElement;
  act(() => {
    regionSelect.value = 'lon';
    regionSelect.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(container.textContent).toContain('授权窗口时间轴 · 伦敦当地时间');
  // 12:30Z = 13:30 BST，伦敦段落 19:00 BST 才开播 → 播出时段外
  expect(container.textContent).toContain('播出时段外');
});

it('撤销可恢复撤权前的选材', () => {
  render();
  act(() => {
    buttonByText('临时撤权').click();
  });
  expect(container.textContent).toContain('安全垫片');
  act(() => {
    buttonByText('撤销').click();
  });
  expect(container.textContent).toContain('最终播出：品牌主片《全球发布》');
});
