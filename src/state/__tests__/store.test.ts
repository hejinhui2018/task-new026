import { describe, expect, it } from 'vitest';
import { createStore } from '../store';
import { seedDoc } from '../../domain/seed';
import { setChain } from '../../domain/edit';

describe('store：撤销 / 重做 / 复位 / 快照', () => {
  it('commit 进入历史，undo/redo 往返', () => {
    const store = createStore();
    const initial = store.getState().doc;
    const modified = setChain(initial, 'seg-live', ['ast-pad']);

    store.commitDoc(modified);
    expect(store.getState().doc).toEqual(modified);
    expect(store.getState().past).toHaveLength(1);

    store.undo();
    expect(store.getState().doc).toEqual(initial);
    expect(store.getState().future).toHaveLength(1);

    store.redo();
    expect(store.getState().doc).toEqual(modified);
  });

  it('新修改清空 redo 栈', () => {
    const store = createStore();
    store.commitDoc(setChain(store.getState().doc, 'seg-live', ['ast-pad']));
    store.undo();
    store.commitDoc(setChain(store.getState().doc, 'seg-live', ['ast-main']));
    expect(store.getState().future).toHaveLength(0);
  });

  it('一键复位恢复内置案例，且可撤销找回', () => {
    const store = createStore();
    store.commitDoc(setChain(store.getState().doc, 'seg-live', ['ast-pad']));
    store.resetAll();
    expect(store.getState().doc).toEqual(seedDoc());
    store.undo();
    expect(store.getState().doc.segments.find((s) => s.id === 'seg-live')?.chain).toEqual(['ast-pad']);
  });

  it('快照保存 / 载入往返', () => {
    const store = createStore();
    const original = store.getState().doc;
    store.saveSnapshot('基线');
    store.commitDoc(setChain(store.getState().doc, 'seg-live', ['ast-pad']));
    const snapId = store.getState().snapshots[0].id;
    store.loadSnapshot(snapId);
    expect(store.getState().doc).toEqual(original);
  });

  it('删除快照', () => {
    const store = createStore();
    store.saveSnapshot('A');
    const id = store.getState().snapshots[0].id;
    store.deleteSnapshot(id);
    expect(store.getState().snapshots).toHaveLength(0);
  });

  it('同一输入重复演练：两个全新 store 的初始方案一致', () => {
    expect(createStore().getState().doc).toEqual(createStore().getState().doc);
  });
});
