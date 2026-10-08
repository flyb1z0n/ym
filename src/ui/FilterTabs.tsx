import { Box, Text } from "ink";
import { TABS, type TabId } from "../core/filter.ts";

export function FilterTabs({ active, counts }: { active: TabId; counts: Record<TabId, number> }) {
  return (
    <Box>
      <Text bold color="green">
        {" ym "}
      </Text>
      {TABS.map((tab, i) => {
        const label = ` ${i + 1} ${tab.label} ${counts[tab.id]} `;
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
