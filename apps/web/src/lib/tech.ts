import type { TechKey } from '@timewar/shared';
import { balance } from './game';

export const TECH_DEFS: { key: TechKey; label: string; desc: string; effectPerLevel: number }[] = [
  { key: 'siege', label: balance.tech.siege.label, desc: balance.tech.siege.desc, effectPerLevel: balance.tech.siege.effectPerLevel },
  { key: 'logistics', label: balance.tech.logistics.label, desc: balance.tech.logistics.desc, effectPerLevel: balance.tech.logistics.effectPerLevel },
  { key: 'smithing', label: balance.tech.smithing.label, desc: balance.tech.smithing.desc, effectPerLevel: balance.tech.smithing.effectPerLevel },
  { key: 'agronomy', label: balance.tech.agronomy.label, desc: balance.tech.agronomy.desc, effectPerLevel: balance.tech.agronomy.effectPerLevel },
  { key: 'discipline', label: balance.tech.discipline.label, desc: balance.tech.discipline.desc, effectPerLevel: balance.tech.discipline.effectPerLevel },
  { key: 'command', label: balance.tech.command.label, desc: balance.tech.command.desc, effectPerLevel: balance.tech.command.effectPerLevel },
  { key: 'talismanMastery', label: balance.tech.talismanMastery.label, desc: balance.tech.talismanMastery.desc, effectPerLevel: balance.tech.talismanMastery.effectPerLevel },
];
