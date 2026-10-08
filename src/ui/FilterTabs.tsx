import { Box, Text } from "ink";
import { TABS, type TabId } from "../core/filter.ts";

export const tabLabel = (label: string, count: number) => ` ${label} ${count} `;

export function FilterTabs({ active, counts }: { active: TabId; counts: Record<TabId, number> }) {
  return (
    <Box flexWrap="wrap">
      {TABS.map((tab) => {
        const label = tabLabel(tab.label, counts[tab.id]);
        return tab.id === active ? (
          <Text key={tab.id} inverse bold>
            {label}
          </Text>
        ) : (
          <Text key={tab.id} dimColor={counts[tab.id] === 0}>
            {label}
          </Text>
        );
      })}
    </Box>
  );
}
