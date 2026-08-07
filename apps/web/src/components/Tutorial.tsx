import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { fmt } from '../lib/format';
import { useGame } from '../store';
import { Btn } from './ui';

const STEPS: { title: string; text: string; target?: string; action?: string }[] = [
  {
    title: '认识人口增长',
    text: '初始城市是虚拟城市 A市（1级，位于广东）。每座城市每 10 秒按等级产出人口（1级 +1 … 5级 +5），A市 会随你占领的最高等级真实城市自动升级。顶部“人口”显示当前空闲人口与增速。',
    target: 'population',
  },
  {
    title: '分配生产人口',
    text: '打开“人口与生产”，把部分空闲人口分配到武器、盔甲、战马生产线，为组建军队做准备。',
    target: 'production',
    action: 'production',
  },
  {
    title: '查看训练',
    text: '在“训练”页创建一个小型训练批次（如 100 人）。600 秒后完成，训练后人口可用于合成士兵。',
    target: 'training',
    action: 'training',
  },
  {
    title: '查看初始军队',
    text: '你已拥有 200 名步兵和 1 名初始将领。在“军团”页可将士兵池中的士兵编成军团。',
    target: 'armies',
    action: 'armies',
  },
  {
    title: '进攻清远',
    text: '清远是 A市 虚拟邻接的 2 级城市（新手守军固定 100）。在地图上点击清远，选择将领并填入 200 步兵，确认出征。',
    target: 'qingyuan',
    action: 'map',
  },
  {
    title: '占领反馈',
    text: '占领清远后 A市 自动升为 2 级，人口增速从 +1/10 秒提升至 +4/10 秒（2+2），训练容量也随之提升。多占一座城市，成长多一分。',
  },
];

export default function Tutorial() {
  const state = useGame((s) => s.state);
  const mutate = useGame((s) => s.mutate);
  const selectCity = useGame((s) => s.selectCity);
  const setView = useGame((s) => s.setView);
  const enterProvince = useGame((s) => s.enterProvince);
  const step = state?.tutorialStep ?? 0;
  const [ring, setRing] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 800);
    return () => clearInterval(t);
  }, []);

  const stepData = step >= 1 && step <= 6 ? STEPS[step - 1] : null;

  useEffect(() => {
    if (!stepData?.target) {
      setRing(null);
      return;
    }
    const el = document.querySelector(`[data-tut="${stepData.target}"]`);
    if (el) {
      const r = el.getBoundingClientRect();
      setRing({ x: r.left - 6, y: r.top - 6, w: r.width + 12, h: r.height + 12 });
    } else {
      setRing(null);
    }
  }, [stepData, step, tick]);

  if (!stepData) return null;

  const next = async () => {
    if (stepData.action === 'map') {
      setView('map');
      enterProvince('gd');
      selectCity('qingyuan');
    } else if (stepData.action) {
      setView(stepData.action as never);
      selectCity(null);
    }
    if (step === 6) {
      await mutate(() => api.setTutorialStep(0));
    } else {
      await mutate(() => api.setTutorialStep(step + 1));
    }
  };

  const skip = async () => {
    await mutate(() => api.setTutorialStep(0));
  };

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      {ring && (
        <div
          className="absolute border-2 border-gold rounded-lg pointer-events-none"
          style={{ left: ring.x, top: ring.y, width: ring.w, height: ring.h }}
        />
      )}
      <div className="absolute inset-x-0 bottom-0 md:bottom-6 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[560px] p-4 pointer-events-auto">
        <div className="bg-panel border border-gold/50 rounded-xl p-4 rise-in">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gold mb-1">新手引导 · {step}/6</div>
            <button className="text-xs text-muted hover:text-text cursor-pointer" onClick={skip}>跳过</button>
          </div>
          <div className="font-bold text-gold2 mb-1">{stepData.title}</div>
          <div className="text-sm text-text leading-relaxed">{stepData.text}</div>
          <div className="flex justify-end mt-3">
            <Btn onClick={next}>{step === 6 ? '完成' : '下一步'}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
